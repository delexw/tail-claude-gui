use std::path::PathBuf;
use std::sync::{Mutex, RwLock};
use std::time::{Duration, Instant};
use tokio::sync::broadcast;

use std::collections::HashMap;

use crate::auth::{AuthMode, ClientIdentity, ResolvedAuth};
use crate::clients::{self, Client, ClientRegistry};
use crate::convert::{DisplayMessage, LoadResult};
use crate::jwt::Claims;
use crate::parser::cache::SessionCache;
use crate::parser::session::{Liveness, LivenessCache, SessionInfo, SessionNamesCache};
use crate::session_load::{
    build_light_session, build_session, slice_light, LightBuild, LoadOptions, TimeFilter,
};
use crate::settings::Settings;
use crate::watcher::WatcherHandle;

/// A Server-Sent Event destined for browser clients.
#[derive(Clone, Debug)]
pub struct SseEvent {
    /// Event name, e.g. "session-update" or "picker-refresh".
    pub event: String,
    /// JSON-serialized payload.
    pub data: String,
}

/// Short-lived cache for the picker's session list. Multiple concurrent
/// callers within the TTL window share one disk scan.
struct SessionsCache {
    dirs: Vec<String>,
    cached_at: Instant,
    sessions: Vec<SessionInfo>,
}

const SESSIONS_CACHE_TTL: Duration = Duration::from_secs(2);

/// TTL for the live session-name registry scan. Short enough that `/rename`
/// names (and their removal) appear within roughly one picker-refresh cycle,
/// long enough that a burst of refreshes shares a single scan.
const SESSION_NAMES_CACHE_TTL: Duration = Duration::from_secs(1);

/// TTL for the computed-liveness cache (registry scan + `is_pid_alive` checks).
/// Mirrors [`SESSION_NAMES_CACHE_TTL`] so both registry joins share the same
/// freshness window and the same picker-refresh cache-sharing story.
const LIVENESS_CACHE_TTL: Duration = Duration::from_secs(1);

/// A lightened session build cached for the active session, keyed by
/// `(path, size)`. Lets range fetches during list scrolling slice an
/// already-built session instead of re-parsing the file on every scroll step.
/// Holds only the heavy-body-stripped messages — the full tool output is never
/// persisted here (see [`AppState::full_message_at`], which re-parses fresh and
/// discards the heavy build immediately after each detail lookup, trading
/// per-click latency for not holding tool output in memory between clicks).
struct CachedLight {
    path: String,
    size: u64,
    light: LightBuild,
}

/// AppState holds shared state managed by Tauri.
pub struct AppState {
    pub session_watcher: Mutex<Option<WatcherHandle>>,
    pub picker_watcher: Mutex<Option<WatcherHandle>>,
    pub session_cache: Mutex<SessionCache>,
    pub settings: Mutex<Settings>,
    /// Live client-verification mode (see `crate::auth`), read on every request.
    pub auth: RwLock<AuthMode>,
    /// Accepted clients — the source of truth for revocation and reissue.
    pub clients: RwLock<ClientRegistry>,
    /// The `web-ui` client's current credential, issued as the same-origin
    /// cookie; `None` when disabled or revoked.
    pub web_ui_credential: RwLock<Option<String>>,
    /// Config dir holding `clients.json` and `clients/*.jwt`. `None` means
    /// in-memory only (ephemeral key, or tests — which must never touch a
    /// developer's real files).
    pub config_root: RwLock<Option<PathBuf>>,
    /// Ongoing status reported by the session watcher for the currently viewed session.
    /// (session_path, is_ongoing) — kept in sync by the session watcher loop.
    pub watched_session_ongoing: Mutex<Option<(String, bool)>>,
    /// Broadcast channel for SSE — watchers send events here, HTTP clients subscribe.
    pub event_tx: broadcast::Sender<SseEvent>,
    /// 2-second TTL cache for the picker session list.
    sessions_cache: Mutex<Option<SessionsCache>>,
    /// Short-TTL cache for the live `/rename` session-name registry, shared by
    /// all concurrent `discover_sessions_cached` callers.
    session_names_cache: Mutex<SessionNamesCache>,
    /// Short-TTL cache for computed session liveness (registry scan + the
    /// per-entry `is_pid_alive`/`kill -0` checks), shared by all concurrent
    /// `discover_sessions_cached` callers so the picker-refresh broadcast
    /// fan-out shares one round of liveness checks instead of spawning a
    /// `kill` subprocess per live session per client.
    liveness_cache: Mutex<LivenessCache>,
    /// Lightened-build cache for the active session so windowed list fetches
    /// slice an existing build instead of re-parsing the file on every scroll.
    /// Never holds heavy tool bodies — see [`CachedLight`].
    session_light_cache: Mutex<Option<CachedLight>>,
}

