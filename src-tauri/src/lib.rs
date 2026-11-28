pub mod auth;
pub mod commands;
pub mod core;
pub mod state;

use crate::auth::discord::{
    cancel_discord_login, continue_without_discord, fetch_session_image, get_discord_auth,
    login_discord, logout_discord,
};
use crate::commands::*;
use crate::core::discord_presence::{self, LauncherPresenceState};
use crate::state::{AppState, DeepLinkState};
use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // Forward subsequent protocol activations to the running launcher.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
        log::info!(
            "Single-instance activation received (cwd={}, args_count={})",
            cwd,
            args.len()
        );
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        } else {
            log::warn!("Single-instance activation: 'main' window not found");
        }
    }));

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::default())
        .manage(crate::auth::discord::DiscordState::default())
        .manage(LauncherPresenceState::default())
        .manage(DeepLinkState::default())
        .invoke_handler(tauri::generate_handler![
            // Sessions
            get_sessions,
            get_local_session_names,
            delete_session,
            get_active_session_name,
            set_active_session,
            fetch_json,
            get_deep_link_url,
            get_session_optional_files,
            set_session_optional_files,
            // Discord Auth
            get_discord_auth,
            continue_without_discord,
            login_discord,
            cancel_discord_login,
            logout_discord,
            fetch_session_image,
            // Microsoft Auth
            login_microsoft,
            get_auth,
            logout,
            get_all_accounts,
            set_active_account,
            remove_account,
            refresh_active_token,
            // Game & Sync
            sync_session,
            launch_game,
            // Settings & System
            get_settings,
            save_settings,
            ping_service,
            get_system_ram,
            // Skin
            get_minecraft_profile,
            get_skin_history,
            apply_skin_from_history,
            reset_skin,
            delete_skin_from_history,
            save_skin_to_library,
            upload_skin_raw,
            // Logging
            crate::core::logger::log_frontend
        ])
        .setup(|app| {
            let log_dir = app
                .path()
                .app_log_dir()
                .or_else(|_| app.path().app_data_dir().map(|d| d.join("logs")))
                .map_err(|e| format!("Could not resolve log directory: {e}"))?;
            let latest_log_path = core::logger::init(&log_dir)?;

            log::info!(
                "=== Launched v{} starting (os={}, arch={}, mode={}, pid={}) ===",
                env!("CARGO_PKG_VERSION"),
                std::env::consts::OS,
                std::env::consts::ARCH,
                if cfg!(debug_assertions) { "debug" } else { "release" },
                std::process::id()
            );
            if let Ok(exe) = std::env::current_exe() {
                log::info!("Executable: {}", exe.display());
            }
            if let Ok(app_dir) = app.path().app_data_dir() {
                log::info!("App data dir: {}", app_dir.display());
            }
            log::info!("Latest log file: {}", latest_log_path.display());

            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                let urls = event.urls();
                log::info!("Deep link on_open_url triggered ({} url(s))", urls.len());
                if let Some(url) = urls
                    .iter()
                    .rev()
                    .find(|url| url.scheme() == "launched")
                {
                    log::info!("Deep link accepted: {}", url);
                    if let Ok(mut pending) = handle.state::<DeepLinkState>().pending_url.lock() {
                        *pending = Some(url.to_string());
                    }
                    if let Err(e) = handle.emit("deep-link-received", ()) {
                        log::warn!("Failed to emit deep-link-received event: {}", e);
                    }
                }
            });
            if let Some(urls) = app.deep_link().get_current()? {
                log::info!("Cold-start deep link check found {} url(s)", urls.len());
                if let Some(url) = urls.iter().rev().find(|url| url.scheme() == "launched") {
                    log::info!("Cold-start deep link stored: {}", url);
                    if let Ok(mut pending) = app.state::<DeepLinkState>().pending_url.lock() {
                        *pending = Some(url.to_string());
                    }
                }
            }

            let startup_handle = app.handle().clone();
            tauri::async_runtime::spawn_blocking(move || {
                log::debug!("Running startup blocking tasks (deep-link registration + credential migrations)");
                // Registry and protected-storage I/O must not hold up the window's event loop.
                #[cfg(any(windows, target_os = "linux"))]
                if let Err(error) = startup_handle.deep_link().register_all() {
                    log::warn!("Could not register launched://: {error}");
                } else {
                    log::debug!("Registered launched:// protocol handler");
                }
                // Commands also migrate on read, serialized by the protected-storage lock.
                match auth::secrets::SecretManager::get_all_accounts(&startup_handle) {
                    Ok(accounts) => {
                        log::info!("Loaded {} Microsoft account(s) at startup", accounts.len());
                    }
                    Err(error) => {
                        log::error!("Minecraft credential migration failed: {error}");
                    }
                }
                if let Err(error) = auth::discord::migrate_storage(&startup_handle) {
                    log::error!("Discord credential migration failed: {error}");
                } else {
                    log::debug!("Discord credential migration check completed");
                }
            });
            if let Ok(app_dir) = app.path().app_data_dir() {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    log::debug!("Starting Discord Rich Presence launcher loop");
                    if let Err(error) = discord_presence::launcher_presence(&handle, &app_dir).await
                    {
                        log::warn!("Discord Rich Presence unavailable: {error}");
                    }
                });
            }
            log::info!("Tauri setup completed");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
