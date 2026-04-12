use async_trait::async_trait;
use crate::auth::{AuthStrategy, AuthResponse};

/**
 * Microsoft authentication strategy.
 */
pub struct MicrosoftAuth;

#[async_trait]
impl AuthStrategy for MicrosoftAuth {
    /**
     * Authenticates using Microsoft account.
     */
    async fn authenticate(&self) -> Result<AuthResponse, String> {
        // Implementation for Microsoft auth goes here.
        Err("Microsoft authentication not implemented yet".to_string())
    }
}