impl AppState {
    /// Everything auth-related is injected (see `crate::auth::resolve_auth`) so
    /// construction itself never touches the filesystem.
    pub fn new(resolved: ResolvedAuth) -> Self {
        let (event_tx, _) = broadcast::channel(64);
        Self {
            session_watcher: Mutex::new(None),
            picker_watcher: Mutex::new(None),
            session_cache: Mutex::new(SessionCache::new()),
            settings: Mutex::new(crate::settings::load_settings()),
            auth: RwLock::new(resolved.mode),
            clients: RwLock::new(resolved.registry),
            web_ui_credential: RwLock::new(resolved.web_ui_credential),
            config_root: RwLock::new(resolved.config_root),
            watched_session_ongoing: Mutex::new(None),
            event_tx,
            sessions_cache: Mutex::new(None),
            session_names_cache: Mutex::new(SessionNamesCache::new()),
            liveness_cache: Mutex::new(LivenessCache::new()),
            session_light_cache: Mutex::new(None),
        }
    }

    /// Test constructor: the given mode, the built-in clients registered in
    /// memory (with a `web-ui` credential when enabled), and **no** config
    /// root — so nothing a test does can reach a developer's real secrets.
    /// Tests that need persistence point at a temp dir via
    /// [`set_config_root`](Self::set_config_root).
    #[cfg(test)]
    pub fn for_tests(mode: AuthMode) -> Self {
        let mut registry = ClientRegistry::default();
        registry.ensure_builtins(clients::now());
        let web_ui_credential = mode.key().and_then(|key| {
            registry
                .find_by_name(clients::WEB_UI)
                .map(|c| crate::auth::issue_credential(c, key, c.issued_at))
        });
        Self::new(ResolvedAuth {
            mode,
            registry,
            web_ui_credential,
            config_root: None,
            warnings: vec![],
        })
    }

    #[cfg(test)]
    pub fn set_config_root(&self, root: Option<PathBuf>) {
        if let Ok(mut g) = self.config_root.write() {
            *g = root;
        }
    }

    fn config_root(&self) -> Option<PathBuf> {
        self.config_root.read().ok().and_then(|g| g.clone())
    }

    /// Clone of the live auth mode, for building `SettingsResponse`.
    pub fn auth_snapshot(&self) -> AuthMode {
        self.auth
            .read()
            .map(|g| g.clone())
            .unwrap_or_else(|poisoned| poisoned.into_inner().clone())
    }

    /// The accepted clients (never their credentials).
    pub fn clients_snapshot(&self) -> Vec<Client> {
        self.clients
            .read()
            .map(|g| g.clients.clone())
            .unwrap_or_else(|poisoned| poisoned.into_inner().clients.clone())
    }

    pub fn web_ui_credential(&self) -> Option<String> {
        self.web_ui_credential.read().ok().and_then(|g| g.clone())
    }

    fn signing_key(&self) -> Result<Vec<u8>, String> {
        self.auth
            .read()
            .map_err(|e| e.to_string())?
            .key()
            .map(<[u8]>::to_vec)
            .ok_or_else(|| {
                "API client verification is disabled (CCTRACE_API_AUTH=off); there are no \
                 client credentials to manage"
                    .to_string()
            })
    }

    fn persist_registry(&self, registry: &ClientRegistry) -> Result<(), String> {
        match self.config_root() {
            Some(root) => registry.save(&crate::auth::registry_path(&root)),
            None => Ok(()),
        }
    }

    /// Keep a built-in client's credential file (and the live `web-ui` cookie
    /// value) in step with a reissue or revocation.
    fn sync_builtin_credential(&self, client: &Client, credential: Option<&str>) {
        if !client.builtin {
            return;
        }
        if let Some(root) = self.config_root() {
            let path = crate::auth::builtin_credential_path(&root, &client.name);
            match credential {
                Some(c) => {
                    if let Err(e) =
                        crate::auth::write_private_atomic(&path, format!("{c}\n").as_bytes())
                    {
                        eprintln!(
                            "HTTP API: WARNING — could not write {}: {e}",
                            path.display()
                        );
                    }
                }
                None => {
                    let _ = std::fs::remove_file(&path);
                }
            }
        }
        if client.name == clients::WEB_UI {
            if let Ok(mut g) = self.web_ui_credential.write() {
                *g = credential.map(str::to_owned);
            }
        }
    }

