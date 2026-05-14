use serde::{Deserialize, Serialize};
use tauri::Manager;

/// Represents a saved skin entry in history.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SkinEntry {
    /// Unique ID for this skin entry.
    pub id: String,
    /// Display name given by user.
    pub name: String,
    /// Base64-encoded PNG data so we can store & render without external files.
    pub texture_b64: String,
    /// Skin model: "classic" (Steve/wide) or "slim" (Alex/narrow).
    pub variant: String,
    /// ISO timestamp of when this skin was added.
    pub added_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftProfile {
    pub uuid: String,
    pub name: String,
    pub skin_url: Option<String>,
    pub skin_variant: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MojangProfile {
    id: String,
    name: String,
    skins: Option<Vec<MojangSkin>>,
}

#[derive(Debug, Deserialize)]
struct MojangSkin {
    url: String,
    variant: Option<String>,
    state: Option<String>,
}

fn skin_history_path(app_handle: &tauri::AppHandle) -> std::path::PathBuf {
    app_handle
        .path()
        .app_data_dir()
        .unwrap()
        .join("skin_history.json")
}

pub fn load_skin_history(app_handle: &tauri::AppHandle) -> Vec<SkinEntry> {
    let path = skin_history_path(app_handle);
    if let Ok(content) = std::fs::read_to_string(&path) {
        serde_json::from_str::<Vec<SkinEntry>>(&content).unwrap_or_default()
    } else {
        vec![]
    }
}

pub fn save_skin_history(app_handle: &tauri::AppHandle, history: &[SkinEntry]) -> Result<(), String> {
    let path = skin_history_path(app_handle);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let json = serde_json::to_string_pretty(history).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

/// Fetches the current Minecraft profile & active skin info from Mojang API.
pub async fn fetch_minecraft_profile(access_token: &str) -> Result<MinecraftProfile, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.minecraftservices.com/minecraft/profile")
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Mojang API error: HTTP {}", resp.status()));
    }

    let profile: MojangProfile = resp.json().await.map_err(|e| format!("Parse error: {}", e))?;

    let active_skin = profile
        .skins
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .find(|s| s.state.as_deref() == Some("ACTIVE"));

    Ok(MinecraftProfile {
        uuid: profile.id,
        name: profile.name,
        skin_url: active_skin.map(|s| s.url.clone()),
        skin_variant: active_skin.and_then(|s| s.variant.clone()),
    })
}

/// Uploads a new skin PNG (base64-encoded) to Mojang API.
/// Uses ureq (HTTP/1.1-only, no HTTP/2) via spawn_blocking to avoid
/// any ALPN negotiation issues that caused reqwest to fail.
pub async fn upload_skin_to_mojang(
    access_token: &str,
    texture_b64: &str,
    variant: &str,
) -> Result<(), String> {
    use base64::Engine;
    let png_bytes = base64::engine::general_purpose::STANDARD
        .decode(texture_b64)
        .map_err(|e| format!("Base64 decode error: {}", e))?;

    let variant_upper = variant.to_uppercase();
    let token = access_token.to_string();

    // Build multipart body manually
    let boundary = "LaunchedMCSkinBoundary";
    let mut body: Vec<u8> = Vec::new();
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(b"Content-Disposition: form-data; name=\"variant\"\r\n\r\n");
    body.extend_from_slice(variant_upper.as_bytes());
    body.extend_from_slice(b"\r\n");
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(b"Content-Disposition: form-data; name=\"file\"; filename=\"skin.png\"\r\n");
    body.extend_from_slice(b"Content-Type: image/png\r\n\r\n");
    body.extend_from_slice(&png_bytes);
    body.extend_from_slice(b"\r\n");
    body.extend_from_slice(format!("--{}--\r\n", boundary).as_bytes());

    let content_type = format!("multipart/form-data; boundary={}", boundary);

    // ureq is a blocking client — run it on a dedicated thread
    tokio::task::spawn_blocking(move || {
        let resp = ureq::post("https://api.minecraftservices.com/minecraft/profile/skins")
            .set("Authorization", &format!("Bearer {}", token))
            .set("Content-Type", &content_type)
            .send_bytes(&body);

        match resp {
            Ok(_) => Ok(()),
            Err(ureq::Error::Status(code, resp)) => {
                let body = resp.into_string().unwrap_or_default();
                Err(format!("Mojang skin upload failed: HTTP {} – {}", code, body))
            }
            Err(e) => Err(format!("Network error: {}", e)),
        }
    })
    .await
    .map_err(|e| format!("Thread error: {}", e))?
}

/// Resets skin to Mojang default (Steve/Alex).
pub async fn reset_skin_on_mojang(access_token: &str, _uuid: &str) -> Result<(), String> {
    let client = reqwest::Client::new();
    let resp = client
        .delete(format!(
            "https://api.minecraftservices.com/minecraft/profile/skins/active"
        ))
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() && resp.status().as_u16() != 204 {
        return Err(format!("Mojang reset skin failed: HTTP {}", resp.status()));
    }

    Ok(())
}
