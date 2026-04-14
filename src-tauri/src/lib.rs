pub mod auth;
pub mod core;
pub mod ui;

use crate::auth::{microsoft::MicrosoftAuth, AuthResponse, AuthStrategy};
use crate::core::install::InstallService;
use crate::core::launch::args::LaunchArguments;
use crate::core::launch::LaunchService;
use crate::core::session::{Session, SessionManager};
use crate::core::settings::{AppSettings, SettingsManager};
use crate::core::sync::SyncService;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

use serde::{Deserialize, Serialize};
use std::sync::Mutex;

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
async fn get_sessions(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<Session>, String> {
    let sessions =
        SessionManager::fetch_sessions("https://galade.fr/launched/servers.json").await?;

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
    state: tauri::State<'_, AppState>,
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
    install_service
        .install_for_session(&window, &session)
        .await?;

    // 2. Sync session-specific files
    std::fs::create_dir_all(&session_dir).map_err(|e| e.to_string())?;
    sync_service
        .sync(&window, &session_dir, &session.sync_url, &session.sync_dir)
        .await
}

#[tauri::command]
async fn launch_game(
    session: Option<Session>,
    show_logs: bool,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let launch_service = LaunchService;
    let base_dir = app_handle.path().app_data_dir().unwrap();

    // Use provided session or fallback to active session in state
    let session = session
        .or_else(|| state.active_session.lock().unwrap().clone())
        .ok_or_else(|| "No session selected".to_string())?;

    let session_dir = base_dir.join("sessions").join(&session.name);

    // Get auth: try keychain first
    let settings = SettingsManager::load(&app_handle);
    let accounts = crate::auth::secrets::SecretManager::get_all_accounts().unwrap_or_default();
    
    let auth = if let Some(ref active_uuid) = settings.active_account_uuid {
        accounts.into_iter().find(|a| a.uuid == *active_uuid)
    } else if let Some(first) = accounts.into_iter().next() {
        Some(first)
    } else {
        None
    }.ok_or_else(|| "Not authenticated. Please login first.".to_string())?;

    let args = LaunchArguments::from_session(&session, &session_dir, &auth)?;
    
    // Create log window if enabled before launching
    if show_logs {
        let _ = WebviewWindowBuilder::new(&app_handle, "logs", WebviewUrl::App("logs.html".into()))
            .title("Minecraft Output Console")
            .inner_size(700.0, 450.0)
            .build();
    }

    launch_service.launch(args, show_logs, &app_handle)
}

#[tauri::command]
async fn open_session_switcher(window: tauri::WebviewWindow) -> Result<(), String> {
    window
        .eval("window.location.href = '/'")
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_system_ram() -> Result<u32, String> {
    use sysinfo::System;
    let mut sys = System::new_all();
    sys.refresh_memory();
    Ok((sys.total_memory() / 1024 / 1024) as u32)
}

#[tauri::command]
async fn get_auth(app_handle: tauri::AppHandle) -> Result<Option<AuthResponse>, String> {
    let settings = SettingsManager::load(&app_handle);
    let accounts = crate::auth::secrets::SecretManager::get_all_accounts().unwrap_or_default();
    
    // Return active if saved in settings
    if let Some(ref active_uuid) = settings.active_account_uuid {
        if let Some(acc) = accounts.iter().find(|a| a.uuid == *active_uuid) {
            return Ok(Some(acc.clone()));
        }
    }
    
    // Fallback to the first account available
    if !accounts.is_empty() {
        let mut new_settings = settings.clone();
        new_settings.active_account_uuid = Some(accounts[0].uuid.clone());
        let _ = SettingsManager::save(&app_handle, &new_settings);
        return Ok(Some(accounts[0].clone()));
    }
    
    Ok(None)
}

#[tauri::command]
async fn get_all_accounts() -> Result<Vec<AuthResponse>, String> {
    crate::auth::secrets::SecretManager::get_all_accounts()
}

#[tauri::command]
async fn set_active_account(app_handle: tauri::AppHandle, uuid: String) -> Result<(), String> {
    let mut settings = SettingsManager::load(&app_handle);
    settings.active_account_uuid = Some(uuid);
    SettingsManager::save(&app_handle, &settings)
}

#[tauri::command]
async fn remove_account(uuid: String) -> Result<(), String> {
    crate::auth::secrets::SecretManager::remove_account(&uuid)
}

#[tauri::command]
async fn has_auth(_app_handle: tauri::AppHandle) -> Result<bool, String> {
    let accounts = crate::auth::secrets::SecretManager::get_all_accounts().unwrap_or_default();
    Ok(!accounts.is_empty())
}

#[tauri::command]
async fn login_microsoft(
    window: tauri::Window,
    app_handle: tauri::AppHandle,
) -> Result<AuthResponse, String> {
    let auth_strategy = MicrosoftAuth;
    let response = auth_strategy.authenticate(&window).await?;

    let _ = crate::auth::secrets::SecretManager::add_account(response.clone());
    
    let mut settings = SettingsManager::load(&app_handle);
    settings.active_account_uuid = Some(response.uuid.clone());
    let _ = SettingsManager::save(&app_handle, &settings);

    Ok(response)
}

#[tauri::command]
async fn logout(app_handle: tauri::AppHandle) -> Result<(), String> {
    let settings = SettingsManager::load(&app_handle);
    if let Some(active) = &settings.active_account_uuid {
        let _ = crate::auth::secrets::SecretManager::remove_account(active);
    }
    let mut new_settings = settings.clone();
    new_settings.active_account_uuid = None;
    let _ = SettingsManager::save(&app_handle, &new_settings);
    Ok(())
}

#[tauri::command]
async fn get_settings(app_handle: tauri::AppHandle) -> Result<AppSettings, String> {
    Ok(SettingsManager::load(&app_handle))
}

#[tauri::command]
async fn save_settings(app_handle: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    SettingsManager::save(&app_handle, &settings)
}

#[tauri::command]
async fn ping_service(url: String) -> Result<bool, String> {
    match reqwest::get(&url).await {
        Ok(res) => {
            // As long as the server responds (even a 400 for bad path), the infrastructure is up.
            // A 500+ usually means an infrastructure downtime.
            let status = res.status().as_u16();
            Ok(status < 500)
        }
        Err(_) => Ok(false)
    }
}


#[tauri::command]
async fn fetch_json(url: String) -> Result<serde_json::Value, String> {
    reqwest::get(url)
        .await
        .map_err(|e| e.to_string())?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            get_sessions,
            sync_session,
            launch_game,
            login_microsoft,
            get_auth,
            has_auth,
            logout,
            open_session_switcher,
            get_settings,
            save_settings,
            ping_service,
            get_system_ram,
            get_all_accounts,
            set_active_account,
            remove_account,
            fetch_json
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