    /// Register a new client and mint its credential (returned once).
    pub fn register_client(&self, name: &str) -> Result<(Client, String), String> {
        let key = self.signing_key()?;
        let mut registry = self.clients.write().map_err(|e| e.to_string())?;
        let client = registry.register(name, clients::now())?;
        self.persist_registry(&registry)?;
        let credential = crate::auth::issue_credential(&client, &key, client.issued_at);
        Ok((client, credential))
    }

    /// Reissue: mint a new credential and invalidate every older one.
    pub fn reissue_client(&self, id: uuid::Uuid) -> Result<(Client, String), String> {
        let key = self.signing_key()?;
        let mut registry = self.clients.write().map_err(|e| e.to_string())?;
        let client = registry.reissue(id, clients::now())?;
        self.persist_registry(&registry)?;
        let credential = crate::auth::issue_credential(&client, &key, client.issued_at);
        self.sync_builtin_credential(&client, Some(&credential));
        Ok((client, credential))
    }

    /// Revoke: every credential of this client stops working immediately.
    pub fn revoke_client(&self, id: uuid::Uuid) -> Result<Client, String> {
        self.signing_key()?;
        let mut registry = self.clients.write().map_err(|e| e.to_string())?;
        let client = registry.revoke(id, clients::now())?;
        self.persist_registry(&registry)?;
        self.sync_builtin_credential(&client, None);
        Ok(client)
    }

    fn check_registry(&self, id: uuid::Uuid, iat: i64) -> Option<ClientIdentity> {
        let registry = self.clients.read().ok()?;
        let client = registry.find(id)?;
        if client.is_revoked() || iat < client.issued_at {
            return None;
        }
        Some(ClientIdentity {
            id,
            name: client.name.clone(),
        })
    }

    /// Map verified claims to a live client. On a miss, re-read the registry
    /// from disk once — another cctrace process sharing the config dir may
    /// have registered or reissued this client — and retry. Called by the auth
    /// middleware, so the happy path never touches the disk.
    pub fn authenticate(&self, claims: &Claims) -> Option<ClientIdentity> {
        let id = uuid::Uuid::parse_str(&claims.sub).ok()?;
        if let Some(identity) = self.check_registry(id, claims.iat) {
            return Some(identity);
        }
        if self.refresh_clients_from_disk() {
            return self.check_registry(id, claims.iat);
        }
        None
    }

    /// Adopt the on-disk registry (and the `web-ui` credential file) when they
    /// differ from memory. Returns whether anything changed. No-op without a
    /// config root.
    pub fn refresh_clients_from_disk(&self) -> bool {
        let Some(root) = self.config_root() else {
            return false;
        };
        let Ok(on_disk) = ClientRegistry::load(&crate::auth::registry_path(&root)) else {
            return false;
        };
        let changed = match self.clients.read() {
            Ok(g) => *g != on_disk,
            Err(_) => return false,
        };
        if !changed {
            return false;
        }
        if let Ok(mut g) = self.clients.write() {
            *g = on_disk;
        }
        let web_ui = crate::auth::read_trimmed(&crate::auth::builtin_credential_path(
            &root,
            clients::WEB_UI,
        ));
        if let Ok(mut g) = self.web_ui_credential.write() {
            *g = web_ui;
        }
        true
    }

    /// Load a windowed slice of a session, caching the lightened build for the
    /// active session so repeated list range fetches (scrolling) don't re-parse
    /// the file. Never holds heavy tool bodies — see [`full_message_at`] for
    /// those.
    ///
    /// The cache holds one session, keyed by `(path, size)`: a different path or
    /// a grown/truncated file rebuilds it, so memory stays bounded to the active
    /// session. Time-filtered loads bypass the cache (they're rare and would
    /// pollute the single slot).
    ///
    /// [`full_message_at`]: Self::full_message_at
    pub fn load_session_windowed(
        &self,
        path: &str,
        opts: LoadOptions,
    ) -> Result<LoadResult, String> {
        // Time-filtered loads bypass the cache and return full messages (rare,
        // used by the by-id range endpoint).
        if opts.time.since.is_some() || opts.time.before.is_some() {
            return crate::session_load::load_session(path, opts);
        }

        let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        let mut cache = self.session_light_cache.lock().map_err(|e| e.to_string())?;
        let fresh = cache
            .as_ref()
            .is_some_and(|c| c.path == path && c.size == size);
        if !fresh {
            let light = build_light_session(path, TimeFilter::default())?;
            *cache = Some(CachedLight {
                path: path.to_string(),
                size,
                light,
            });
        }
        Ok(slice_light(
            &cache.as_ref().unwrap().light,
            path,
            opts.range,
        ))
    }

