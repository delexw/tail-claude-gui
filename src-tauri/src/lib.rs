#![allow(dead_code)]

mod commands;
mod convert;
mod http_api;
mod parser;
mod settings;
mod state;
mod watcher;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(state::AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::session::load_session,
            commands::session::get_session_meta,
            commands::session::watch_session,
            commands::session::unwatch_session,
            commands::session::get_project_dirs,
            commands::picker::discover_sessions,
            commands::picker::watch_picker,
            commands::picker::unwatch_picker,
            commands::git::get_git_info,
            commands::debug::get_debug_log,
            commands::settings::get_settings,
            commands::settings::set_projects_dir,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(http_api::start_http_server(handle));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
