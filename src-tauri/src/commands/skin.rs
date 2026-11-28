use super::auth::get_valid_active_account;
use crate::auth::AuthResponse;
use crate::core::skin::{
    decode_validated_skin_png, fetch_minecraft_profile, load_skin_history, reset_skin_on_mojang,
    save_skin_history, upload_skin_to_mojang, validate_skin_variant, MinecraftProfile, SkinEntry,
};

#[tauri::command]
pub async fn get_minecraft_profile(
    app_handle: tauri::AppHandle,
) -> Result<MinecraftProfile, String> {
    log::debug!("get_minecraft_profile requested");
    let account = get_valid_active_account(&app_handle).await.map_err(|e| {
        log::warn!("get_minecraft_profile token error: {}", e);
        e
    })?;
    fetch_minecraft_profile(&account.access_token)
        .await
        .map_err(|e| {
            log::error!("get_minecraft_profile fetch failed: {}", e);
            e
        })
}

#[tauri::command]
pub async fn get_skin_history(app_handle: tauri::AppHandle) -> Result<Vec<SkinEntry>, String> {
    load_skin_history(&app_handle)
}

/// Saves a skin entry to the local library WITHOUT making any HTTP call.
/// Used when the frontend has already uploaded to Mojang via `upload_skin_raw`.
#[tauri::command]
pub async fn save_skin_to_library(
    app_handle: tauri::AppHandle,
    name: String,
    texture_b64: String,
    variant: String,
) -> Result<SkinEntry, String> {
    decode_validated_skin_png(&texture_b64)?;
    let variant = validate_skin_variant(&variant)?.to_string();
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() || trimmed_name.len() > 64 {
        return Err("Le nom du skin doit contenir entre 1 et 64 caractères.".to_string());
    }

    let entry = SkinEntry {
        id: uuid::Uuid::new_v4().to_string(),
        name: trimmed_name.to_string(),
        texture_b64,
        variant,
        added_at: chrono::Utc::now().to_rfc3339(),
    };
    let mut history = load_skin_history(&app_handle)?;
    history.insert(0, entry.clone());
    history.truncate(50);
    save_skin_history(&app_handle, &history)?;
    Ok(entry)
}

/// Sends a pre-serialized multipart body to Mojang's skin endpoint.
#[tauri::command]
pub async fn upload_skin_raw(
    app_handle: tauri::AppHandle,
    content_type: String,
    body: Vec<u8>,
) -> Result<(), String> {
    if !content_type
        .trim()
        .to_ascii_lowercase()
        .starts_with("multipart/form-data;")
    {
        return Err("Invalid skin upload content type".to_string());
    }
    if body.is_empty() || body.len() > 2 * 1024 * 1024 {
        return Err("Invalid skin upload payload size".to_string());
    }
    let account = get_valid_active_account(&app_handle).await?;

    let client = reqwest::Client::builder()
        .http1_only()
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let resp = client
        .post("https://api.minecraftservices.com/minecraft/profile/skins")
        .bearer_auth(&account.access_token)
        .header("Content-Type", &content_type)
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Mojang upload failed: HTTP {} – {}", status, text));
    }

    Ok(())
}

#[tauri::command]
pub async fn apply_skin_from_history(
    app_handle: tauri::AppHandle,
    skin_id: String,
) -> Result<(), String> {
    let account = get_valid_active_account(&app_handle).await?;
    let history = load_skin_history(&app_handle)?;
    let entry = history
        .iter()
        .find(|e| e.id == skin_id)
        .ok_or_else(|| format!("Skin '{}' not found in history", skin_id))?;
    log::info!(
        "Applying skin '{}' ({}) from history to Mojang...",
        entry.name,
        entry.id
    );
    upload_skin_to_mojang(&account.access_token, &entry.texture_b64, &entry.variant).await?;
    log::info!("Skin '{}' successfully applied to Mojang", entry.name);
    Ok(())
}

#[tauri::command]
pub async fn reset_skin(app_handle: tauri::AppHandle) -> Result<(), String> {
    let account = get_valid_active_account(&app_handle).await?;
    reset_skin_on_mojang(&account.access_token, &account.uuid).await
}

#[tauri::command]
pub async fn delete_skin_from_history(
    app_handle: tauri::AppHandle,
    skin_id: String,
) -> Result<(), String> {
    let mut history = load_skin_history(&app_handle)?;
    history.retain(|e| e.id != skin_id);
    save_skin_history(&app_handle, &history)
}

/// Validates the active token and silently refreshes it if expired.
#[tauri::command]
pub async fn refresh_active_token(app_handle: tauri::AppHandle) -> Result<AuthResponse, String> {
    get_valid_active_account(&app_handle).await
}