    /// Return the full (heavy-body) message at `index` for the detail view.
    ///
    /// Deliberately re-parses the whole session fresh on every call rather than
    /// caching the heavy build: a tool-output-heavy session can be hundreds of
    /// MB, and caching it for as long as the session is open would hold that in
    /// the Rust process the whole time. Re-parsing trades per-click latency
    /// (roughly the same cost as the session's first list load) for never
    /// persisting the heavy bodies between clicks — the full build is dropped
    /// as soon as this function returns.
    pub fn full_message_at(
        &self,
        path: &str,
        index: usize,
    ) -> Result<Option<DisplayMessage>, String> {
        let built = build_session(path, TimeFilter::default())?;
        Ok(built.messages.get(index).cloned())
    }

    /// Drop the lightened-build cache (e.g. when leaving a session for the picker).
    pub fn clear_session_build_cache(&self) {
        if let Ok(mut cache) = self.session_light_cache.lock() {
            *cache = None;
        }
    }

    /// Read the live `/rename` session-name registry through a short-TTL cache so
    /// concurrent/rapid callers share a single disk scan. Falls back to an
    /// uncached scan if the cache lock is poisoned or the home dir is unknown.
    fn live_session_names_cached(&self) -> HashMap<String, String> {
        let dir = match crate::parser::session::live_session_names_dir() {
            Some(d) => d,
            None => return HashMap::new(),
        };
        match self.session_names_cache.lock() {
            Ok(mut cache) => cache.get_or_load(&dir, SESSION_NAMES_CACHE_TTL),
            Err(_) => crate::parser::session::live_session_names(),
        }
    }

    /// Read computed liveness (registry scan + `is_pid_alive`/`kill -0` checks)
    /// through a short-TTL cache so concurrent/rapid callers — and the
    /// picker-refresh broadcast fan-out — share one scan and one round of
    /// liveness checks instead of spawning a `kill` subprocess per live
    /// session on every call. Falls back to an uncached scan+compute if the
    /// cache lock is poisoned.
    fn live_liveness_cached(&self, dir: &std::path::Path) -> HashMap<String, Liveness> {
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        match self.liveness_cache.lock() {
            Ok(mut cache) => cache.get_or_load(dir, LIVENESS_CACHE_TTL, now_ms),
            Err(_) => {
                let reg = crate::parser::session::read_session_registry(dir);
                crate::parser::session::liveness_map_from_registry(&reg, now_ms)
            }
        }
    }

    /// Stop and clear the session watcher if one is running.
    pub fn stop_session_watcher(&self) -> Result<(), String> {
        let mut guard = self.session_watcher.lock().map_err(|e| e.to_string())?;
        if let Some(handle) = guard.take() {
            handle.stop();
        }
        Ok(())
    }

    /// Replace the session watcher with a new handle.
    pub fn set_session_watcher(&self, handle: WatcherHandle) -> Result<(), String> {
        let mut guard = self.session_watcher.lock().map_err(|e| e.to_string())?;
        *guard = Some(handle);
        Ok(())
    }

    /// Stop and clear the picker watcher if one is running.
    pub fn stop_picker_watcher(&self) -> Result<(), String> {
        let mut guard = self.picker_watcher.lock().map_err(|e| e.to_string())?;
        if let Some(handle) = guard.take() {
            handle.stop();
        }
        Ok(())
    }

    /// Replace the picker watcher with a new handle.
    pub fn set_picker_watcher(&self, handle: WatcherHandle) -> Result<(), String> {
        let mut guard = self.picker_watcher.lock().map_err(|e| e.to_string())?;
        *guard = Some(handle);
        Ok(())
    }

