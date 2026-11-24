use crate::core::settings::{AppSettings, SettingsManager};

#[tauri::command]
pub async fn get_system_ram() -> Result<u32, String> {
    use sysinfo::System;
    let mut sys = System::new();
    sys.refresh_memory();
    Ok((sys.total_memory() / 1024 / 1024) as u32)
}

#[tauri::command]
pub async fn get_available_ram() -> Result<u32, String> {
    use sysinfo::System;
    let mut sys = System::new();
    sys.refresh_memory();
    Ok((sys.available_memory() / 1024 / 1024) as u32)
}

#[tauri::command]
pub async fn get_settings(app_handle: tauri::AppHandle) -> Result<AppSettings, String> {
    Ok(SettingsManager::load(&app_handle))
}

#[tauri::command]
pub async fn save_settings(
    app_handle: tauri::AppHandle,
    settings: AppSettings,
) -> Result<(), String> {
    log::debug!(
        "save_settings (sessions_count={}, active_account={:?})",
        settings.sessions.len(),
        settings.active_account_uuid
    );
    SettingsManager::save(&app_handle, &settings).map_err(|e| {
        log::error!("save_settings failed: {}", e);
        e
    })
}

#[tauri::command]
pub async fn ping_service(url: String) -> Result<bool, String> {
    match reqwest::get(&url).await {
        Ok(res) => {
            // As long as the server responds (even a 400 for bad path), the infrastructure is up.
            // A 500+ usually means an infrastructure downtime.
            let status = res.status().as_u16();
            if status >= 500 {
                log::warn!("ping_service {} returned HTTP {}", url, status);
            } else {
                log::debug!("ping_service {} -> HTTP {}", url, status);
            }
            Ok(status < 500)
        }
        Err(e) => {
            log::warn!("ping_service {} failed: {}", url, e);
            Ok(false)
        }
    }
}
