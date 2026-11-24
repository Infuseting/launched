use crate::auth::microsoft::MicrosoftAuth;
use crate::auth::secrets::SecretManager;
use crate::auth::AuthResponse;
use crate::core::settings::SettingsManager;
use crate::core::skin::{
    fetch_minecraft_profile, load_skin_history, reset_skin_on_mojang, save_skin_history,
    upload_skin_to_mojang, MinecraftProfile, SkinEntry,
};

/// Returns a **valid** (non-expired) Minecraft access token for the active account.
/// Mirrors the same validate → refresh → remove flow used in `launch_game`.
pub async fn get_valid_token(app_handle: &tauri::AppHandle) -> Result<String, String> {
    let mut settings = SettingsManager::load(app_handle);
    let accounts = SecretManager::get_all_accounts(app_handle)?;

    let auth = settings
        .active_account_uuid
        .as_ref()
        .and_then(|uid| accounts.iter().find(|a| a.uuid == *uid).cloned())
        .or_else(|| accounts.first().cloned())
        .ok_or_else(|| "Not authenticated – please login first.".to_string())?;

    // Token still valid → return immediately
    if MicrosoftAuth::is_mc_token_valid(&auth.access_token).await {
        return Ok(auth.access_token);
    }

    log::warn!(
        "Minecraft token expired for {}, attempting silent refresh…",
        auth.name
    );

    // Try silent refresh via the stored refresh_token
    if let Some(refresh_token) = auth.refresh_token.clone() {
        match MicrosoftAuth.refresh_auth(&refresh_token).await {
            Ok(refreshed) => {
                log::info!("Silently refreshed Minecraft token for {}", refreshed.name);
                SecretManager::add_account(app_handle, refreshed.clone())?;
                settings.active_account_uuid = Some(refreshed.uuid.clone());
                let _ = SettingsManager::save(app_handle, &settings);
                return Ok(refreshed.access_token);
            }
            Err(e) => {
                log::warn!("Silent refresh failed: {}", e);
                // Only remove the account if we are sure the refresh token is dead
                // "invalid_grant" means the refresh token is expired/revoked.
                if e.contains("invalid_grant") || e.contains("invalid_request") {
                    let _ = SecretManager::remove_account(app_handle, &auth.uuid);
                    if settings.active_account_uuid.as_deref() == Some(auth.uuid.as_str()) {
                        settings.active_account_uuid = None;
                        let _ = SettingsManager::save(app_handle, &settings);
                    }
                    return Err(
                        "Session Microsoft expirée. Le compte a été déconnecté, merci de vous reconnecter."
                            .to_string(),
                    );
                } else {
                    return Err(format!(
                        "Erreur lors du rafraîchissement de la session: {}",
                        e
                    ));
                }
            }
        }
    }

    // Refresh failed (no refresh token) → remove stale account
    let _ = SecretManager::remove_account(app_handle, &auth.uuid);
    if settings.active_account_uuid.as_deref() == Some(auth.uuid.as_str()) {
        settings.active_account_uuid = None;
        let _ = SettingsManager::save(app_handle, &settings);
    }

    Err("Session Minecraft expirée. Aucune méthode de rafraîchissement trouvée. Merci de vous reconnecter.".to_string())
}

#[tauri::command]
pub async fn get_minecraft_profile(
    app_handle: tauri::AppHandle,
) -> Result<MinecraftProfile, String> {
    log::debug!("get_minecraft_profile requested");
    let token = get_valid_token(&app_handle).await.map_err(|e| {
        log::warn!("get_minecraft_profile token error: {}", e);
        e
    })?;
    fetch_minecraft_profile(&token).await.map_err(|e| {
        log::error!("get_minecraft_profile fetch failed: {}", e);
        e
    })
}

#[tauri::command]
pub async fn get_skin_history(app_handle: tauri::AppHandle) -> Result<Vec<SkinEntry>, String> {
    Ok(load_skin_history(&app_handle))
}

