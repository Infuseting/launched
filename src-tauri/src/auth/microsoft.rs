use crate::auth::{AuthResponse, AuthStrategy};
use async_trait::async_trait;
use models::*;
use reqwest::Client;
use serde::de::DeserializeOwned;
use serde::Deserialize;
use std::time::Duration;
use tauri::Emitter;
use tokio::time::sleep;

pub mod models;

const CLIENT_ID: &str = "c36a9fb6-4f2a-41ff-90bd-ae7cc92031eb";
const APP_USER_AGENT: &str = "Launched/0.1";

/**
 * Microsoft authentication strategy.
 */
pub struct MicrosoftAuth;

#[async_trait]
impl AuthStrategy for MicrosoftAuth {
    /**
     * Authenticates using Microsoft account.
     */
    async fn authenticate(&self, window: &tauri::Window) -> Result<AuthResponse, String> {
        let client = Client::builder()
            .user_agent(APP_USER_AGENT)
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        log::info!("Starting Microsoft Device Code flow...");

        // 1. Get Device Code
        let device_code_resp = self.get_device_code(&client).await?;

        // Copy to clipboard from Rust
        if let Ok(mut clipboard) = arboard::Clipboard::new() {
            let _ = clipboard.set_text(device_code_resp.user_code.clone());
            log::info!(
                "Device code copied to clipboard: {}",
                device_code_resp.user_code
            );
        }

        // Emit event to frontend to show the code
        window
            .emit("ms-device-code", &device_code_resp)
            .map_err(|e: tauri::Error| format!("Failed to emit device code event: {}", e))?;

        log::info!(
            "Device code received: {}. Waiting for user...",
            device_code_resp.user_code
        );

        // 2. Poll for Token
        let ms_token_resp = self.poll_for_token(&client, &device_code_resp).await?;
        log::info!("Microsoft token received.");

        // 3. Get Xbox Live Token
        let xbl_resp = self
            .get_xbl_token(&client, &ms_token_resp.access_token)
            .await?;
        log::info!("Xbox Live token received.");

        // 4. Get XSTS Token
        let xsts_resp = self.get_xsts_token(&client, &xbl_resp.Token).await?;
        log::info!("XSTS token received.");

        // 5. Get Minecraft Token
        let uhs = xsts_resp
            .DisplayClaims
            .xui
            .first()
            .ok_or_else(|| "Missing UHS in XSTS response".to_string())?
            .uhs
            .clone();

        let mc_token = self.get_mc_token(&client, &xsts_resp.Token, &uhs).await?;
        log::info!("Minecraft token received.");

        // 6. Get Minecraft Profile
        let profile = self.get_mc_profile(&client, &mc_token).await?;
        log::info!("Minecraft profile received for user: {}", profile.name);

        Ok(AuthResponse {
            access_token: mc_token,
            uuid: profile.id,
            name: profile.name,
            refresh_token: Some(ms_token_resp.refresh_token),
        })
    }
}

#[derive(Debug, Deserialize)]
struct MinecraftProfile {
    id: String,
    name: String,
}

impl MicrosoftAuth {
    async fn parse_json_response<T: DeserializeOwned>(
        response: reqwest::Response,
        endpoint_label: &str,
    ) -> Result<T, String> {
        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|e| format!("Failed to read {} response body: {}", endpoint_label, e))?;

        if !status.is_success() {
            return Err(format!(
                "{} failed (status {}): {}",
                endpoint_label, status, body
            ));
        }

