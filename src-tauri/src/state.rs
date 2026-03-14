use std::sync::Mutex;

use crate::parser::cache::SessionCache;
use crate::settings::Settings;
use crate::watcher::WatcherHandle;

/// AppState holds shared state managed by Tauri.
pub struct AppState {
    pub session_watcher: Mutex<Option<WatcherHandle>>,
    pub picker_watcher: Mutex<Option<WatcherHandle>>,
    pub session_cache: Mutex<SessionCache>,
    pub settings: Mutex<Settings>,
    /// Ongoing status reported by the session watcher for the currently viewed session.
    /// (session_path, is_ongoing) — kept in sync by the session watcher loop.
    pub watched_session_ongoing: Mutex<Option<(String, bool)>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            session_watcher: Mutex::new(None),
            picker_watcher: Mutex::new(None),
            session_cache: Mutex::new(SessionCache::new()),
            settings: Mutex::new(crate::settings::load_settings()),
            watched_session_ongoing: Mutex::new(None),
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
}
