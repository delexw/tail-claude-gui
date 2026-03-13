use serde::Serialize;
use tauri::State;

use crate::state::AppState;

/// Response for the frontend — always includes both the configured and default paths.
#[derive(Serialize)]
pub struct SettingsResponse {
    /// The user-configured path, or null if using the default.
    pub projects_dir: Option<String>,
    /// The platform default path (e.g. ~/.claude/projects). Always present.
    pub default_dir: String,
}

fn default_projects_dir() -> String {
    crate::parser::session::claude_projects_dir(None)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default()
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<SettingsResponse, String> {
    let guard = state.settings.lock().map_err(|e| e.to_string())?;
    Ok(SettingsResponse {
        projects_dir: guard.projects_dir.clone(),
        default_dir: default_projects_dir(),
    })
}

#[tauri::command]
pub async fn set_projects_dir(
    path: Option<String>,
    state: State<'_, AppState>,
) -> Result<SettingsResponse, String> {
    if let Some(ref p) = path {
        let pb = std::path::PathBuf::from(p);
        if !pb.exists() {
            return Err(format!("path does not exist: {p}"));
        }
        if !pb.is_dir() {
            return Err(format!("path is not a directory: {p}"));
        }
    }

    let mut guard = state.settings.lock().map_err(|e| e.to_string())?;
    guard.projects_dir = path;
    crate::settings::save_settings(&guard)?;
    Ok(SettingsResponse {
        projects_dir: guard.projects_dir.clone(),
        default_dir: default_projects_dir(),
    })
}
