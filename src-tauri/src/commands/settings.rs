use crate::core::settings::{AppSettings, SettingsManager};

#[tauri::command]
pub async fn get_system_ram() -> Result<u32, String> {
    use sysinfo::System;
    let mut sys = System::new_all();
    sys.refresh_memory();
    Ok((sys.total_memory() / 1024 / 1024) as u32)
}

#[tauri::command]
pub async fn get_available_ram() -> Result<u32, String> {
    use sysinfo::System;
    let mut sys = System::new_all();
    sys.refresh_memory();
    Ok((sys.available_memory() / 1024 / 1024) as u32)
}

#[tauri::command]
pub async fn get_settings(app_handle: tauri::AppHandle) -> Result<AppSettings, String> {
    Ok(SettingsManager::load(&app_handle))
}

#[tauri::command]
pub async fn save_settings(app_handle: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    SettingsManager::save(&app_handle, &settings)
}

#[tauri::command]
pub async fn ping_service(url: String) -> Result<bool, String> {
    match reqwest::get(&url).await {
        Ok(res) => {
            // As long as the server responds (even a 400 for bad path), the infrastructure is up.
            // A 500+ usually means an infrastructure downtime.
            let status = res.status().as_u16();
            Ok(status < 500)
        }
        Err(_) => Ok(false),
    }
}
