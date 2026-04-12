use async_trait::async_trait;
use serde::{Deserialize, Serialize};

pub mod microsoft;
pub mod secrets;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuthResponse {
    pub uuid: String,
    pub name: String,
    pub access_token: String,
}

/**
 * Strategy pattern for authentication.
 */
#[async_trait]
pub trait AuthStrategy {
    /**
     * Performs authentication.
     */
    async fn authenticate(&self, window: &tauri::Window) -> Result<AuthResponse, String>;
}
