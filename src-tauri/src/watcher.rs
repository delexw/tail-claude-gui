use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::mpsc;

use crate::convert::*;
use crate::parser::chunk::build_chunks;
use crate::parser::classify::ClassifiedMsg;
use crate::parser::ongoing::OngoingChecker;
use crate::parser::session::{read_session_with_debug_hooks, IncrementalTokenScanner};
use crate::parser::subagent::{discover_and_link_all, inject_orphan_subagents};
use crate::parser::team::reconstruct_teams;

const WATCHER_DEBOUNCE: Duration = Duration::from_millis(200);

/// Run a debounced file-change loop: receive notify events, apply `filter`,
/// and send a signal after `WATCHER_DEBOUNCE` of quiet time.
fn run_debounce_loop(
    rx: std::sync::mpsc::Receiver<Result<notify::Event, notify::Error>>,
    filter: impl Fn(&notify::Event) -> bool,
    signal_tx: mpsc::Sender<()>,
) {
    let mut debounce_timer: Option<std::time::Instant> = None;

    loop {
        match rx.recv_timeout(Duration::from_millis(100)) {
            Ok(Ok(event)) => {
                if filter(&event) {
                    debounce_timer = Some(std::time::Instant::now());
                }
            }
            Ok(Err(_)) => {}
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
        }

        if let Some(timer) = debounce_timer {
            if timer.elapsed() >= WATCHER_DEBOUNCE {
                debounce_timer = None;
                let _ = signal_tx.try_send(());
            }
        }
    }
}

/// Handle for stopping a file watcher (session or picker).
pub struct WatcherHandle {
    stop_tx: mpsc::Sender<()>,
}

impl WatcherHandle {
    pub fn stop(&self) {
        let _ = self.stop_tx.try_send(());
    }
}

/// Serializable session update event.
#[derive(Clone, serde::Serialize)]
struct SessionUpdatePayload {
    messages: Vec<DisplayMessage>,
    teams: Vec<crate::parser::team::TeamSnapshot>,
    ongoing: bool,
    permission_mode: String,
    session_totals: crate::convert::SessionTotals,
}

