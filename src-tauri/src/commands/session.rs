use crate::auth::discord;
use crate::core::session::{Session, SessionManager};
use crate::state::{load_prefs, save_prefs, AppState, DeepLinkState};
use tauri::Manager;

/// Check local data in one batch, independently of the remote server listing.
#[tauri::command]
pub async fn get_local_session_names(
    app_handle: tauri::AppHandle,
    session_names: Vec<String>,
) -> Result<Vec<String>, String> {
    let root = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("sessions");
    SessionManager::local_session_names(&root, &session_names).await
}

/// Uninstall only this session's local data; remote access and shared runtimes remain available.
#[tauri::command]
pub async fn delete_session(app_handle: tauri::AppHandle, session: Session) -> Result<(), String> {
    let directory =
        crate::core::optional_files::OptionalFilesManager::session_dir(&app_handle, &session.name)
            .await?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app_handle.state::<AppState>();
        // Serialize with game spawning so files cannot disappear underneath a running game.
        let running = state.running_sessions.lock().unwrap();
        if running.contains_key(&directory) {
            return Err(
                "Fermez Minecraft pour cette session avant de supprimer ses fichiers.".into(),
            );
        }
        SessionManager::remove_local_files(&directory)?;
        let mut settings = crate::core::settings::SettingsManager::load(&app_handle);
        settings.sessions.remove(&session.name);
        crate::core::settings::SettingsManager::save(&app_handle, &settings)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn get_deep_link_url(state: tauri::State<'_, DeepLinkState>) -> Option<String> {
    state
        .pending_url
        .lock()
        .ok()
        .and_then(|mut guard| guard.take())
}

#[tauri::command]
pub async fn get_sessions(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<Session>, String> {
    let servers_url = std::env::var("LAUNCHED_SERVERS_URL")
        .unwrap_or_else(|_| "https://launched.infuseting.fr/sessions".to_string());

    let servers_url = if std::env::var("LAUNCHED_SERVERS_URL").is_ok() {
        servers_url
    } else {
        discord::site_url()?
            .join("sessions")
            .map_err(|e| e.to_string())?
            .to_string()
    };
    let sessions = SessionManager::fetch_sessions(&app_handle, &servers_url).await?;
    {
        let mut active = state.active_session.lock().unwrap();
        if let Some(previous) = active.as_ref() {
            *active = sessions
                .iter()
                .find(|s| s.sync_url == previous.sync_url)
                .cloned();
        }
    }

    // Check if we have a last session to restore
    let prefs = load_prefs(&app_handle);
    if let Some(last_name) = prefs.last_session_name {
        if let Some(session) = sessions.iter().find(|s| s.name == last_name) {
            let mut active = state.active_session.lock().unwrap();
            if active.is_none() {
                *active = Some(session.clone());
                log::info!("Restored active session from prefs: {}", session.name);
            }
        }
    }

    Ok(sessions)
}

/// Resolve fresh server configuration before sync/launch, including already installed sessions.
pub async fn authorized_session(
    app: &tauri::AppHandle,
    requested: &Session,
) -> Result<Session, String> {
    let url = std::env::var("LAUNCHED_SERVERS_URL").unwrap_or(
        discord::site_url()?
            .join("sessions")
            .map_err(|e| e.to_string())?
            .to_string(),
    );
    SessionManager::fetch_sessions(app, &url)
        .await?
        .into_iter()
        .find(|session| session.sync_url == requested.sync_url)
        .ok_or_else(|| {
            "Vous n’avez plus accès à cette session. Actualisez la liste des sessions.".into()
        })
}

#[tauri::command]
pub async fn get_active_session_name(
    app_handle: tauri::AppHandle,
) -> Result<Option<String>, String> {
    let prefs = load_prefs(&app_handle);
    Ok(prefs.last_session_name)
}

#[tauri::command]
pub async fn set_active_session(app_handle: tauri::AppHandle, name: String) -> Result<(), String> {
    let mut prefs = load_prefs(&app_handle);
    prefs.last_session_name = Some(name);
    save_prefs(&app_handle, &prefs);
    Ok(())
}

#[tauri::command]
pub async fn fetch_json(
    app_handle: tauri::AppHandle,
    url: String,
) -> Result<serde_json::Value, String> {
    discord::site_get(&app_handle, &url)
        .await?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_session_optional_files(
    app_handle: tauri::AppHandle,
    session: Session,
) -> Result<Vec<crate::core::optional_files::OptionalFileDto>, String> {
    let session = authorized_session(&app_handle, &session).await?;
    crate::core::optional_files::OptionalFilesManager::get_optional_files(&app_handle, &session)
        .await
}

#[tauri::command]
pub async fn set_session_optional_files(
    app_handle: tauri::AppHandle,
    session: Session,
    enabled_files: Vec<String>,
    all_optional_files: Vec<String>,
) -> Result<(), String> {
    let session = authorized_session(&app_handle, &session).await?;
    crate::core::optional_files::OptionalFilesManager::save_optional_files(
        &app_handle,
        &session,
        enabled_files,
        all_optional_files,
    )
    .await
}
