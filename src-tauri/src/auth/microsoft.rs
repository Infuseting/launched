use async_trait::async_trait;
use crate::auth::{AuthStrategy, AuthResponse};
use models::*;
use reqwest::Client;
use serde::Deserialize;
use std::time::Duration;
use tokio::time::sleep;

pub mod models;

const CLIENT_ID: &str = "00000000402b5328";

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
        let client = Client::new();

        // 1. Get Device Code
        let device_code_resp = self.get_device_code(&client).await?;
        println!("{}", device_code_resp.message);

        // 2. Poll for Token
        let ms_token_resp = self.poll_for_token(&client, &device_code_resp).await?;

        // 3. Get Xbox Live Token
        let xbl_resp = self.get_xbl_token(&client, &ms_token_resp.access_token).await?;

        // 4. Get XSTS Token
        let xsts_resp = self.get_xsts_token(&client, &xbl_resp.Token).await?;

        // 5. Get Minecraft Token
        let mc_token = self.get_mc_token(&client, &xsts_resp.Token, &xsts_resp.DisplayClaims.xui[0].uhs).await?;

        // 6. Get Minecraft Profile
        let profile = self.get_mc_profile(&client, &mc_token).await?;

        Ok(AuthResponse {
            access_token: mc_token,
            uuid: profile.id,
            name: profile.name,
        })
    }
}

#[derive(Debug, Deserialize)]
struct MinecraftProfile {
    id: String,
    name: String,
}

impl MicrosoftAuth {
    async fn get_device_code(&self, client: &Client) -> Result<DeviceCodeResponse, String> {
        let params = [
            ("client_id", CLIENT_ID),
            ("scope", "service::user.auth.xboxlive.com::ABI_S_ACTIVATE"),
        ];

        let response = client
            .post("https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode")
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("Failed to request device code: {}", e))?;

        response
            .json::<DeviceCodeResponse>()
            .await
            .map_err(|e| format!("Failed to parse device code response: {}", e))
    }

    async fn poll_for_token(
        &self,
        client: &Client,
        device_code: &DeviceCodeResponse,
    ) -> Result<MicrosoftTokenResponse, String> {
        let params = [
            ("client_id", CLIENT_ID),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ("device_code", &device_code.device_code),
        ];

        let interval = Duration::from_secs(device_code.interval as u64);
        let mut expires_in = device_code.expires_in;

        while expires_in > 0 {
            sleep(interval).await;
            expires_in = expires_in.saturating_sub(device_code.interval);

            let response = client
                .post("https://login.microsoftonline.com/consumers/oauth2/v2.0/token")
                .form(&params)
                .send()
                .await
                .map_err(|e| format!("Failed to poll for token: {}", e))?;

            if response.status().is_success() {
                return response
                    .json::<MicrosoftTokenResponse>()
                    .await
                    .map_err(|e| format!("Failed to parse token response: {}", e));
            } else {
                let error_resp: serde_json::Value = response
                    .json()
                    .await
                    .map_err(|e| format!("Failed to parse error response: {}", e))?;

                if let Some(error) = error_resp.get("error") {
                    if error == "authorization_pending" {
                        continue;
                    } else {
                        return Err(format!("Token request failed: {}", error));
                    }
                }
            }
        }

        Err("Authentication timed out".to_string())
    }

    async fn get_xbl_token(&self, client: &Client, ms_token: &str) -> Result<XboxLiveResponse, String> {
        let body = serde_json::json!({
            "Properties": {
                "AuthMethod": "RPS",
                "SiteName": "user.auth.xboxlive.com",
                "RpsTicket": format!("d={}", ms_token)
            },
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT"
        });

        let response = client
            .post("https://user.auth.xboxlive.com/user/authenticate")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Failed to get XBL token: {}", e))?;

        response
            .json::<XboxLiveResponse>()
            .await
            .map_err(|e| format!("Failed to parse XBL response: {}", e))
    }

    async fn get_xsts_token(&self, client: &Client, xbl_token: &str) -> Result<XboxLiveResponse, String> {
        let body = serde_json::json!({
            "Properties": {
                "SandboxId": "RETAIL",
                "UserTokens": [xbl_token]
            },
            "RelyingParty": "rp://api.minecraftservices.com/",
            "TokenType": "JWT"
        });

        let response = client
            .post("https://xsts.auth.xboxlive.com/xsts/authorize")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Failed to get XSTS token: {}", e))?;

        response
            .json::<XboxLiveResponse>()
            .await
            .map_err(|e| format!("Failed to parse XSTS response: {}", e))
    }

    async fn get_mc_token(
        &self,
        client: &Client,
        xsts_token: &str,
        uhs: &str,
    ) -> Result<String, String> {
        let body = serde_json::json!({
            "identityToken": format!("XBL3.0 x={};{}", uhs, xsts_token)
        });

        let response = client
            .post("https://api.minecraftservices.com/authentication/login_with_xbox")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Failed to get Minecraft token: {}", e))?;

        let resp_json: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Minecraft token response: {}", e))?;

        resp_json["access_token"]
            .as_str()
            .ok_or_else(|| "Missing access_token in Minecraft response".to_string())
            .map(|s| s.to_string())
    }

    async fn get_mc_profile(&self, client: &Client, mc_token: &str) -> Result<MinecraftProfile, String> {
        let response = client
            .get("https://api.minecraftservices.com/minecraft/profile")
            .bearer_auth(mc_token)
            .send()
            .await
            .map_err(|e| format!("Failed to get Minecraft profile: {}", e))?;

        if !response.status().is_success() {
             return Err(format!("Failed to get Minecraft profile: status {}", response.status()));
        }

        response
            .json::<MinecraftProfile>()
            .await
            .map_err(|e| format!("Failed to parse Minecraft profile: {}", e))
    }
}