#[tauri::command]
pub async fn upload_skin(
    app_handle: tauri::AppHandle,
    name: String,
    texture_b64: String,
    variant: String,
) -> Result<SkinEntry, String> {
    let token = get_valid_token(&app_handle).await?;
    upload_skin_to_mojang(&token, &texture_b64, &variant).await?;

    let entry = SkinEntry {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        texture_b64,
        variant,
        added_at: chrono::Utc::now().to_rfc3339(),
    };

    let mut history = load_skin_history(&app_handle);
    history.insert(0, entry.clone());
    history.truncate(50);
    save_skin_history(&app_handle, &history)?;
    Ok(entry)
}

/// Saves a skin entry to the local library WITHOUT making any HTTP call.
/// Used when the frontend has already done the Mojang upload via browser fetch.
#[tauri::command]
pub async fn save_skin_to_library(
    app_handle: tauri::AppHandle,
    name: String,
    texture_b64: String,
    variant: String,
) -> Result<SkinEntry, String> {
    let entry = SkinEntry {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        texture_b64,
        variant,
        added_at: chrono::Utc::now().to_rfc3339(),
    };
    let mut history = load_skin_history(&app_handle);
    history.insert(0, entry.clone());
    history.truncate(50);
    save_skin_history(&app_handle, &history)?;
    Ok(entry)
}

/// Sends a pre-serialized multipart body to Mojang's skin endpoint.
/// The frontend uses browser's FormData API to serialize the body (guaranteed correct),
/// then passes raw bytes + Content-Type header here to bypass CORS restrictions.
#[tauri::command]
pub async fn upload_skin_raw(
    app_handle: tauri::AppHandle,
    content_type: String,
    body: Vec<u8>,
) -> Result<(), String> {
    let token = get_valid_token(&app_handle).await?;

    let client = reqwest::Client::builder()
        .http1_only()
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let resp = client
        .post("https://api.minecraftservices.com/minecraft/profile/skins")
        .bearer_auth(&token)
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
pub async fn get_skin_token(app_handle: tauri::AppHandle) -> Result<String, String> {
    get_valid_token(&app_handle).await
}

#[tauri::command]
pub async fn apply_skin_from_history(
    app_handle: tauri::AppHandle,
    skin_id: String,
) -> Result<(), String> {
    let token = get_valid_token(&app_handle).await?;
    let history = load_skin_history(&app_handle);
    let entry = history
        .iter()
        .find(|e| e.id == skin_id)
        .ok_or_else(|| format!("Skin '{}' not found in history", skin_id))?;
    log::info!(
        "Applying skin '{}' ({}) from history to Mojang...",
        entry.name,
        entry.id
    );
    upload_skin_to_mojang(&token, &entry.texture_b64, &entry.variant).await?;
    log::info!("Skin '{}' successfully applied to Mojang", entry.name);
    Ok(())
}

#[tauri::command]
pub async fn reset_skin(app_handle: tauri::AppHandle) -> Result<(), String> {
    let token = get_valid_token(&app_handle).await?;
    let settings = SettingsManager::load(&app_handle);
    let uuid = settings
        .active_account_uuid
        .ok_or_else(|| "No active account".to_string())?;
    reset_skin_on_mojang(&token, &uuid).await
}

#[tauri::command]
pub async fn delete_skin_from_history(
    app_handle: tauri::AppHandle,
    skin_id: String,
) -> Result<(), String> {
    let mut history = load_skin_history(&app_handle);
    history.retain(|e| e.id != skin_id);
    save_skin_history(&app_handle, &history)
}

/// Validates the active token and silently refreshes it if expired.
/// Called at launcher startup to proactively renew credentials.
/// Returns the fresh AuthResponse so the frontend can update its cache.
#[tauri::command]
pub async fn refresh_active_token(app_handle: tauri::AppHandle) -> Result<AuthResponse, String> {
    // get_valid_token already does validate → refresh → save → error
    let token = get_valid_token(&app_handle).await?;

    // Return the full account matching this fresh token
    let accounts = SecretManager::get_all_accounts(&app_handle)?;
    accounts
        .into_iter()
        .find(|a| a.access_token == token)
        .ok_or_else(|| "Could not find refreshed account".to_string())
}
