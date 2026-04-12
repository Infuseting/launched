use async_trait::async_trait;
use serde::{Deserialize, Serialize};

pub mod microsoft;

#[derive(Debug, Serialize, Deserialize)]
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
    async fn authenticate(&self) -> Result<AuthResponse, String>;
}
