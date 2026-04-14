use crate::auth::AuthResponse;
use serde_json;

/**
 * Manages secure storage of secrets using local files.
 * (Keyring has been explicitly removed by user request).
 */
pub struct SecretManager;

impl SecretManager {
    fn local_path() -> std::path::PathBuf {
        if let Ok(mut exe_path) = std::env::current_exe() {
            exe_path.pop();
            exe_path.join("accounts.json")
        } else {
            std::env::current_dir().unwrap_or_default().join("accounts.json")
        }
    }

    /**
     * Retrieves all saved authentication responses.
     */
    pub fn get_all_accounts() -> Result<Vec<AuthResponse>, String> {
        let path = Self::local_path();
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
    pub fn save_all_accounts(accounts: &[AuthResponse]) -> Result<(), String> {
        let json = serde_json::to_string(accounts)
            .map_err(|e| format!("Failed to serialize accounts: {}", e))?;

        let path = Self::local_path();
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        std::fs::write(&path, &json)
            .map_err(|e| format!("Failed to save local accounts: {}", e))
    }

    /**
     * Adds an account, replacing any existing account with the same UUID.
     */
    pub fn add_account(auth: AuthResponse) -> Result<(), String> {
        let mut accounts = Self::get_all_accounts()?;
        accounts.retain(|a| a.uuid != auth.uuid);
        accounts.push(auth);
        Self::save_all_accounts(&accounts)
    }

    /**
     * Removes an account by UUID.
     */
    pub fn remove_account(uuid: &str) -> Result<(), String> {
        let mut accounts = Self::get_all_accounts()?;
        accounts.retain(|a| a.uuid != uuid);
        Self::save_all_accounts(&accounts)
    }

    /**
     * Deletes all authentication responses from the local file.
     */
    pub fn clear_all() -> Result<(), String> {
        let path = Self::local_path();
        let _ = std::fs::remove_file(path);
        Ok(())
    }
}