    /// Update the ongoing status for the currently watched session.
    pub fn set_watched_ongoing(&self, path: String, ongoing: bool) {
        if let Ok(mut guard) = self.watched_session_ongoing.lock() {
            *guard = Some((path, ongoing));
        }
    }

    /// Clear the watched session ongoing status (e.g. when unwatching).
    pub fn clear_watched_ongoing(&self) {
        if let Ok(mut guard) = self.watched_session_ongoing.lock() {
            *guard = None;
        }
    }

    /// Apply the session watcher's ongoing status to a list of sessions.
    /// The session watcher has the most accurate ongoing detection (full chunk
    /// analysis + subagent tracking), so its verdict overrides the picker's
    /// lightweight metadata scan.
    pub fn apply_watched_ongoing(&self, sessions: &mut [crate::parser::session::SessionInfo]) {
        let guard = match self.watched_session_ongoing.lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        if let Some((ref path, ongoing)) = *guard {
            if let Some(s) = sessions.iter_mut().find(|s| s.path == *path) {
                s.is_ongoing = ongoing;
            }
        }
    }

    /// Discover sessions across `project_dirs`, returning a cached result if
    /// fresh enough. Multiple concurrent callers within the TTL window share
    /// one disk scan.
    pub fn discover_sessions_cached(
        &self,
        project_dirs: &[String],
    ) -> Result<Vec<SessionInfo>, String> {
        let mut cache = self.sessions_cache.lock().map_err(|e| e.to_string())?;
        let fresh = cache
            .as_ref()
            .is_some_and(|c| c.dirs == project_dirs && c.cached_at.elapsed() < SESSIONS_CACHE_TTL);
        let mut sessions = if fresh {
            cache.as_ref().unwrap().sessions.clone()
        } else {
            let session_cache = self.session_cache.lock().map_err(|e| e.to_string())?;
            let sessions = session_cache.discover_all_project_sessions(project_dirs)?;
            *cache = Some(SessionsCache {
                dirs: project_dirs.to_vec(),
                cached_at: Instant::now(),
                sessions: sessions.clone(),
            });
            sessions
        };
        // Release the cache lock before the filesystem work below, so concurrent
        // callers don't serialize behind it.
        drop(cache);
        // Join the live `/rename` names on every call. Names live in the pid-keyed
        // `~/.claude/sessions/*.json` registry, which the transcript-file cache does
        // not track (a rename never touches the JSONL), so the join runs after the
        // cache rather than being baked into the cached `SessionInfo`. The registry
        // read itself is behind its own short-TTL cache so a burst of refreshes and
        // the broadcast fan-out share one disk scan.
        crate::parser::session::apply_session_names(
            &mut sessions,
            &self.live_session_names_cached(),
        );
        // Liveness reads the same registry directory but needs the richer
        // per-entry data (status/pid), not just names, so it joins through its
        // own short-TTL cache (`liveness_cache`) rather than reusing the name
        // cache above. That cache covers both the registry scan and the
        // per-entry `is_pid_alive` ("kill -0") checks, so a burst of refreshes
        // and the broadcast fan-out share one round of liveness checks.
        if let Some(dir) = crate::parser::session::live_session_names_dir() {
            let liveness = self.live_liveness_cached(&dir);
            crate::parser::session::apply_liveness_map(&mut sessions, &liveness);
        }
        Ok(sessions)
    }

