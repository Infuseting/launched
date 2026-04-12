use serde::{Deserialize, Serialize};

/**
 * Represents a session configuration from servers.json.
 */
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub name: String,
    pub minecraft: String,
    pub forge: Option<String>,
    pub sync_dir: String,
    pub sync_url: String,
    pub welcome: String,
    pub jvm_arg: String,
    pub credits: String,
    pub html_path: String,
    pub is_default: bool,
}

/**
 * Handles fetching and managing sessions.
 */
pub struct SessionManager;

impl SessionManager {
    /**
     * Fetches sessions from the remote servers.json URL.
     */
    pub async fn fetch_sessions(url: &str) -> Result<Vec<Session>, String> {
        reqwest::get(url)
            .await
            .map_err(|e| e.to_string())?
            .json::<Vec<Session>>()
            .await
            .map_err(|e| e.to_string())
    }
}
