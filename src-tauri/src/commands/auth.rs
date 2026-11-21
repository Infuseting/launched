use crate::auth::microsoft::MicrosoftAuth;
use crate::auth::secrets::SecretManager;
use crate::auth::{AuthResponse, AuthStrategy};
use crate::core::settings::SettingsManager;

#[tauri::command]
pub async fn get_auth(app_handle: tauri::AppHandle) -> Result<Option<AuthResponse>, String> {
    let mut settings = SettingsManager::load(&app_handle);
    let account =
        SecretManager::get_active_account(&app_handle, settings.active_account_uuid.as_deref());
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
    let mut settings = SettingsManager::load(&app_handle);
    settings.active_account_uuid = Some(uuid);
    SettingsManager::save(&app_handle, &settings)
}

#[tauri::command]
pub async fn remove_account(app_handle: tauri::AppHandle, uuid: String) -> Result<(), String> {
    SecretManager::remove_account(&app_handle, &uuid)
}

#[tauri::command]
pub async fn has_auth(app_handle: tauri::AppHandle) -> Result<bool, String> {
    let accounts = SecretManager::get_all_accounts(&app_handle).unwrap_or_default();
    Ok(!accounts.is_empty())
}

#[tauri::command]
pub async fn login_microsoft(
    window: tauri::Window,
    app_handle: tauri::AppHandle,
) -> Result<AuthResponse, String> {
    let auth_strategy = MicrosoftAuth;
    let response = auth_strategy.authenticate(&window).await?;

    let _ = SecretManager::add_account(&app_handle, response.clone());

    let mut settings = SettingsManager::load(&app_handle);
    settings.active_account_uuid = Some(response.uuid.clone());
    let _ = SettingsManager::save(&app_handle, &settings);

    Ok(response)
}

#[tauri::command]
pub async fn logout(app_handle: tauri::AppHandle) -> Result<(), String> {
    let settings = SettingsManager::load(&app_handle);
    if let Some(active) = &settings.active_account_uuid {
        let _ = SecretManager::remove_account(&app_handle, active);
    }
    let mut new_settings = settings.clone();
    new_settings.active_account_uuid = None;
    let _ = SettingsManager::save(&app_handle, &new_settings);
    Ok(())
}
