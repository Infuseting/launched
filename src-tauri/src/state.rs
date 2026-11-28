use crate::core::session::Session;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::{collections::HashMap, path::PathBuf};
use tauri::Manager;

#[derive(Default)]
pub struct AppState {
    pub active_session: Mutex<Option<Session>>,
    pub running_sessions: Mutex<HashMap<PathBuf, usize>>,
}

#[derive(Default)]
pub struct DeepLinkState {
    pub pending_url: Mutex<Option<String>>,
}

#[derive(Serialize, Deserialize, Default)]
pub struct Prefs {
    pub last_session_name: Option<String>,
}

pub fn get_prefs_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    app_handle
        .path()
        .app_data_dir()
        .map(|d| d.join("prefs.json"))
        .map_err(|e| format!("Failed to resolve prefs directory: {}", e))
}

pub fn save_prefs(app_handle: &tauri::AppHandle, prefs: &Prefs) {
    let path = match get_prefs_path(app_handle) {
        Ok(p) => p,
        Err(e) => {
            log::warn!("Could not save prefs: {}", e);
            return;
        }
    };
    if let Some(parent) = path.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            log::warn!("Could not create prefs dir {:?}: {}", parent, e);
            return;
        }
    }
    match serde_json::to_string(prefs) {
        Ok(json) => {
            if let Err(e) = std::fs::write(&path, json) {
                log::warn!("Could not write prefs to {:?}: {}", path, e);
            }
        }
        Err(e) => log::warn!("Could not serialize prefs: {}", e),
    }
}

pub fn load_prefs(app_handle: &tauri::AppHandle) -> Prefs {
    let path = match get_prefs_path(app_handle) {
        Ok(p) => p,
        Err(e) => {
            log::warn!("Could not resolve prefs path: {}", e);
            return Prefs::default();
        }
    };
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_else(|e| {
            log::warn!("Invalid prefs.json at {:?}: {}; using defaults", path, e);
            Prefs::default()
        }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Prefs::default(),
        Err(e) => {
            log::warn!("Failed to read prefs.json at {:?}: {}", path, e);
            Prefs::default()
        }
    }
}