    /// Broadcast an SSE event to all connected browser clients.
    pub fn broadcast(&self, event: &str, data: &str) {
        let _ = self.event_tx.send(SseEvent {
            event: event.to_string(),
            data: data.to_string(),
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session_load::MessageRange;
    use std::io::Write;

    fn write_session(dir: &std::path::Path) -> String {
        let path = dir.join("s.jsonl");
        let mut f = std::fs::File::create(&path).unwrap();
        writeln!(
            f,
            r#"{{"type":"user","uuid":"u1","timestamp":"2025-01-01T12:00:00Z","message":{{"role":"user","content":"hello"}}}}"#
        )
        .unwrap();
        writeln!(
            f,
            r#"{{"type":"assistant","uuid":"a1","parentUuid":"u1","timestamp":"2025-01-01T12:00:01Z","message":{{"role":"assistant","model":"claude-sonnet-4-20250514","content":[{{"type":"text","text":"hi there"}}]}}}}"#
        )
        .unwrap();
        writeln!(
            f,
            r#"{{"type":"user","uuid":"u2","parentUuid":"a1","timestamp":"2025-01-01T12:00:02Z","message":{{"role":"user","content":"bye"}}}}"#
        )
        .unwrap();
        path.to_str().unwrap().to_string()
    }

    #[test]
    fn load_session_windowed_returns_window_with_total_count() {
        let dir = tempfile::tempdir().unwrap();
        let path = write_session(dir.path());
        let state = AppState::for_tests(AuthMode::Disabled);

        let full = state
            .load_session_windowed(&path, LoadOptions::full())
            .unwrap();
        assert_eq!(full.count, full.messages.len());
        assert!(full.count >= 3);

        let win = state
            .load_session_windowed(
                &path,
                LoadOptions::window(MessageRange {
                    start: 1,
                    limit: Some(1),
                }),
            )
            .unwrap();
        assert_eq!(win.count, full.count, "count is the total, not the window");
        assert_eq!(win.start, 1);
        assert_eq!(win.messages.len(), 1);
        assert_eq!(win.messages[0].content, full.messages[1].content);
    }

    #[test]
    fn light_cache_serves_repeated_windows_and_clears() {
        let dir = tempfile::tempdir().unwrap();
        let path = write_session(dir.path());
        let state = AppState::for_tests(AuthMode::Disabled);

        // First call builds and caches; second (same path+size) hits the cache
        // and must return identical content.
        let a = state
            .load_session_windowed(&path, LoadOptions::full())
            .unwrap();
        assert!(state.session_light_cache.lock().unwrap().is_some());
        let b = state
            .load_session_windowed(&path, LoadOptions::full())
            .unwrap();
        assert_eq!(a.count, b.count);
        let contents_a: Vec<_> = a.messages.iter().map(|m| &m.content).collect();
        let contents_b: Vec<_> = b.messages.iter().map(|m| &m.content).collect();
        assert_eq!(contents_a, contents_b);

        state.clear_session_build_cache();
        assert!(state.session_light_cache.lock().unwrap().is_none());
        // Still works after clearing (rebuilds).
        let c = state
            .load_session_windowed(&path, LoadOptions::full())
            .unwrap();
        assert_eq!(c.count, a.count);
    }

    #[test]
    fn full_message_at_works_without_a_warm_light_cache() {
        let dir = tempfile::tempdir().unwrap();
        let path = write_session(dir.path());
        let state = AppState::for_tests(AuthMode::Disabled);

        // No list load has happened yet — full_message_at must not depend on
        // the light cache being populated first.
        assert!(state.session_light_cache.lock().unwrap().is_none());
        let msg = state.full_message_at(&path, 1).unwrap();
        assert!(msg.is_some());
        assert_eq!(msg.unwrap().content, "hi there");
    }

    #[test]
    fn full_message_at_never_populates_the_light_cache() {
        let dir = tempfile::tempdir().unwrap();
        let path = write_session(dir.path());
        let state = AppState::for_tests(AuthMode::Disabled);

        state.full_message_at(&path, 0).unwrap();
        state.full_message_at(&path, 1).unwrap();
        // Detail lookups re-parse fresh each time and never persist the heavy
        // build — the light cache (used only by list windows) stays empty.
        assert!(state.session_light_cache.lock().unwrap().is_none());
    }

    #[test]
    fn full_message_at_out_of_range_returns_none() {
        let dir = tempfile::tempdir().unwrap();
        let path = write_session(dir.path());
        let state = AppState::for_tests(AuthMode::Disabled);

        assert!(state.full_message_at(&path, 9999).unwrap().is_none());
    }

    // -- clients & credentials ---------------------------------------------

    const KEY: &[u8] = b"0123456789abcdef0123456789abcdef";

    fn enabled() -> AppState {
        AppState::for_tests(AuthMode::Enabled {
            key: KEY.to_vec(),
            source: crate::auth::KeySource::Ephemeral,
        })
    }

    fn claims_of(credential: &str) -> Claims {
        crate::jwt::verify(credential, KEY).unwrap()
    }

    #[test]
    fn for_tests_registers_builtins_in_memory_with_a_web_ui_credential() {
        let state = enabled();
        let names: Vec<_> = state
            .clients_snapshot()
            .into_iter()
            .map(|c| c.name)
            .collect();
        assert_eq!(names, vec!["web-ui", "tui"]);
        let cred = state.web_ui_credential().expect("web-ui credential");
        assert_eq!(
            state.authenticate(&claims_of(&cred)).unwrap().name,
            "web-ui"
        );
        assert!(
            !state.refresh_clients_from_disk(),
            "no config root → no disk"
        );
        assert!(AppState::for_tests(AuthMode::Disabled)
            .web_ui_credential()
            .is_none());
    }

    #[test]
    fn register_then_authenticate_revoke_and_reissue() {
        let state = enabled();
        let (client, cred) = state.register_client("ci-script").unwrap();
        assert_eq!(
            state.authenticate(&claims_of(&cred)),
            Some(ClientIdentity {
                id: client.id,
                name: "ci-script".into()
            })
        );

        let revoked = state.revoke_client(client.id).unwrap();
        assert!(revoked.is_revoked());
        assert_eq!(state.authenticate(&claims_of(&cred)), None);

        let (reissued, new_cred) = state.reissue_client(client.id).unwrap();
        assert!(!reissued.is_revoked());
        assert_eq!(state.authenticate(&claims_of(&cred)), None, "old is dead");
        assert!(state.authenticate(&claims_of(&new_cred)).is_some());
    }

    #[test]
    fn unknown_or_foreign_claims_are_rejected() {
        let state = enabled();
        let unknown = Claims {
            sub: uuid::Uuid::new_v4().to_string(),
            name: "ghost".into(),
            iat: clients::now(),
        };
        assert_eq!(state.authenticate(&unknown), None);
        let garbage = Claims {
            sub: "not-a-uuid".into(),
            name: "x".into(),
            iat: 0,
        };
        assert_eq!(state.authenticate(&garbage), None);
    }

    #[test]
    fn reissuing_web_ui_swaps_the_cookie_credential_and_revoking_clears_it() {
        let state = enabled();
        let before = state.web_ui_credential().unwrap();
        let web_ui = state
            .clients_snapshot()
            .into_iter()
            .find(|c| c.name == "web-ui")
            .unwrap();
        let (_, after) = state.reissue_client(web_ui.id).unwrap();
        assert_ne!(before, after);
        assert_eq!(state.web_ui_credential().as_deref(), Some(after.as_str()));
        state.revoke_client(web_ui.id).unwrap();
        assert!(state.web_ui_credential().is_none());
    }

    #[test]
    fn disabled_mode_cannot_manage_clients() {
        let state = AppState::for_tests(AuthMode::Disabled);
        assert!(state.register_client("a").unwrap_err().contains("disabled"));
        let id = state.clients_snapshot()[0].id;
        assert!(state.reissue_client(id).is_err());
        assert!(state.revoke_client(id).is_err());
    }

    #[test]
    fn registry_and_builtin_credential_files_are_persisted_under_the_config_root() {
        let dir = tempfile::tempdir().unwrap();
        let state = enabled();
        state.set_config_root(Some(dir.path().to_path_buf()));

        let (client, _) = state.register_client("persisted").unwrap();
        let on_disk = ClientRegistry::load(&crate::auth::registry_path(dir.path())).unwrap();
        assert!(on_disk.find(client.id).is_some());

        let tui = state
            .clients_snapshot()
            .into_iter()
            .find(|c| c.name == "tui")
            .unwrap();
        let (_, cred) = state.reissue_client(tui.id).unwrap();
        let path = crate::auth::builtin_credential_path(dir.path(), "tui");
        assert_eq!(std::fs::read_to_string(&path).unwrap().trim(), cred);
        state.revoke_client(tui.id).unwrap();
        assert!(
            !path.exists(),
            "revoked built-in credential file is removed"
        );
    }

    #[test]
    fn refresh_adopts_a_registry_written_by_another_process() {
        let dir = tempfile::tempdir().unwrap();
        let state = enabled();
        state.set_config_root(Some(dir.path().to_path_buf()));
        // Persist what we have, then let "another process" add a client.
        state.register_client("mine").unwrap();
        let mut other = ClientRegistry::load(&crate::auth::registry_path(dir.path())).unwrap();
        let theirs = other.register("theirs", clients::now()).unwrap();
        other.save(&crate::auth::registry_path(dir.path())).unwrap();
        let cred = crate::auth::issue_credential(&theirs, KEY, theirs.issued_at);

        // Unknown in memory → the middleware path re-reads the disk and accepts.
        assert_eq!(
            state.authenticate(&claims_of(&cred)).map(|i| i.name),
            Some("theirs".to_string())
        );
        assert!(!state.refresh_clients_from_disk(), "already in sync");
    }
}
