use crate::auth::AuthResponse;
use std::io::ErrorKind;
use std::path::PathBuf;
use tauri::Manager;

/// Stores accounts in the application's local data directory.
///
/// Tokens are plaintext: the OS user's file permissions protect this file.
/// Keyring storage was explicitly removed by request.
pub struct SecretManager;

impl SecretManager {
    fn local_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
        app_handle
            .path()
            .app_data_dir()
            .map(|path| path.join("accounts.json"))
            .map_err(|error| format!("Failed to resolve account storage directory: {}", error))
    }

    /**
     * Retrieves all saved authentication responses.
     */
    pub fn get_all_accounts(app_handle: &tauri::AppHandle) -> Result<Vec<AuthResponse>, String> {
        let path = Self::local_path(app_handle)?;
        let content = match std::fs::read_to_string(&path) {
            Ok(content) => content,
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(vec![]),
            Err(error) => return Err(format!("Failed to read local accounts: {}", error)),
        };
        parse_accounts(&content)
    }

    pub fn get_active_account(
        app_handle: &tauri::AppHandle,
        active_uuid: Option<&str>,
    ) -> Option<AuthResponse> {
        let accounts = Self::get_all_accounts(app_handle)
            .map_err(|error| log::error!("{}", error))
            .unwrap_or_default();
        let index = active_uuid
            .and_then(|uuid| accounts.iter().position(|account| account.uuid == uuid))
            .unwrap_or(0);
        accounts.into_iter().nth(index)
    }

    /**
     * Saves the full list of accounts to local storage.
     */
    pub fn save_all_accounts(
        app_handle: &tauri::AppHandle,
        accounts: &[AuthResponse],
    ) -> Result<(), String> {
        let json = serde_json::to_string(accounts)
            .map_err(|e| format!("Failed to serialize accounts: {}", e))?;

        let path = Self::local_path(app_handle)?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| {
                format!("Failed to create account storage directory: {}", error)
            })?;
        }
        std::fs::write(&path, &json)
            .map_err(|e| format!("Failed to save local accounts: {}", e))?;
        crate::core::discord_presence::notify_account_change(app_handle);
        Ok(())
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
        let path = Self::local_path(app_handle)?;
        match std::fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(error) => return Err(format!("Failed to remove local accounts: {}", error)),
        }
        crate::core::discord_presence::notify_account_change(app_handle);
        Ok(())
    }
}

/// Accept the legacy single-account format, but never reinterpret corrupt data
/// as an empty account list: a later login could overwrite recoverable tokens.
fn parse_accounts(content: &str) -> Result<Vec<AuthResponse>, String> {
    serde_json::from_str::<Vec<AuthResponse>>(content)
        .or_else(|_| serde_json::from_str::<AuthResponse>(content).map(|account| vec![account]))
        .map_err(|error| {
            // Do not log serde's input values: corrupt account data can still
            // contain credentials, and these errors reach the application log.
            format!(
                "Failed to parse local accounts at line {}, column {}",
                error.line(),
                error.column()
            )
        })
}

#[cfg(test)]
mod tests {
    use super::parse_accounts;

    #[test]
    fn loads_legacy_account_without_refresh_token() {
        let accounts =
            parse_accounts(r#"{"uuid":"id","name":"Player","access_token":"token"}"#).unwrap();
        assert_eq!(accounts.len(), 1);
        assert_eq!(accounts[0].uuid, "id");
        assert!(accounts[0].refresh_token.is_none());
    }

    #[test]
    fn rejects_corrupt_accounts_instead_of_erasing_them() {
        for content in ["", "{", "null", r#"[{"uuid":"id"}]"#] {
            assert!(parse_accounts(content).is_err());
        }
        assert!(parse_accounts("[]").unwrap().is_empty());
    }
}
