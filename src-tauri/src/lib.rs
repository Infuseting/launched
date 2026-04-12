pub mod core;
pub mod auth;
pub mod ui;

use crate::core::session::{Session, SessionManager};
use crate::core::sync::SyncService;
use crate::core::install::InstallService;
use crate::core::launch::LaunchService;
use crate::core::launch::args::LaunchArguments;
use crate::auth::{AuthStrategy, AuthResponse, microsoft::MicrosoftAuth};
use tauri::Manager;

use std::sync::Mutex;
use serde::{Deserialize, Serialize};

#[derive(Default)]
struct AppState {
    active_session: Mutex<Option<Session>>,
}

#[derive(Serialize, Deserialize, Default)]
struct Prefs {
    last_session_name: Option<String>,
}

fn get_prefs_path(app_handle: &tauri::AppHandle) -> std::path::PathBuf {
    app_handle.path().app_data_dir().unwrap().join("prefs.json")
}

fn save_prefs(app_handle: &tauri::AppHandle, prefs: &Prefs) {
    let path = get_prefs_path(app_handle);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string(prefs) {
        let _ = std::fs::write(path, json);
    }
}

fn load_prefs(app_handle: &tauri::AppHandle) -> Prefs {
    let path = get_prefs_path(app_handle);
    if let Ok(content) = std::fs::read_to_string(path) {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Prefs::default()
    }
}

#[tauri::command]
async fn get_sessions(app_handle: tauri::AppHandle, state: tauri::State<'_, AppState>) -> Result<Vec<Session>, String> {
    let sessions = SessionManager::fetch_sessions("https://galade.fr/installateur/servers.json").await?;
    
    // Check if we have a last session to restore
    let prefs = load_prefs(&app_handle);
    if let Some(last_name) = prefs.last_session_name {
        if let Some(session) = sessions.iter().find(|s| s.name == last_name) {
            let mut active = state.active_session.lock().unwrap();
            if active.is_none() {
                *active = Some(session.clone());
                log::info!("Restored active session from prefs: {}", session.name);
            }
        }
    }
    
    Ok(sessions)
}

#[tauri::command]
async fn sync_session(
    session: Session, 
    app_handle: tauri::AppHandle, 
    window: tauri::Window,
    state: tauri::State<'_, AppState>
) -> Result<(), String> {
    let install_service = InstallService;
    let sync_service = SyncService;
    let base_dir = app_handle.path().app_data_dir().unwrap();
    let session_dir = base_dir.join("sessions").join(&session.name);
    
    // Save as active session
    {
        let mut active = state.active_session.lock().unwrap();
        *active = Some(session.clone());
    }

    // Save to prefs
    let mut prefs = load_prefs(&app_handle);
    prefs.last_session_name = Some(session.name.clone());
    save_prefs(&app_handle, &prefs);

    // 1. Ensure Minecraft and Mod Loader are installed
    install_service.install_for_session(&window, &session).await?;
    
    // 2. Sync session-specific files
    std::fs::create_dir_all(&session_dir).map_err(|e| e.to_string())?;
    sync_service.sync(&window, &session_dir, &session.sync_url, &session.sync_dir).await
}

#[tauri::command]
async fn launch_game(
    session: Option<Session>, 
    show_logs: bool, 
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>
) -> Result<(), String> {
    let launch_service = LaunchService;
    let base_dir = app_handle.path().app_data_dir().unwrap();

    // Use provided session or fallback to active session in state
    let session = session.or_else(|| {
        state.active_session.lock().unwrap().clone()
    }).ok_or_else(|| "No session selected".to_string())?;

    let session_dir = base_dir.join("sessions").join(&session.name);
    
    // Get auth: try keychain first, then local file
    let auth = match crate::auth::secrets::SecretManager::load_auth() {
        Ok(Some(auth)) => {
            log::info!("launch_game: auth loaded from keychain for user: {}", auth.name);
            auth
        },
        _ => {
            // Fallback to local file
            let path = base_dir.join("auth.json");
            if let Ok(content) = std::fs::read_to_string(&path) {
                match serde_json::from_str::<crate::auth::AuthResponse>(&content) {
                    Ok(auth) => {
                        log::info!("launch_game: auth loaded from local file for user: {}", auth.name);
                        auth
                    },
                    Err(e) => return Err(format!("Failed to parse local auth file: {}", e)),
                }
            } else {
                return Err("Not authenticated. Please login first.".to_string());
            }
        }
    };

    let args = LaunchArguments::from_session(&session, &session_dir, &auth)?;
    
    launch_service.launch(args, show_logs)
}

