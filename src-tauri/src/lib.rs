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
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }));

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
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
            has_auth,
            logout,
            get_all_accounts,
            set_active_account,
            remove_account,
            refresh_active_token,
            // Game & Sync
            sync_session,
            launch_game,
            open_session_switcher,
            // Settings & System
            get_settings,
            save_settings,
            ping_service,
            get_system_ram,
            get_available_ram,
            // Skin
            get_minecraft_profile,
            get_skin_history,
            upload_skin,
            apply_skin_from_history,
            reset_skin,
            delete_skin_from_history,
            save_skin_to_library,
            get_skin_token,
            upload_skin_raw,
            // Window controls
            window_minimize,
            window_toggle_maximize,
            window_close,
            window_is_maximized
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                if let Some(url) = event
                    .urls()
                    .iter()
                    .rev()
                    .find(|url| url.scheme() == "launched")
                {
                    if let Ok(mut pending) = handle.state::<DeepLinkState>().pending_url.lock() {
                        *pending = Some(url.to_string());
                    }
                    let _ = handle.emit("deep-link-received", ());
                }
            });
            if let Some(urls) = app.deep_link().get_current()? {
                if let Some(url) = urls.iter().rev().find(|url| url.scheme() == "launched") {
                    *app.state::<DeepLinkState>().pending_url.lock().unwrap() =
                        Some(url.to_string());
                }
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            let startup_handle = app.handle().clone();
            tauri::async_runtime::spawn_blocking(move || {
                // Registry and protected-storage I/O must not hold up the window's event loop.
                #[cfg(any(windows, target_os = "linux"))]
                if let Err(error) = startup_handle.deep_link().register_all() {
                    log::warn!("Could not register launched://: {error}");
                }
                // Commands also migrate on read, serialized by the protected-storage lock.
                if let Err(error) = auth::secrets::SecretManager::get_all_accounts(&startup_handle)
                {
                    log::error!("Minecraft credential migration failed: {error}");
                }
                if let Err(error) = auth::discord::migrate_storage(&startup_handle) {
                    log::error!("Discord credential migration failed: {error}");
                }
            });
            if let Ok(app_dir) = app.path().app_data_dir() {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = discord_presence::launcher_presence(&handle, &app_dir).await
                    {
                        log::warn!("Discord Rich Presence unavailable: {error}");
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
