pub mod core;
pub mod auth;
pub mod ui;

use crate::core::session::{Session, SessionManager};
use crate::core::sync::SyncService;
use tauri::Manager;

#[tauri::command]
async fn get_sessions() -> Result<Vec<Session>, String> {
    SessionManager::fetch_sessions("https://galade.fr/installateur/servers.json").await
}

#[tauri::command]
async fn sync_session(session: Session, app_handle: tauri::AppHandle) -> Result<(), String> {
    let sync_service = SyncService;
    let base_dir = app_handle.path().app_data_dir().unwrap();
    sync_service.sync(&base_dir, &session.sync_url, &session.sync_dir).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![get_sessions, sync_session])
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
