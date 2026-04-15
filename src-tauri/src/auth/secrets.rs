use crate::auth::AuthResponse;
use serde_json;
use tauri::Manager;

/**
 * Manages secure storage of secrets using local files.
 * (Keyring has been explicitly removed by user request).
 */
pub struct SecretManager;

impl SecretManager {
    fn local_path(app_handle: &tauri::AppHandle) -> std::path::PathBuf {
        app_handle.path().app_data_dir().unwrap().join("accounts.json")
    }

    /**
     * Retrieves all saved authentication responses.
     */
    pub fn get_all_accounts(app_handle: &tauri::AppHandle) -> Result<Vec<AuthResponse>, String> {
        let path = Self::local_path(app_handle);
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(accounts) = serde_json::from_str::<Vec<AuthResponse>>(&content) {
                return Ok(accounts);
            } else if let Ok(single) = serde_json::from_str::<AuthResponse>(&content) {
                return Ok(vec![single]);
            }
        }
        Ok(vec![])
    }

    /**
     * Saves the full list of accounts securely.
     */
    pub fn save_all_accounts(app_handle: &tauri::AppHandle, accounts: &[AuthResponse]) -> Result<(), String> {
        let json = serde_json::to_string(accounts)
            .map_err(|e| format!("Failed to serialize accounts: {}", e))?;

        let path = Self::local_path(app_handle);
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        std::fs::write(&path, &json)
            .map_err(|e| format!("Failed to save local accounts: {}", e))
    }

    /**
     * Adds an account, replacing any existing account with the same UUID.
     */
    pub fn add_account(app_handle: &tauri::AppHandle, auth: AuthResponse) -> Result<(), String> {
        let mut accounts = Self::get_all_accounts(app_handle)?;
        accounts.retain(|a| a.uuid != auth.uuid);
        accounts.push(auth);
        Self::save_all_accounts(app_handle, &accounts)
    }

    /**
     * Removes an account by UUID.
     */
    pub fn remove_account(app_handle: &tauri::AppHandle, uuid: &str) -> Result<(), String> {
        let mut accounts = Self::get_all_accounts(app_handle)?;
        accounts.retain(|a| a.uuid != uuid);
        Self::save_all_accounts(app_handle, &accounts)
    }

    /**
     * Deletes all authentication responses from the local file.
     */
    pub fn clear_all(app_handle: &tauri::AppHandle) -> Result<(), String> {
        let path = Self::local_path(app_handle);
        let _ = std::fs::remove_file(path);
        Ok(())
    }
}
