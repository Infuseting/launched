use crate::core::session::Session;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::Manager;

#[derive(Default)]
pub struct AppState {
    pub active_session: Mutex<Option<Session>>,
}

#[derive(Default)]
pub struct DeepLinkState {
    pub pending_url: Mutex<Option<String>>,
}

#[derive(Serialize, Deserialize, Default)]
pub struct Prefs {
    pub last_session_name: Option<String>,
}

pub fn get_prefs_path(app_handle: &tauri::AppHandle) -> std::path::PathBuf {
    app_handle.path().app_data_dir().unwrap().join("prefs.json")
}

pub fn save_prefs(app_handle: &tauri::AppHandle, prefs: &Prefs) {
    let path = get_prefs_path(app_handle);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string(prefs) {
        let _ = std::fs::write(path, json);
    }
}

pub fn load_prefs(app_handle: &tauri::AppHandle) -> Prefs {
    let path = get_prefs_path(app_handle);
    if let Ok(content) = std::fs::read_to_string(path) {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Prefs::default()
    }
}