#[tauri::command]
async fn open_session_switcher(window: tauri::WebviewWindow) -> Result<(), String> {
    window.eval("window.location.href = '/'").map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_auth(app_handle: tauri::AppHandle) -> Result<Option<AuthResponse>, String> {
    // Try system keychain first
    match crate::auth::secrets::SecretManager::load_auth() {
        Ok(Some(auth)) => {
            log::info!("Successfully loaded auth from system keychain for user: {}", auth.name);
            return Ok(Some(auth));
        },
        Ok(None) => {
            log::info!("Keychain has no auth entry, checking local auth file...");
        },
        Err(e) => {
            log::warn!("Keychain error ({}), falling back to local auth file...", e);
        }
    }

    // Fallback to local file
    let path = app_handle.path().app_data_dir().unwrap().join("auth.json");
    if let Ok(content) = std::fs::read_to_string(&path) {
        match serde_json::from_str::<AuthResponse>(&content) {
            Ok(auth) => {
                log::info!("Successfully loaded auth from local file for user: {}", auth.name);
                Ok(Some(auth))
            },
            Err(e) => {
                log::warn!("Failed to parse local auth file: {}. Ignoring.", e);
                Ok(None)
            }
        }
    } else {
        log::info!("No local auth file found.");
        Ok(None)
    }
}

#[tauri::command]
async fn has_auth(app_handle: tauri::AppHandle) -> Result<bool, String> {
    // Check keychain
    if let Ok(Some(_)) = crate::auth::secrets::SecretManager::load_auth() {
        return Ok(true);
    }
    // Check local file
    let path = app_handle.path().app_data_dir().unwrap().join("auth.json");
    Ok(path.exists())
}

#[tauri::command]
async fn login_microsoft(window: tauri::Window, app_handle: tauri::AppHandle) -> Result<AuthResponse, String> {
    let auth_strategy = MicrosoftAuth;
    let response = auth_strategy.authenticate(&window).await?;
    
    // Always save to local file first (reliable fallback)
    let path = app_handle.path().app_data_dir().unwrap().join("auth.json");
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let json = serde_json::to_string(&response).map_err(|e| e.to_string())?;
    if let Err(e) = std::fs::write(&path, &json) {
        log::warn!("Failed to save auth to local file: {}", e);
    } else {
        log::info!("Auth saved to local file for user: {}", response.name);
    }

    // Also try system keychain (bonus)
    if let Err(e) = crate::auth::secrets::SecretManager::save_auth(&response) {
        log::warn!("Failed to save to system keychain: {} (local file is used instead)", e);
    } else {
        log::info!("Auth also saved to system keychain.");
    }
    
    Ok(response)
}

#[tauri::command]
async fn logout(app_handle: tauri::AppHandle) -> Result<(), String> {
    let _ = crate::auth::secrets::SecretManager::clear_auth();
    let path = app_handle.path().app_data_dir().unwrap().join("auth.json");
    let _ = std::fs::remove_file(&path);
    log::info!("Auth cleared (keychain + local file).");
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .manage(AppState::default())
    .invoke_handler(tauri::generate_handler![
        get_sessions, 
        sync_session, 
        launch_game, 
        login_microsoft, 
        get_auth,
        has_auth,
        logout,
        open_session_switcher
    ])
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