        serde_json::from_str::<T>(&body).map_err(|e| {
            format!(
                "Failed to parse {} response: {}. Body: {}",
                endpoint_label, e, body
            )
        })
    }

    fn map_xsts_error(xerr: Option<u64>) -> Option<&'static str> {
        match xerr {
            Some(2148916233) => Some(
                "Votre compte Microsoft n'a pas de profil Xbox. Ouvrez xbox.com et terminez la creation du profil.",
            ),
            Some(2148916235) => Some(
                "Votre compte Xbox ne peut pas utiliser ce service actuellement (restriction de region ou de compte).",
            ),
            Some(2148916236) => Some(
                "Votre compte Xbox demande une verification supplementaire. Connectez-vous sur xbox.com pour la finaliser.",
            ),
            Some(2148916237) => Some(
                "Compte enfant detecte: un compte adulte doit valider les parametres famille Xbox.",
            ),
            _ => None,
        }
    }

    fn format_xsts_error(status: reqwest::StatusCode, body: &str) -> String {
        if let Ok(parsed) = serde_json::from_str::<XstsErrorResponse>(body) {
            let xerr = parsed.XErr;
            let api_message = parsed.Message.unwrap_or_else(|| "no message".to_string());

            if let Some(user_message) = Self::map_xsts_error(xerr) {
                return format!(
                    "XSTS authorize endpoint failed (status {}): {} (XErr: {:?}, API: {})",
                    status, user_message, xerr, api_message
                );
            }

            return format!(
                "XSTS authorize endpoint failed (status {}): XErr {:?}, API: {}",
                status, xerr, api_message
            );
        }

        format!("XSTS authorize endpoint failed (status {}): {}", status, body)
    }

    pub async fn is_mc_token_valid(mc_token: &str) -> bool {
        let client = match Client::builder().user_agent(APP_USER_AGENT).build() {
            Ok(c) => c,
            Err(_) => return false,
        };

        let response = client
            .get("https://api.minecraftservices.com/minecraft/profile")
            .bearer_auth(mc_token)
            .send()
            .await;

        match response {
            Ok(r) => r.status().is_success(),
            Err(_) => false,
        }
    }

    pub async fn refresh_auth(&self, refresh_token: &str) -> Result<AuthResponse, String> {
        let client = Client::builder()
            .user_agent(APP_USER_AGENT)
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        // 1. Refresh Microsoft token
        let params = [
            ("client_id", CLIENT_ID),
            ("grant_type", "refresh_token"),
            ("scope", "XboxLive.signin offline_access"),
            ("refresh_token", refresh_token),
        ];

        let response = client
            .post("https://login.microsoftonline.com/consumers/oauth2/v2.0/token")
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("Failed to refresh Microsoft token: {}", e))?;

        if !response.status().is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Failed to refresh Microsoft token: {}", body));
        }

        let ms_token_resp = response
            .json::<MicrosoftTokenResponse>()
            .await
            .map_err(|e| format!("Failed to parse refreshed Microsoft token: {}", e))?;

        // 2. Continue standard Xbox/Minecraft chain
        let xbl_resp = self
            .get_xbl_token(&client, &ms_token_resp.access_token)
            .await?;
        let xsts_resp = self.get_xsts_token(&client, &xbl_resp.Token).await?;
        let uhs = xsts_resp
            .DisplayClaims
            .xui
            .first()
            .ok_or_else(|| "Missing UHS in XSTS response".to_string())?
            .uhs
            .clone();
        let mc_token = self.get_mc_token(&client, &xsts_resp.Token, &uhs).await?;
        let profile = self.get_mc_profile(&client, &mc_token).await?;

        Ok(AuthResponse {
            access_token: mc_token,
            uuid: profile.id,
            name: profile.name,
            refresh_token: Some(ms_token_resp.refresh_token),
        })
    }

    async fn get_device_code(&self, client: &Client) -> Result<DeviceCodeResponse, String> {
        let params = [
            ("client_id", CLIENT_ID),
            ("scope", "XboxLive.signin offline_access"),
        ];

        let response = client
            .post("https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode")
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("Failed to request device code: {}", e))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!(
                "Microsoft Device Code API returned error: {}",
                error_text
            ));
        }

        let resp = response
            .json::<DeviceCodeResponse>()
            .await
            .map_err(|e| format!("Failed to parse device code response: {}", e))?;

        // Automatically open the browser
        let _ = open::that(&resp.verification_uri);

        Ok(resp)
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
        let mut total_waited = 0;

        log::info!(
            "Polling for Microsoft token every {}s (expires in {}s)...",
            device_code.interval,
            device_code.expires_in
        );

        while total_waited < device_code.expires_in {
            sleep(interval).await;
            total_waited += device_code.interval;

            let response = client
                .post("https://login.microsoftonline.com/consumers/oauth2/v2.0/token")
                .form(&params)
                .send()
                .await
                .map_err(|e| format!("Network error while polling for token: {}", e))?;

            let status = response.status();
            if status.is_success() {
                return response
                    .json::<MicrosoftTokenResponse>()
                    .await
                    .map_err(|e| format!("Failed to parse token response: {}", e));
            } else {
                let error_resp: serde_json::Value = response.json().await.map_err(|e| {
                    format!(
                        "Failed to parse Microsoft error response (status {}): {}",
                        status, e
                    )
                })?;

                if let Some(error) = error_resp.get("error").and_then(|v| v.as_str()) {
                    if error == "authorization_pending" {
                        continue;
                    } else if error == "slow_down" {
                        // Double the interval if requested
                        sleep(interval).await;
                        continue;
                    } else {
                        return Err(format!(
                            "Microsoft Token API error: {} ({})",
                            error,
                            error_resp
                                .get("error_description")
                                .and_then(|v| v.as_str())
                                .unwrap_or("no description")
                        ));
                    }
                }
            }
        }

        Err("Microsoft authentication timed out. Please try again.".to_string())
    }

    async fn get_xbl_token(
        &self,
        client: &Client,
        ms_token: &str,
    ) -> Result<XboxLiveResponse, String> {
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

        Self::parse_json_response::<XboxLiveResponse>(response, "Xbox Live authenticate endpoint")
            .await
    }

    async fn get_xsts_token(
        &self,
        client: &Client,
        xbl_token: &str,
    ) -> Result<XboxLiveResponse, String> {
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

        let status = response.status();
        let response_body = response
            .text()
            .await
            .map_err(|e| format!("Failed to read XSTS response body: {}", e))?;

        if !status.is_success() {
            return Err(Self::format_xsts_error(status, &response_body));
        }

        serde_json::from_str::<XboxLiveResponse>(&response_body).map_err(|e| {
            format!(
                "Failed to parse XSTS response: {}. Body: {}",
                e, response_body
            )
        })
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

        let token_response = Self::parse_json_response::<MinecraftTokenResponse>(
            response,
            "Minecraft login_with_xbox endpoint",
        )
        .await?;

        Ok(token_response.access_token)
    }

    async fn get_mc_profile(
        &self,
        client: &Client,
        mc_token: &str,
    ) -> Result<MinecraftProfile, String> {
        let response = client
            .get("https://api.minecraftservices.com/minecraft/profile")
            .bearer_auth(mc_token)
            .send()
            .await
            .map_err(|e| format!("Failed to get Minecraft profile: {}", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "Failed to get Minecraft profile: status {}",
                response.status()
            ));
        }

        response
            .json::<MinecraftProfile>()
            .await
            .map_err(|e| format!("Failed to parse Minecraft profile: {}", e))
    }
}