/// Start watching a session file. Emits "session-update" events on changes.
pub fn start_session_watcher(path: String, app: AppHandle) -> WatcherHandle {
    let (stop_tx, mut stop_rx) = mpsc::channel::<()>(1);
    let (signal_tx, mut signal_rx) = mpsc::channel::<()>(4);

    let path_clone = path.clone();
    let signal_tx_clone = signal_tx.clone();

    // Spawn the file watcher thread (notify requires std thread).
    std::thread::spawn(move || {
        let signal_tx = signal_tx_clone;
        let path = path_clone;

        let (tx, rx) = std::sync::mpsc::channel();
        let mut watcher = match RecommendedWatcher::new(tx, Config::default()) {
            Ok(w) => w,
            Err(_) => return,
        };

        // Watch the project directory recursively — catches the session file,
        // team session files, and subagent files in any subdirectory (including
        // subagent directories created after the watcher starts).
        let project_dir = Path::new(&path).parent().unwrap_or(Path::new(""));
        let _ = watcher.watch(project_dir, RecursiveMode::Recursive);

        // Only react to changes in this session's files — not other sessions.
        let session_file = path.clone();
        let session_base = Path::new(&path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        let project_dir_str = project_dir.to_string_lossy().to_string();

        run_debounce_loop(
            rx,
            move |event| {
                event.paths.iter().any(|p| {
                    let ps = p.to_string_lossy();
                    // Exact match on the session file.
                    if ps == session_file {
                        return true;
                    }
                    // Files inside this session's subdirectory (subagents, etc.).
                    if let Some(parent) = p.parent() {
                        let parent_str = parent.to_string_lossy();
                        if parent_str.contains(&session_base) {
                            return p.extension().map(|e| e == "jsonl").unwrap_or(false);
                        }
                    }
                    // New team session files directly in the project directory.
                    if let Some(parent) = p.parent() {
                        if parent.to_string_lossy() == project_dir_str {
                            return p.extension().map(|e| e == "jsonl").unwrap_or(false);
                        }
                    }
                    false
                })
            },
            signal_tx,
        );
    });

    // Spawn the async rebuild loop.
    let path_for_rebuild = path.clone();
    tauri::async_runtime::spawn(async move {
        let mut token_scanner = IncrementalTokenScanner::new();
        let mut prev_msg_count: usize = 0;
        let mut prev_item_count: usize = 0;
        let mut prev_ongoing = false;
        let mut prev_file_size: u64 = 0;

        // Seed the token scanner with the initial file content.
        token_scanner.scan_new_bytes(&path_for_rebuild);

        loop {
            tokio::select! {
                _ = stop_rx.recv() => {
                    break;
                }
                Some(()) = signal_rx.recv() => {
                    // Detect file truncation (e.g. after /clear): reset state
                    // so the next emit fires with the fresh content.
                    let file_size = std::fs::metadata(&path_for_rebuild)
                        .map(|m| m.len())
                        .unwrap_or(0);
                    if file_size < prev_file_size {
                        prev_msg_count = 0;
                        prev_item_count = 0;
                        token_scanner = IncrementalTokenScanner::new();
                    }
                    prev_file_size = file_size;

                    // Re-read the full session from scratch on every event.
                    // Using a local variable (dropped at end of each iteration)
                    // avoids holding all classified messages in memory for the
                    // entire session lifetime — which caused multi-GB growth
                    // for long sessions with large tool inputs/outputs.
                    let all_classified = match read_session_with_debug_hooks(&path_for_rebuild) {
                        Ok((msgs, _, _)) => msgs,
                        Err(_) => continue,
                    };

                    let mut chunks = build_chunks(&all_classified);

                    let (mut all_procs, color_map) = discover_and_link_all(&path_for_rebuild, &chunks);
                    inject_orphan_subagents(&mut chunks, &mut all_procs);

                    let ongoing = OngoingChecker::new(&chunks, &all_procs, &path_for_rebuild).is_ongoing();

                    // Share ongoing status with AppState so the picker can use it.
                    if let Some(state) = app.try_state::<crate::state::AppState>() {
                        state.set_watched_ongoing(path_for_rebuild.clone(), ongoing);
                    }

                    let teams = reconstruct_teams(&chunks, &all_procs);
                    let messages = chunks_to_messages(&chunks, &all_procs, &color_map);

                    // Skip emit if nothing meaningful changed.
                    // Track both message count and total item count so that hook
                    // events (which are added inside existing AI chunks without
                    // creating a new top-level message) still trigger an emit.
                    let msg_count = messages.len();
                    let item_count: usize = messages.iter().map(|m| m.items.len()).sum();
                    if msg_count == prev_msg_count
                        && item_count == prev_item_count
                        && !ongoing
                        && !prev_ongoing
                    {
                        // Token totals may still have changed — update scanner
                        // but skip the expensive emit + serialize.
                        token_scanner.scan_new_bytes(&path_for_rebuild);
                        continue;
                    }
                    prev_msg_count = msg_count;
                    prev_item_count = item_count;
                    prev_ongoing = ongoing;

                    // Extract last permission_mode from UserMsg entries.
                    let mut permission_mode = String::from("default");
                    for msg in all_classified.iter().rev() {
                        if let ClassifiedMsg::User(u) = msg {
                            if !u.permission_mode.is_empty() {
                                permission_mode = u.permission_mode.clone();
                                break;
                            }
                        }
                    }

                    // Incrementally scan only new bytes for token totals.
                    let session_totals = token_scanner.scan_new_bytes(&path_for_rebuild);

                    let payload = SessionUpdatePayload {
                        messages,
                        teams,
                        ongoing,
                        permission_mode,
                        session_totals,
                    };

                    // Broadcast to SSE clients (HTTP API).
                    if let Some(state) = app.try_state::<crate::state::AppState>() {
                        if let Ok(json) = serde_json::to_string(&payload) {
                            state.broadcast("session-update", &json);
                        }
                    }

                    let _ = app.emit("session-update", payload);
                }
            }
        }
    });

    WatcherHandle { stop_tx }
}

/// Serializable picker refresh event.
#[derive(Clone, serde::Serialize)]
struct PickerRefreshPayload {
    sessions: Vec<crate::parser::session::SessionInfo>,
}

/// Start watching project directories for new/changed sessions.
pub fn start_picker_watcher(project_dirs: Vec<String>, app: AppHandle) -> WatcherHandle {
    let (stop_tx, mut stop_rx) = mpsc::channel::<()>(1);
    let (signal_tx, mut signal_rx) = mpsc::channel::<()>(4);

    // Derive unique parent directories (e.g. ~/.claude/projects) from the
    // individual project dirs. Watching the parent instead of individual
    // subdirs ensures newly created project directories are detected
    // automatically — no re-registration needed when new projects appear.
    let mut seen_parents = std::collections::HashSet::new();
    let base_dirs: Vec<std::path::PathBuf> = project_dirs
        .iter()
        .filter_map(|d| Path::new(d).parent().map(|p| p.to_path_buf()))
        .filter(|p| seen_parents.insert(p.clone()))
        .collect();
    // Fallback to individual dirs if parent derivation yielded nothing.
    let watch_dirs: Vec<std::path::PathBuf> = if base_dirs.is_empty() {
        project_dirs.iter().map(std::path::PathBuf::from).collect()
    } else {
        base_dirs.clone()
    };

    let signal_tx_clone = signal_tx.clone();

    // Spawn the file watcher thread.
    std::thread::spawn(move || {
        let signal_tx = signal_tx_clone;
        let (tx, rx) = std::sync::mpsc::channel();
        let mut watcher = match RecommendedWatcher::new(tx, Config::default()) {
            Ok(w) => w,
            Err(_) => return,
        };

        for dir in &watch_dirs {
            if dir.exists() {
                let _ = watcher.watch(dir, RecursiveMode::Recursive);
            }
        }

        run_debounce_loop(
            rx,
            |event| {
                event.paths.iter().any(|p| {
                    let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                    name.ends_with(".jsonl")
                })
            },
            signal_tx,
        );
    });

    // Spawn the async refresh loop.
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::select! {
                _ = stop_rx.recv() => {
                    break;
                }
                Some(()) = signal_rx.recv() => {
                    // Re-enumerate subdirs fresh from the base dirs on every
                    // event so newly created project directories are included.
                    let current_dirs: Vec<String> = base_dirs
                        .iter()
                        .flat_map(|base| {
                            std::fs::read_dir(base)
                                .ok()
                                .into_iter()
                                .flatten()
                                .flatten()
                                .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
                                .map(|e| e.path().to_string_lossy().to_string())
                        })
                        .collect();

                    // Use the session cache for efficient rescanning —
                    // only files whose (mod_time, size) changed get reparsed.
                    let mut sessions = if let Some(state) = app.try_state::<crate::state::AppState>() {
                        let cache = match state.session_cache.lock() {
                            Ok(c) => c,
                            Err(_) => continue,
                        };
                        cache.discover_all_project_sessions(&current_dirs)
                            .unwrap_or_default()
                    } else {
                        crate::parser::session::discover_all_project_sessions(&current_dirs)
                            .unwrap_or_default()
                    };

                    // Apply the session watcher's ongoing status (more accurate
                    // than the picker's lightweight metadata scan).
                    if let Some(state) = app.try_state::<crate::state::AppState>() {
                        state.apply_watched_ongoing(&mut sessions);
                    }

                    let payload = PickerRefreshPayload { sessions };

                    // Broadcast to SSE clients (HTTP API).
                    if let Some(state) = app.try_state::<crate::state::AppState>() {
                        if let Ok(json) = serde_json::to_string(&payload) {
                            state.broadcast("picker-refresh", &json);
                        }
                    }

                    let _ = app.emit("picker-refresh", payload);
                }
            }
        }
    });

    WatcherHandle { stop_tx }
}
