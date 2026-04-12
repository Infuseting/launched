use keyring::Entry;
use crate::auth::AuthResponse;
use serde_json;

/**
 * Manages secure storage of secrets using the system keychain.
 */
pub struct SecretManager;

impl SecretManager {
    const SERVICE_NAME: &'static str = "fr.infuseting.launched.auth";
    const ACCOUNT_NAME: &'static str = "minecraft-profile";

    /**
     * Saves the authentication response securely.
     */
    pub fn save_auth(auth: &AuthResponse) -> Result<(), String> {
        let entry = Entry::new(Self::SERVICE_NAME, Self::ACCOUNT_NAME)
            .map_err(|e| format!("Failed to access keychain: {}", e))?;
        
        let json = serde_json::to_string(auth)
            .map_err(|e| format!("Failed to serialize auth: {}", e))?;
        
        entry.set_password(&json)
            .map_err(|e| format!("Failed to save to keychain: {}", e))
    }

    /**
     * Loads the authentication response securely.
     */
    pub fn load_auth() -> Result<Option<AuthResponse>, String> {
        let entry = Entry::new(Self::SERVICE_NAME, Self::ACCOUNT_NAME)
            .map_err(|e| format!("Failed to access keychain: {}", e))?;
        
        match entry.get_password() {
            Ok(json) => {
                let auth: AuthResponse = serde_json::from_str(&json)
                    .map_err(|e| format!("Failed to deserialize auth: {}", e))?;
                Ok(Some(auth))
            },
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("Failed to load from keychain: {}", e)),
        }
    }

    /**
     * Deletes the authentication response from the keychain.
     */
    pub fn clear_auth() -> Result<(), String> {
        let entry = Entry::new(Self::SERVICE_NAME, Self::ACCOUNT_NAME)
            .map_err(|e| format!("Failed to access keychain: {}", e))?;
        
        entry.delete_credential()
            .map_err(|e| format!("Failed to clear keychain: {}", e))
    }
}
