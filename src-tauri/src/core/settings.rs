use serde::{Deserialize, Serialize};
use sysinfo::System;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub min_ram: u32,
    pub max_ram: u32,
    pub game_resolution: String,
    pub active_account_uuid: Option<String>,
    pub jvm_args: String,
    pub wrapper_command: String,
    pub show_logs: bool,
}

fn get_system_ram_mb() -> u32 {
    let mut sys = System::new_all();
    sys.refresh_memory();
    (sys.total_memory() / 1024 / 1024) as u32
}

impl Default for AppSettings {
    fn default() -> Self {
        let total_ram = get_system_ram_mb();
        let max_ram = if total_ram >= 4096 { 4096 } else { total_ram.saturating_sub(1024).max(1024) };
        Self {
            min_ram: 1024,
            max_ram,
            game_resolution: "400x300".to_string(),
            active_account_uuid: None,
            jvm_args: "".to_string(),
            wrapper_command: "".to_string(),
            show_logs: false,
        }
    }
}

pub struct SettingsManager;

impl SettingsManager {
    fn get_path(app_handle: &tauri::AppHandle) -> std::path::PathBuf {
        app_handle.path().app_data_dir().unwrap().join("settings.json")
    }

    pub fn load(app_handle: &tauri::AppHandle) -> AppSettings {
        let path = Self::get_path(app_handle);
        if let Ok(content) = std::fs::read_to_string(&path) {
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            AppSettings::default()
        }
    }

    pub fn save(app_handle: &tauri::AppHandle, settings: &AppSettings) -> Result<(), String> {
        let path = Self::get_path(app_handle);
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
        std::fs::write(&path, json).map_err(|e| e.to_string())
    }
}
