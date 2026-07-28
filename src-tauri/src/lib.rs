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
async fn get_active_session_name(app_handle: tauri::AppHandle) -> Result<Option<String>, String> {
    let prefs = load_prefs(&app_handle);
    Ok(prefs.last_session_name)
}

#[tauri::command]
async fn set_active_session(app_handle: tauri::AppHandle, name: String) -> Result<(), String> {
    let mut prefs = load_prefs(&app_handle);
    prefs.last_session_name = Some(name);
    save_prefs(&app_handle, &prefs);
    Ok(())
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
    crack_pseudo: Option<String>,
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
    let mut auth = if let Some(pseudo) = crack_pseudo {
        log::info!("Launching in crack mode with pseudo: {}", pseudo);
        AuthResponse {
            uuid: "00000000-0000-0000-0000-000000000000".to_string(),
            name: pseudo,
            access_token: "offline".to_string(),
            refresh_token: None,
        }
    } else {
        let mut settings = SettingsManager::load(&app_handle);
        let accounts = crate::auth::secrets::SecretManager::get_all_accounts(&app_handle).unwrap_or_default();
        
        let mut auth = settings
            .active_account_uuid
            .as_ref()
            .and_then(|active_uuid| accounts.iter().find(|a| a.uuid == *active_uuid).cloned())
            .or_else(|| accounts.into_iter().next())
            .ok_or_else(|| "Not authenticated. Please login first.".to_string())?;

        // Validate token before launch; if expired, try refresh_token once.
        if !MicrosoftAuth::is_mc_token_valid(&auth.access_token).await {
            log::warn!("Stored Minecraft token is invalid/expired for account {}", auth.name);

            if let Some(refresh_token) = auth.refresh_token.clone() {
                match MicrosoftAuth.refresh_auth(&refresh_token).await {
                    Ok(refreshed) => {
                        log::info!("Successfully refreshed Minecraft auth for {}", refreshed.name);
                        crate::auth::secrets::SecretManager::add_account(&app_handle, refreshed.clone()).map_err(|e| e.to_string())?;

                        settings.active_account_uuid = Some(refreshed.uuid.clone());
                        let _ = SettingsManager::save(&app_handle, &settings);

                        auth = refreshed;
                    }
                    Err(e) => {
                        log::warn!("Failed to refresh Minecraft auth: {}", e);
                        if e.contains("invalid_grant") || e.contains("invalid_request") {
                            let _ = crate::auth::secrets::SecretManager::remove_account(&app_handle, &auth.uuid);
                            if settings.active_account_uuid.as_deref() == Some(auth.uuid.as_str()) {
                                settings.active_account_uuid = None;
                                let _ = SettingsManager::save(&app_handle, &settings);
                            }
                            return Err(
                                "Session Minecraft expiree. Le compte a ete supprime, merci de vous reconnecter avec Microsoft."
                                    .to_string()
                            );
                        } else {
                            return Err(format!("Erreur lors de l'authentification Minecraft: {}", e));
                        }
                    }
                }
            } else {
                let _ = crate::auth::secrets::SecretManager::remove_account(&app_handle, &auth.uuid);
                if settings.active_account_uuid.as_deref() == Some(auth.uuid.as_str()) {
                    settings.active_account_uuid = None;
                    let _ = SettingsManager::save(&app_handle, &settings);
                }
                return Err(
                    "Session Minecraft expiree. Le compte invalide a ete supprime, merci de vous reconnecter avec Microsoft."
                        .to_string()
                );
            }
        }
        auth
    };
    // Generate arguments
    let settings = SettingsManager::load(&app_handle);
    let args = LaunchArguments::from_session(&session, &session_dir, &auth, &settings)?;
    
    // Create or focus log window if enabled before launching
    if show_logs {
        if let Some(window) = app_handle.get_webview_window("logs") {
            let _ = window.set_focus();
            let _ = window.eval("document.getElementById('log-container').innerHTML = ''");
        } else {
            match WebviewWindowBuilder::new(&app_handle, "logs", WebviewUrl::App("logs.html".into()))
                .title("Minecraft Output Console")
                .inner_size(800.0, 600.0)
                .resizable(true)
                .build() 
            {
                Ok(_) => { log::info!("Log window created successfully"); },
                Err(e) => { log::error!("Failed to create log window: {}", e); }
            }
        }
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
async fn get_available_ram() -> Result<u32, String> {
    use sysinfo::System;
    let mut sys = System::new_all();
    sys.refresh_memory();
    Ok((sys.available_memory() / 1024 / 1024) as u32)
}

#[tauri::command]
async fn get_auth(app_handle: tauri::AppHandle) -> Result<Option<AuthResponse>, String> {
    let settings = SettingsManager::load(&app_handle);
    let accounts = crate::auth::secrets::SecretManager::get_all_accounts(&app_handle).unwrap_or_default();
    
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
async fn get_all_accounts(app_handle: tauri::AppHandle) -> Result<Vec<AuthResponse>, String> {
    crate::auth::secrets::SecretManager::get_all_accounts(&app_handle)
}

#[tauri::command]
async fn set_active_account(app_handle: tauri::AppHandle, uuid: String) -> Result<(), String> {
    let mut settings = SettingsManager::load(&app_handle);
    settings.active_account_uuid = Some(uuid);
    SettingsManager::save(&app_handle, &settings)
}

#[tauri::command]
async fn remove_account(app_handle: tauri::AppHandle, uuid: String) -> Result<(), String> {
    crate::auth::secrets::SecretManager::remove_account(&app_handle, &uuid)
}

#[tauri::command]
async fn has_auth(app_handle: tauri::AppHandle) -> Result<bool, String> {
    let accounts = crate::auth::secrets::SecretManager::get_all_accounts(&app_handle).unwrap_or_default();
    Ok(!accounts.is_empty())
}

#[tauri::command]
async fn login_microsoft(
    window: tauri::Window,
    app_handle: tauri::AppHandle,
) -> Result<AuthResponse, String> {
    let auth_strategy = MicrosoftAuth;
    let response = auth_strategy.authenticate(&window).await?;

    let _ = crate::auth::secrets::SecretManager::add_account(&app_handle, response.clone());
    
    let mut settings = SettingsManager::load(&app_handle);
    settings.active_account_uuid = Some(response.uuid.clone());
    let _ = SettingsManager::save(&app_handle, &settings);

    Ok(response)
}

#[tauri::command]
async fn logout(app_handle: tauri::AppHandle) -> Result<(), String> {
    let settings = SettingsManager::load(&app_handle);
    if let Some(active) = &settings.active_account_uuid {
        let _ = crate::auth::secrets::SecretManager::remove_account(&app_handle, active);
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

// ─── Skin management commands ────────────────────────────────────────────────

/// Returns a **valid** (non-expired) Minecraft access token for the active account.
/// Mirrors the same validate → refresh → remove flow used in `launch_game`.
async fn get_valid_token(app_handle: &tauri::AppHandle) -> Result<String, String> {
    let mut settings = SettingsManager::load(app_handle);
    let accounts = crate::auth::secrets::SecretManager::get_all_accounts(app_handle).unwrap_or_default();

    let auth = settings
        .active_account_uuid
        .as_ref()
        .and_then(|uid| accounts.iter().find(|a| a.uuid == *uid).cloned())
        .or_else(|| accounts.iter().next().cloned())
        .ok_or_else(|| "Not authenticated – please login first.".to_string())?;

    // Token still valid → return immediately
    if MicrosoftAuth::is_mc_token_valid(&auth.access_token).await {
        return Ok(auth.access_token);
    }

    log::warn!("Minecraft token expired for {}, attempting silent refresh…", auth.name);

    // Try silent refresh via the stored refresh_token
    if let Some(refresh_token) = auth.refresh_token.clone() {
        match MicrosoftAuth.refresh_auth(&refresh_token).await {
            Ok(refreshed) => {
                log::info!("Silently refreshed Minecraft token for {}", refreshed.name);
                let _ = crate::auth::secrets::SecretManager::add_account(app_handle, refreshed.clone());
                settings.active_account_uuid = Some(refreshed.uuid.clone());
                let _ = SettingsManager::save(app_handle, &settings);
                return Ok(refreshed.access_token);
            }
            Err(e) => {
                log::warn!("Silent refresh failed: {}", e);
                // Only remove the account if we are sure the refresh token is dead
                // "invalid_grant" means the refresh token is expired/revoked.
                if e.contains("invalid_grant") || e.contains("invalid_request") {
                    let _ = crate::auth::secrets::SecretManager::remove_account(app_handle, &auth.uuid);
                    if settings.active_account_uuid.as_deref() == Some(auth.uuid.as_str()) {
                        settings.active_account_uuid = None;
                        let _ = SettingsManager::save(app_handle, &settings);
                    }
                    return Err("Session Microsoft expirée. Le compte a été déconnecté, merci de vous reconnecter.".to_string());
                } else {
                    return Err(format!("Erreur lors du rafraîchissement de la session: {}", e));
                }
            }
        }
    }

    // Refresh failed (no refresh token) → remove stale account
    let _ = crate::auth::secrets::SecretManager::remove_account(app_handle, &auth.uuid);
    if settings.active_account_uuid.as_deref() == Some(auth.uuid.as_str()) {
        settings.active_account_uuid = None;
        let _ = SettingsManager::save(app_handle, &settings);
    }

    Err("Session Minecraft expirée. Aucune méthode de rafraîchissement trouvée. Merci de vous reconnecter.".to_string())
}

#[tauri::command]
async fn get_minecraft_profile(app_handle: tauri::AppHandle) -> Result<crate::core::skin::MinecraftProfile, String> {
    let token = get_valid_token(&app_handle).await?;
    crate::core::skin::fetch_minecraft_profile(&token).await
}

#[tauri::command]
async fn get_skin_history(app_handle: tauri::AppHandle) -> Result<Vec<crate::core::skin::SkinEntry>, String> {
    Ok(crate::core::skin::load_skin_history(&app_handle))
}

#[tauri::command]
async fn upload_skin(
    app_handle: tauri::AppHandle,
    name: String,
    texture_b64: String,
    variant: String,
) -> Result<crate::core::skin::SkinEntry, String> {
    let token = get_valid_token(&app_handle).await?;
    crate::core::skin::upload_skin_to_mojang(&token, &texture_b64, &variant).await?;

    let entry = crate::core::skin::SkinEntry {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        texture_b64,
        variant,
        added_at: chrono::Utc::now().to_rfc3339(),
    };

    let mut history = crate::core::skin::load_skin_history(&app_handle);
    history.insert(0, entry.clone());
    history.truncate(50);
    crate::core::skin::save_skin_history(&app_handle, &history)?;
    Ok(entry)
}

/// Saves a skin entry to the local library WITHOUT making any HTTP call.
/// Used when the frontend has already done the Mojang upload via browser fetch.
#[tauri::command]
async fn save_skin_to_library(
    app_handle: tauri::AppHandle,
    name: String,
    texture_b64: String,
    variant: String,
) -> Result<crate::core::skin::SkinEntry, String> {
    let entry = crate::core::skin::SkinEntry {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        texture_b64,
        variant,
        added_at: chrono::Utc::now().to_rfc3339(),
    };
    let mut history = crate::core::skin::load_skin_history(&app_handle);
    history.insert(0, entry.clone());
    history.truncate(50);
    crate::core::skin::save_skin_history(&app_handle, &history)?;
    Ok(entry)
}

/// Sends a pre-serialized multipart body to Mojang's skin endpoint.
/// The frontend uses browser's FormData API to serialize the body (guaranteed correct),
/// then passes raw bytes + Content-Type header here to bypass CORS restrictions.
#[tauri::command]
async fn upload_skin_raw(
    app_handle: tauri::AppHandle,
    content_type: String,
    body: Vec<u8>,
) -> Result<(), String> {
    let token = get_valid_token(&app_handle).await?;

    let client = reqwest::Client::builder()
        .http1_only()
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let resp = client
        .post("https://api.minecraftservices.com/minecraft/profile/skins")
        .bearer_auth(&token)
        .header("Content-Type", &content_type)
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Mojang upload failed: HTTP {} – {}", status, text));
    }

    Ok(())
}

#[tauri::command]
async fn get_skin_token(app_handle: tauri::AppHandle) -> Result<String, String> {
    get_valid_token(&app_handle).await
}


#[tauri::command]
async fn apply_skin_from_history(
    app_handle: tauri::AppHandle,
    skin_id: String,
) -> Result<(), String> {
    let token = get_valid_token(&app_handle).await?;
    let history = crate::core::skin::load_skin_history(&app_handle);
    let entry = history
        .iter()
        .find(|e| e.id == skin_id)
        .ok_or_else(|| format!("Skin '{}' not found in history", skin_id))?;
    crate::core::skin::upload_skin_to_mojang(&token, &entry.texture_b64, &entry.variant).await
}

#[tauri::command]
async fn reset_skin(app_handle: tauri::AppHandle) -> Result<(), String> {
    let token = get_valid_token(&app_handle).await?;
    let settings = SettingsManager::load(&app_handle);
    let uuid = settings
        .active_account_uuid
        .ok_or_else(|| "No active account".to_string())?;
    crate::core::skin::reset_skin_on_mojang(&token, &uuid).await
}

#[tauri::command]
async fn delete_skin_from_history(
    app_handle: tauri::AppHandle,
    skin_id: String,
) -> Result<(), String> {
    let mut history = crate::core::skin::load_skin_history(&app_handle);
    history.retain(|e| e.id != skin_id);
    crate::core::skin::save_skin_history(&app_handle, &history)
}

/// Validates the active token and silently refreshes it if expired.
/// Called at launcher startup to proactively renew credentials.
/// Returns the fresh AuthResponse so the frontend can update its cache.
#[tauri::command]
async fn refresh_active_token(app_handle: tauri::AppHandle) -> Result<crate::auth::AuthResponse, String> {
    // get_valid_token already does validate → refresh → save → error
    let token = get_valid_token(&app_handle).await?;

    // Return the full account matching this fresh token
    let accounts = crate::auth::secrets::SecretManager::get_all_accounts(&app_handle).unwrap_or_default();
    accounts
        .into_iter()
        .find(|a| a.access_token == token)
        .ok_or_else(|| "Could not find refreshed account".to_string())
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
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
            get_available_ram,
            get_all_accounts,
            set_active_account,
            remove_account,
            fetch_json,
            get_active_session_name,
            set_active_session,
            get_minecraft_profile,
            get_skin_history,
            upload_skin,
            apply_skin_from_history,
            reset_skin,
            delete_skin_from_history,
            refresh_active_token,
            save_skin_to_library,
            get_skin_token,
            upload_skin_raw
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
