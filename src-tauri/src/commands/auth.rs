use crate::auth::microsoft::MicrosoftAuth;
use crate::auth::secrets::SecretManager;
use crate::auth::{AuthResponse, AuthStrategy};
use crate::core::settings::SettingsManager;

#[tauri::command]
pub async fn get_auth(app_handle: tauri::AppHandle) -> Result<Option<AuthResponse>, String> {
    let mut settings = SettingsManager::load(&app_handle);
    let account =
        SecretManager::get_active_account(&app_handle, settings.active_account_uuid.as_deref())?;
    if let Some(account) = account
        .as_ref()
        .filter(|account| settings.active_account_uuid.as_deref() != Some(account.uuid.as_str()))
    {
        settings.active_account_uuid = Some(account.uuid.clone());
        let _ = SettingsManager::save(&app_handle, &settings);
    }
    Ok(account)
}

#[tauri::command]
pub async fn get_all_accounts(app_handle: tauri::AppHandle) -> Result<Vec<AuthResponse>, String> {
    SecretManager::get_all_accounts(&app_handle)
}

#[tauri::command]
pub async fn set_active_account(app_handle: tauri::AppHandle, uuid: String) -> Result<(), String> {
    log::info!("set_active_account: {}", uuid);
    let mut settings = SettingsManager::load(&app_handle);
    settings.active_account_uuid = Some(uuid);
    SettingsManager::save(&app_handle, &settings)
}

#[tauri::command]
pub async fn remove_account(app_handle: tauri::AppHandle, uuid: String) -> Result<(), String> {
    log::info!("remove_account: {}", uuid);
    SecretManager::remove_account(&app_handle, &uuid)
}

/// Returns the active account with a validated (silently refreshed if expired) Minecraft token.
pub(crate) async fn get_valid_active_account(
    app_handle: &tauri::AppHandle,
) -> Result<AuthResponse, String> {
    let mut settings = SettingsManager::load(app_handle);
    let auth =
        SecretManager::get_active_account(app_handle, settings.active_account_uuid.as_deref())?
            .ok_or_else(|| "Not authenticated. Please login first.".to_string())?;

    if MicrosoftAuth::is_mc_token_valid(&auth.access_token).await {
        return Ok(auth);
    }

    log::warn!(
        "Stored Minecraft token is invalid/expired for account {}, attempting silent refresh…",
        auth.name
    );

    if let Some(refresh_token) = auth.refresh_token.clone() {
        match MicrosoftAuth.refresh_auth(&refresh_token).await {
            Ok(refreshed) => {
                log::info!(
                    "Successfully refreshed Minecraft auth for {}",
                    refreshed.name
                );
                SecretManager::add_account(app_handle, refreshed.clone())?;
                settings.active_account_uuid = Some(refreshed.uuid.clone());
                let _ = SettingsManager::save(app_handle, &settings);
                return Ok(refreshed);
            }
            Err(e) => {
                log::warn!("Failed to refresh Minecraft auth: {}", e);
                if e.contains("invalid_grant") || e.contains("invalid_request") {
                    let _ = SecretManager::remove_account(app_handle, &auth.uuid);
                    if settings.active_account_uuid.as_deref() == Some(auth.uuid.as_str()) {
                        settings.active_account_uuid = None;
                        let _ = SettingsManager::save(app_handle, &settings);
                    }
                    return Err(
                        "Session Minecraft expirée. Le compte a été supprimé, merci de vous reconnecter avec Microsoft."
                            .to_string(),
                    );
                }
                return Err(format!(
                    "Erreur lors de l'authentification Minecraft: {}",
                    e
                ));
            }
        }
    }

    let _ = SecretManager::remove_account(app_handle, &auth.uuid);
    if settings.active_account_uuid.as_deref() == Some(auth.uuid.as_str()) {
        settings.active_account_uuid = None;
        let _ = SettingsManager::save(app_handle, &settings);
    }
    Err(
        "Session Minecraft expirée. Le compte invalide a été supprimé, merci de vous reconnecter avec Microsoft."
            .to_string(),
    )
}

#[tauri::command]
pub async fn login_microsoft(
    window: tauri::Window,
    app_handle: tauri::AppHandle,
) -> Result<AuthResponse, String> {
    log::info!("login_microsoft started");
    let auth_strategy = MicrosoftAuth;
    let response = auth_strategy.authenticate(&window).await.map_err(|e| {
        log::error!("login_microsoft failed: {}", e);
        e
    })?;

    SecretManager::add_account(&app_handle, response.clone()).map_err(|e| {
        log::error!(
            "login_microsoft failed to store account {}: {}",
            response.name,
            e
        );
        e
    })?;

    let mut settings = SettingsManager::load(&app_handle);
    settings.active_account_uuid = Some(response.uuid.clone());
    let _ = SettingsManager::save(&app_handle, &settings);

    log::info!(
        "login_microsoft succeeded for {} ({})",
        response.name,
        response.uuid
    );
    Ok(response)
}

#[tauri::command]
pub async fn logout(app_handle: tauri::AppHandle) -> Result<(), String> {
    log::info!("logout (Microsoft active account) requested");
    let settings = SettingsManager::load(&app_handle);
    if let Some(active) = &settings.active_account_uuid {
        log::info!("Removing active Microsoft account: {}", active);
        SecretManager::remove_account(&app_handle, active)?;
    }
    let mut new_settings = settings.clone();
    new_settings.active_account_uuid = None;
    let _ = SettingsManager::save(&app_handle, &new_settings);
    Ok(())
}
