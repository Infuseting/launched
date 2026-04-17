use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use sysinfo::System;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionSettings {
    pub min_ram: u32,
    pub max_ram: u32,
    pub jvm_args: String,
    pub wrapper_command: String,
    pub show_logs: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    // Global Settings
    pub game_resolution: String,
    pub active_account_uuid: Option<String>,

    // Session-specific Overrides
    pub sessions: HashMap<String, SessionSettings>,

    // Fallback/Default Settings
    pub default_settings: SessionSettings,
}

fn get_system_ram_mb() -> u32 {
    let mut sys = System::new_all();
    sys.refresh_memory();
    (sys.total_memory() / 1024 / 1024) as u32
}

impl Default for SessionSettings {
    fn default() -> Self {
        let total_ram = get_system_ram_mb();
        let max_ram = if total_ram >= 4096 {
            4096
        } else {
            total_ram.saturating_sub(1024).max(1024)
        };
        Self {
            min_ram: 1024,
            max_ram,
            jvm_args: "".to_string(),
            wrapper_command: "".to_string(),
            show_logs: false,
        }
    }
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            game_resolution: "400x300".to_string(),
            active_account_uuid: None,
            sessions: HashMap::new(),
            default_settings: SessionSettings::default(),
        }
    }
}

pub struct SettingsManager;

impl SettingsManager {
    fn get_path(app_handle: &tauri::AppHandle) -> std::path::PathBuf {
        app_handle
            .path()
            .app_data_dir()
            .unwrap()
            .join("settings.json")
    }

    pub fn load(app_handle: &tauri::AppHandle) -> AppSettings {
        let path = Self::get_path(app_handle);
        if let Ok(content) = std::fs::read_to_string(&path) {
            match serde_json::from_str::<AppSettings>(&content) {
                Ok(settings) => settings,
                Err(_) => {
                    // Try to migrate from old flat structure
                    #[derive(Deserialize)]
                    #[serde(rename_all = "camelCase")]
                    struct OldSettings {
                        min_ram: u32,
                        max_ram: u32,
                        game_resolution: String,
                        active_account_uuid: Option<String>,
                        jvm_args: String,
                        wrapper_command: String,
                        show_logs: bool,
                    }

                    if let Ok(old) = serde_json::from_str::<OldSettings>(&content) {
                        log::info!("Migrating old flat settings to session-specific structure");
                        AppSettings {
                            game_resolution: old.game_resolution,
                            active_account_uuid: old.active_account_uuid,
                            sessions: HashMap::new(),
                            default_settings: SessionSettings {
                                min_ram: old.min_ram,
                                max_ram: old.max_ram,
                                jvm_args: old.jvm_args,
                                wrapper_command: old.wrapper_command,
                                show_logs: old.show_logs,
                            },
                        }
                    } else {
                        AppSettings::default()
                    }
                }
            }
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
