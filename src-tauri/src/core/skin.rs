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

const PNG_SIGNATURE: &[u8; 8] = b"\x89PNG\r\n\x1a\n";
const MAX_SKIN_PNG_BYTES: usize = 2 * 1024 * 1024;

pub fn validate_skin_variant(variant: &str) -> Result<&'static str, String> {
    match variant.trim().to_ascii_lowercase().as_str() {
        "classic" => Ok("classic"),
        "slim" => Ok("slim"),
        other => Err(format!("Unsupported skin variant '{}'", other)),
    }
}

pub fn decode_validated_skin_png(texture_b64: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(texture_b64.trim())
        .map_err(|e| format!("Base64 decode error: {}", e))?;
    if bytes.is_empty() || bytes.len() > MAX_SKIN_PNG_BYTES {
        return Err("Skin PNG size is invalid".to_string());
    }
    if !bytes.starts_with(PNG_SIGNATURE) {
        return Err("Skin file must be a valid PNG image".to_string());
    }
    Ok(bytes)
}

fn skin_history_path(app_handle: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app_handle
        .path()
        .app_data_dir()
        .map(|d| d.join("skin_history.json"))
        .map_err(|e| format!("Failed to resolve skin history directory: {}", e))
}

pub fn load_skin_history(app_handle: &tauri::AppHandle) -> Result<Vec<SkinEntry>, String> {
    let path = skin_history_path(app_handle)?;
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str::<Vec<SkinEntry>>(&content)
            .map_err(|e| format!("Failed to parse skin_history.json: {}", e)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(format!("Failed to read skin_history.json: {}", e)),
    }
}

pub fn save_skin_history(
    app_handle: &tauri::AppHandle,
    history: &[SkinEntry],
) -> Result<(), String> {
    let path = skin_history_path(app_handle)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(history).map_err(|e| e.to_string())?;
    let tmp_path = path.with_extension("json.tmp");
    std::fs::write(&tmp_path, json).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp_path, &path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp_path);
        e.to_string()
    })
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

    let profile: MojangProfile = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

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

/// Uploads a new skin PNG (base64-encoded) to Mojang API using HTTP/1.1
/// to avoid HTTP/2 ALPN negotiation failures against minecraftservices.
pub async fn upload_skin_to_mojang(
    access_token: &str,
    texture_b64: &str,
    variant: &str,
) -> Result<(), String> {
    let png_bytes = decode_validated_skin_png(texture_b64)?;
    let variant_upper = validate_skin_variant(variant)?.to_uppercase();

    // Build multipart body manually
    let boundary = "LaunchedMCSkinBoundary";
    let mut body: Vec<u8> = Vec::new();
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(b"Content-Disposition: form-data; name=\"variant\"\r\n\r\n");
    body.extend_from_slice(variant_upper.as_bytes());
    body.extend_from_slice(b"\r\n");
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(
        b"Content-Disposition: form-data; name=\"file\"; filename=\"skin.png\"\r\n",
    );
    body.extend_from_slice(b"Content-Type: image/png\r\n\r\n");
    body.extend_from_slice(&png_bytes);
    body.extend_from_slice(b"\r\n");
    body.extend_from_slice(format!("--{}--\r\n", boundary).as_bytes());

    let content_type = format!("multipart/form-data; boundary={}", boundary);

    let client = reqwest::Client::builder()
        .http1_only()
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let resp = client
        .post("https://api.minecraftservices.com/minecraft/profile/skins")
        .bearer_auth(access_token)
        .header("Content-Type", &content_type)
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!(
            "Mojang skin upload failed: HTTP {} – {}",
            status, text
        ));
    }

    Ok(())
}

/// Resets skin to Mojang default (Steve/Alex).
pub async fn reset_skin_on_mojang(access_token: &str, _uuid: &str) -> Result<(), String> {
    let client = reqwest::Client::new();
    let resp = client
        .delete("https://api.minecraftservices.com/minecraft/profile/skins/active")
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() && resp.status().as_u16() != 204 {
        return Err(format!("Mojang reset skin failed: HTTP {}", resp.status()));
    }

    Ok(())
}
