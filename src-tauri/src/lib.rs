pub mod core;
pub mod auth;
pub mod ui;

use crate::core::session::{Session, SessionManager};
use crate::core::sync::SyncService;
use crate::core::launch::LaunchService;
use crate::core::launch::args::LaunchArguments;
use crate::auth::{AuthStrategy, AuthResponse, microsoft::MicrosoftAuth};
use tauri::Manager;

#[tauri::command]
async fn get_sessions() -> Result<Vec<Session>, String> {
    SessionManager::fetch_sessions("https://galade.fr/installateur/servers.json").await
}

#[tauri::command]
async fn sync_session(session: Session, app_handle: tauri::AppHandle, window: tauri::Window) -> Result<(), String> {
    let sync_service = SyncService;
    let base_dir = app_handle.path().app_data_dir().unwrap();
    sync_service.sync(&window, &base_dir, &session.sync_url, &session.sync_dir).await
}

#[tauri::command]
async fn launch_game(session: Option<Session>, show_logs: bool, app_handle: tauri::AppHandle) -> Result<(), String> {
    let launch_service = LaunchService;
    let base_dir = app_handle.path().app_data_dir().unwrap();

    let session = session.ok_or_else(|| "No session provided".to_string())?;
    let args = LaunchArguments::from_session(&session, &base_dir)?;
    
    launch_service.launch(args, show_logs)
}

#[tauri::command]
async fn open_session_switcher(window: tauri::WebviewWindow) -> Result<(), String> {
    window.eval("window.location.href = '/'").map_err(|e| e.to_string())
}

#[tauri::command]
async fn login_microsoft() -> Result<AuthResponse, String> {
    let auth = MicrosoftAuth;
    auth.authenticate().await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![get_sessions, sync_session, launch_game, login_microsoft, open_session_switcher])
    .on_page_load(|window, _payload| {
      let _ = crate::ui::bridge::inject_bridge(window);
    })
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
