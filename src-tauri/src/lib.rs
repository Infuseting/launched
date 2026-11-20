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
use tauri::Manager;

#[cfg(target_os = "windows")]
fn register_windows_scheme() {
    use std::os::windows::process::CommandExt;
    if let Ok(exe_path) = std::env::current_exe() {
        let exe_str = exe_path.to_string_lossy().replace('/', "\\");
        let reg_cmd = format!(
            "reg add \"HKCU\\Software\\Classes\\launched\" /ve /d \"URL:Launched Protocol\" /f >nul 2>&1 & \
             reg add \"HKCU\\Software\\Classes\\launched\" /v \"URL Protocol\" /d \"\" /f >nul 2>&1 & \
             reg add \"HKCU\\Software\\Classes\\launched\\shell\\open\\command\" /ve /d \"\\\"{}\\\" \\\"%1\\\"\" /f >nul 2>&1",
            exe_str
        );
        let _ = std::process::Command::new("cmd")
            .args(["/C", &reg_cmd])
            .creation_flags(0x08000000)
            .output();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pending_deep_link = std::env::args().find(|arg| arg.starts_with("launched://"));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::default())
        .manage(crate::auth::discord::DiscordState::default())
        .manage(LauncherPresenceState::default())
        .manage(DeepLinkState {
            pending_url: std::sync::Mutex::new(pending_deep_link),
        })
        .invoke_handler(tauri::generate_handler![
            // Sessions
            get_sessions,
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
            #[cfg(target_os = "windows")]
            register_windows_scheme();

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            if let Ok(app_dir) = app.path().app_data_dir() {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = discord_presence::launcher_presence(&handle, &app_dir).await {
                        log::warn!("Discord Rich Presence unavailable: {error}");
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
