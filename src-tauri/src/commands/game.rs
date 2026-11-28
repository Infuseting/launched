use super::auth::get_valid_active_account;
use super::session::authorized_session;
use crate::auth::AuthResponse;
use crate::core::discord_presence::DiscordPresence;
use crate::core::install::assets::AssetManager;
use crate::core::install::InstallService;
use crate::core::launch::args::LaunchArguments;
use crate::core::launch::LaunchService;
use crate::core::session::Session;
use crate::core::settings::SettingsManager;
use crate::core::sync::SyncService;
use crate::state::{load_prefs, save_prefs, AppState};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

fn is_valid_crack_pseudo(pseudo: &str) -> bool {
    let trimmed = pseudo.trim();
    !trimmed.is_empty()
        && trimmed.len() <= 16
        && trimmed == pseudo
        && trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_')
}

#[tauri::command]
pub async fn sync_session(
    session: Session,
    app_handle: tauri::AppHandle,
    window: tauri::Window,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    log::info!(
        "sync_session requested for '{}' (minecraft={}, loader={:?})",
        session.name,
        session.minecraft,
        session.selected_loader().ok().flatten()
    );
    let session = authorized_session(&app_handle, &session)
        .await
        .map_err(|e| {
            log::error!(
                "sync_session authorization failed for '{}': {}",
                session.name,
                e
            );
            e
        })?;
    let install_service = InstallService;
    let sync_service = SyncService;
    let session_dir =
        crate::core::optional_files::OptionalFilesManager::session_dir(&app_handle, &session.name)
            .await
            .map_err(|e| {
                log::error!(
                    "sync_session failed to resolve session_dir for '{}': {}",
                    session.name,
                    e
                );
                e
            })?;

    // Save as active session
    {
        let mut active = state
            .active_session
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        *active = Some(session.clone());
    }

    // Save to prefs
    let mut prefs = load_prefs(&app_handle);
    prefs.last_session_name = Some(session.name.clone());
    save_prefs(&app_handle, &prefs);

    // 1. Ensure Minecraft and Mod Loader are installed
    log::info!("Installing Minecraft/modloader for '{}'", session.name);
    install_service
        .install_for_session(&window, &session)
        .await
        .map_err(|e| {
            log::error!("Install failed for '{}': {}", session.name, e);
            e
        })?;
    log::info!("Install step completed for '{}'", session.name);

    // 2. Sync session-specific files
    std::fs::create_dir_all(&session_dir).map_err(|e| {
        log::error!(
            "Failed to create session dir {}: {}",
            session_dir.display(),
            e
        );
        e.to_string()
    })?;

    let settings = crate::core::settings::SettingsManager::load(&app_handle);
    let session_settings = settings
        .sessions
        .get(&session.name)
        .cloned()
        .unwrap_or(settings.default_settings);
    let enabled_optional = session_settings.enabled_optional_files.as_deref();

    log::info!(
        "Starting file sync for '{}' (dir={}, optional_files={})",
        session.name,
        session_dir.display(),
        enabled_optional.map(|f| f.len()).unwrap_or(0)
    );
    let res = sync_service
        .sync(
            &app_handle,
            &window,
            &session_dir,
            &session.sync_url,
            &session.sync_dir,
            enabled_optional,
        )
        .await;
    match &res {
        Ok(()) => log::info!("sync_session completed successfully for '{}'", session.name),
        Err(e) => log::error!(
            "sync_session failed during sync for '{}': {}",
            session.name,
            e
        ),
    }
    res
}

#[tauri::command]
pub async fn launch_game(
    session: Option<Session>,
    show_logs: bool,
    crack_pseudo: Option<String>,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    log::info!(
        "launch_game requested (session_provided={}, show_logs={}, crack={})",
        session.is_some(),
        show_logs,
        crack_pseudo.is_some()
    );
    let launch_service = LaunchService;
    // Use provided session or fallback to active session in state
    let session = session
        .or_else(|| {
            state
                .active_session
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .clone()
        })
        .ok_or_else(|| {
            log::error!("launch_game failed: no session selected");
            "No session selected".to_string()
        })?;
    let session = authorized_session(&app_handle, &session)
        .await
        .map_err(|e| {
            log::error!(
                "launch_game authorization failed for '{}': {}",
                session.name,
                e
            );
            e
        })?;
    if crack_pseudo.is_some() && !session.crack.unwrap_or(false) {
        log::warn!(
            "launch_game rejected crack mode for non-crack session '{}'",
            session.name
        );
        return Err("Cette session requiert un compte Minecraft.".into());
    }

    let session_dir =
        crate::core::optional_files::OptionalFilesManager::session_dir(&app_handle, &session.name)
            .await
            .map_err(|e| {
                log::error!(
                    "launch_game failed to resolve session_dir for '{}': {}",
                    session.name,
                    e
                );
                e
            })?;

    // Resolve player auth (offline crack pseudo or validated Microsoft account)
    let auth = if let Some(pseudo) = crack_pseudo {
        if !is_valid_crack_pseudo(&pseudo) {
            return Err(
                "Pseudo crack invalide (1 à 16 caractères : lettres, chiffres ou _).".to_string(),
            );
        }
        log::info!("Launching in crack mode with pseudo: {}", pseudo);
        AuthResponse {
            uuid: "00000000-0000-0000-0000-000000000000".to_string(),
            name: pseudo,
            access_token: "offline".to_string(),
            refresh_token: None,
        }
    } else {
        get_valid_active_account(&app_handle).await?
    };

    // Generate arguments
    let settings = SettingsManager::load(&app_handle);
    let args =
        LaunchArguments::from_session(&session, &session_dir, &auth, &settings).map_err(|e| {
            log::error!(
                "Failed to build launch arguments for '{}': {}",
                session.name,
                e
            );
            e
        })?;
    if let (Some(assets_dir), Some(resolved_id)) = (
        LaunchArguments::extract_assets_dir(&args.minecraft_args),
        LaunchArguments::extract_asset_index_id(&args.minecraft_args),
    ) {
        AssetManager::ensure_index_file_on_disk(
            &assets_dir,
            &resolved_id,
            args.manifest_asset_index_id.as_deref(),
            args.manifest_asset_index_url.as_deref(),
        )
        .await;
    }
    log::info!(
        "Built launch args for '{}' (player={}, java={})",
        session.name,
        auth.name,
        args.java_path.display()
    );

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
        .unwrap_or_else(|| DiscordPresence::launched(Some(&session.name), Some(&auth.uuid)))
        .with_session_button(session.slug.as_deref(), &crate::auth::discord::site_url()?);
    launch_service.launch(args, show_logs, &app_handle, &presence)
}
