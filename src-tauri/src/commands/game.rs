use super::session::authorized_session;
use crate::auth::microsoft::MicrosoftAuth;
use crate::auth::secrets::SecretManager;
use crate::auth::AuthResponse;
use crate::core::discord_presence::DiscordPresence;
use crate::core::install::InstallService;
use crate::core::launch::args::LaunchArguments;
use crate::core::launch::LaunchService;
use crate::core::session::Session;
use crate::core::settings::SettingsManager;
use crate::core::sync::SyncService;
use crate::state::{load_prefs, save_prefs, AppState};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub async fn sync_session(
    session: Session,
    app_handle: tauri::AppHandle,
    window: tauri::Window,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let session = authorized_session(&app_handle, &session).await?;
    let install_service = InstallService;
    let sync_service = SyncService;
    let session_dir =
        crate::core::optional_files::OptionalFilesManager::session_dir(&app_handle, &session.name)
            .await?;

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

    let settings = crate::core::settings::SettingsManager::load(&app_handle);
    let session_settings = settings
        .sessions
        .get(&session.name)
        .cloned()
        .unwrap_or(settings.default_settings);
    let enabled_optional = session_settings.enabled_optional_files.as_deref();

    sync_service
        .sync(
            &app_handle,
            &window,
            &session_dir,
            &session.sync_url,
            &session.sync_dir,
            enabled_optional,
        )
        .await
}

#[tauri::command]
pub async fn launch_game(
    session: Option<Session>,
    show_logs: bool,
    crack_pseudo: Option<String>,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let launch_service = LaunchService;
    // Use provided session or fallback to active session in state
    let session = session
        .or_else(|| state.active_session.lock().unwrap().clone())
        .ok_or_else(|| "No session selected".to_string())?;
    let session = authorized_session(&app_handle, &session).await?;
    if crack_pseudo.is_some() && !session.crack.unwrap_or(false) {
        return Err("Cette session requiert un compte Minecraft.".into());
    }

    let session_dir =
        crate::core::optional_files::OptionalFilesManager::session_dir(&app_handle, &session.name)
            .await?;

    // Get auth: try keychain first
    let auth = if let Some(pseudo) = crack_pseudo {
        log::info!("Launching in crack mode with pseudo: {}", pseudo);
        AuthResponse {
            uuid: "00000000-0000-0000-0000-000000000000".to_string(),
            name: pseudo,
            access_token: "offline".to_string(),
            refresh_token: None,
        }
    } else {
        let mut settings = SettingsManager::load(&app_handle);
        let mut auth =
            SecretManager::get_active_account(&app_handle, settings.active_account_uuid.as_deref())
                .ok_or_else(|| "Not authenticated. Please login first.".to_string())?;

        // Validate token before launch; if expired, try refresh_token once.
        if !MicrosoftAuth::is_mc_token_valid(&auth.access_token).await {
            log::warn!(
                "Stored Minecraft token is invalid/expired for account {}",
                auth.name
            );

            if let Some(refresh_token) = auth.refresh_token.clone() {
                match MicrosoftAuth.refresh_auth(&refresh_token).await {
                    Ok(refreshed) => {
                        log::info!(
                            "Successfully refreshed Minecraft auth for {}",
                            refreshed.name
                        );
                        SecretManager::add_account(&app_handle, refreshed.clone())
                            .map_err(|e| e.to_string())?;

                        settings.active_account_uuid = Some(refreshed.uuid.clone());
                        let _ = SettingsManager::save(&app_handle, &settings);

                        auth = refreshed;
                    }
                    Err(e) => {
                        log::warn!("Failed to refresh Minecraft auth: {}", e);
                        if e.contains("invalid_grant") || e.contains("invalid_request") {
                            let _ = SecretManager::remove_account(&app_handle, &auth.uuid);
                            if settings.active_account_uuid.as_deref() == Some(auth.uuid.as_str()) {
                                settings.active_account_uuid = None;
                                let _ = SettingsManager::save(&app_handle, &settings);
                            }
                            return Err(
                                "Session Minecraft expiree. Le compte a ete supprime, merci de vous reconnecter avec Microsoft."
                                    .to_string(),
                            );
                        } else {
                            return Err(format!(
                                "Erreur lors de l'authentification Minecraft: {}",
                                e
                            ));
                        }
                    }
                }
            } else {
                let _ = SecretManager::remove_account(&app_handle, &auth.uuid);
                if settings.active_account_uuid.as_deref() == Some(auth.uuid.as_str()) {
                    settings.active_account_uuid = None;
                    let _ = SettingsManager::save(&app_handle, &settings);
                }
                return Err(
                    "Session Minecraft expiree. Le compte invalide a ete supprime, merci de vous reconnecter avec Microsoft."
                        .to_string(),
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
            match WebviewWindowBuilder::new(
                &app_handle,
                "logs",
                WebviewUrl::App("logs.html".into()),
            )
            .title("Minecraft Output Console")
            .inner_size(800.0, 600.0)
            .resizable(true)
            .build()
            {
                Ok(_) => {
                    log::info!("Log window created successfully");
                }
                Err(e) => {
                    log::error!("Failed to create log window: {}", e);
                }
            }
        }
    }

    let presence = session
        .discord_presence
        .unwrap_or_else(|| DiscordPresence::launched(Some(&session.name), Some(&auth.uuid)));
    launch_service.launch(args, show_logs, &app_handle, &presence)
}

#[tauri::command]
pub async fn open_session_switcher(window: tauri::WebviewWindow) -> Result<(), String> {
    window
        .eval("window.location.href = '/'")
        .map_err(|e| e.to_string())
}
