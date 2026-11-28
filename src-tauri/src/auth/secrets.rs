use crate::auth::AuthResponse;
use std::path::PathBuf;
use tauri::Manager;

/// Stores accounts using OS protection, migrating legacy plaintext on first read.
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
        super::secure_storage::load(&path, parse_accounts).map(Option::unwrap_or_default)
    }

    pub fn get_active_account(
        app_handle: &tauri::AppHandle,
        active_uuid: Option<&str>,
    ) -> Result<Option<AuthResponse>, String> {
        let accounts = Self::get_all_accounts(app_handle)?;
        let index = active_uuid
            .and_then(|uuid| accounts.iter().position(|account| account.uuid == uuid))
            .unwrap_or(0);
        Ok(accounts.into_iter().nth(index))
    }

    /**
     * Saves the full list of accounts to local storage.
     */
    pub fn save_all_accounts(
        app_handle: &tauri::AppHandle,
        accounts: &[AuthResponse],
    ) -> Result<(), String> {
        let path = Self::local_path(app_handle)?;
        super::secure_storage::save(&path, &accounts)?;
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

    #[cfg(windows)]
    #[test]
    fn migrates_both_account_formats_and_preserves_all_tokens() {
        use crate::auth::secure_storage;
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("accounts.json");
        let multiple_accounts: Vec<_> = (0..20)
            .map(|id| {
                serde_json::json!({
                    "uuid": id.to_string(),
                    "name": "Player",
                    "access_token": "minecraft-access",
                    "refresh_token": "microsoft-refresh".repeat(200),
                })
            })
            .collect();
        for content in [
            r#"{"uuid":"id","name":"Player","access_token":"legacy-access"}"#.to_string(),
            serde_json::to_string(&multiple_accounts).unwrap(),
        ] {
            std::fs::write(&path, &content).unwrap();
            let expected = parse_accounts(&content).unwrap();
            for _ in 0..2 {
                let accounts = secure_storage::load(&path, parse_accounts)
                    .unwrap()
                    .unwrap();
                assert_eq!(
                    serde_json::to_value(&accounts).unwrap(),
                    serde_json::to_value(&expected).unwrap()
                );
                let bytes = std::fs::read(&path).unwrap();
                for secret in ["legacy-access", "minecraft-access", "microsoft-refresh"] {
                    assert!(!bytes
                        .windows(secret.len())
                        .any(|part| part == secret.as_bytes()));
                }
            }
        }
    }
}
