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

#[tauri::command]
pub async fn has_auth(app_handle: tauri::AppHandle) -> Result<bool, String> {
    let accounts = SecretManager::get_all_accounts(&app_handle)?;
    Ok(!accounts.is_empty())
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
        log::error!("login_microsoft failed to store account {}: {}", response.name, e);
        e
    })?;

    let mut settings = SettingsManager::load(&app_handle);
    settings.active_account_uuid = Some(response.uuid.clone());
    let _ = SettingsManager::save(&app_handle, &settings);

    log::info!("login_microsoft succeeded for {} ({})", response.name, response.uuid);
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
