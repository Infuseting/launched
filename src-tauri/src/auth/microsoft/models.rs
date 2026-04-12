use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct DeviceCodeResponse {
    pub user_code: String,
    pub device_code: String,
    pub verification_uri: String,
    pub expires_in: u32,
    pub interval: u32,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MicrosoftTokenResponse {
    pub access_token: String,
    pub refresh_token: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(non_snake_case)]
pub struct XboxLiveResponse {
    pub Token: String,
    pub DisplayClaims: DisplayClaims,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(non_snake_case)]
pub struct DisplayClaims {
    pub xui: Vec<Xui>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Xui {
    pub uhs: String,
}
