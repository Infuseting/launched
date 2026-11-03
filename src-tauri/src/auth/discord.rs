use base64::{
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
    Engine,
};
use reqwest::{Client, StatusCode, Url};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};
use tauri::{Emitter, Manager};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};

#[derive(Default)]
pub struct DiscordState {
    login: tokio::sync::Mutex<()>,
    cancel: tokio::sync::Notify,
    guest: AtomicBool,
}

fn guest_mode(app: &tauri::AppHandle) -> bool {
    app.state::<DiscordState>().guest.load(Ordering::SeqCst)
}

#[tauri::command]
pub fn continue_without_discord(state: tauri::State<'_, DiscordState>) -> Result<(), String> {
    let _guard = state
        .login
        .try_lock()
        .map_err(|_| "Annulez la connexion Discord avant de continuer.")?;
    state.guest.store(true, Ordering::SeqCst);
    Ok(())
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordUser {
    pub discord_id: String,
    pub username: String,
    pub avatar: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct Credentials {
    token: String,
    user: DiscordUser,
}

pub fn site_url() -> Result<Url, String> {
    let configured = std::env::var("LAUNCHED_SITE_URL")
        .or_else(|_| std::env::var("LAUNCHED_SERVERS_URL"))
        .unwrap_or_else(|_| "https://launched.infuseting.fr".into());
    parse_site_url(&configured)
}

fn parse_site_url(configured: &str) -> Result<Url, String> {
    let mut url = Url::parse(configured).map_err(|_| "URL du site invalide")?;
    if !url.username().is_empty() || url.password().is_some() {
        return Err("URL du site invalide.".into());
    }
    if url.scheme() != "https"
        && !(url.scheme() == "http" && matches!(url.host_str(), Some("localhost" | "127.0.0.1")))
    {
        return Err("Le site doit utiliser HTTPS.".into());
    }
    url.set_path("/");
    url.set_query(None);
    url.set_fragment(None);
    Ok(url)
}

fn client() -> Result<Client, String> {
    Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(15))
        .read_timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())
}

fn path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("discord-auth.json"))
}

fn load(app: &tauri::AppHandle) -> Result<Option<Credentials>, String> {
    match std::fs::read_to_string(path(app)?) {
        Ok(value) => serde_json::from_str(&value).map(Some).map_err(|_| {
            "Connexion Discord enregistrée illisible. Déconnectez ce compte pour réessayer.".into()
        }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn clear(app: &tauri::AppHandle) -> Result<(), String> {
    match std::fs::remove_file(path(app)?) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

async fn checked(
    app: &tauri::AppHandle,
    response: reqwest::Response,
    token: Option<&str>,
) -> Result<reqwest::Response, String> {
    if response.status() == StatusCode::UNAUTHORIZED {
        // An old in-flight request must not disconnect a newly signed-in account.
        if let Some(token) = token {
            if !guest_mode(app) && load(app)?.is_some_and(|credentials| credentials.token == token)
            {
                clear(app)?;
                let _ = app.emit("discord-auth-required", ());
            }
        }
        return Err(if token.is_some() {
            "Connexion Discord expirée. Reconnectez-vous."
        } else {
            "Le site n’a pas autorisé l’accès aux sessions publiques. Réessayez dans un instant."
        }
        .into());
    }
    if !response.status().is_success() {
        return Err(format!(
            "Le site a refusé la requête (HTTP {}).",
            response.status().as_u16()
        ));
    }
    Ok(response)
}

// Credentials are only attached to the configured site, never to Minecraft/CDN URLs.
pub async fn site_get(app: &tauri::AppHandle, url: &str) -> Result<reqwest::Response, String> {
    let target = trusted_target(url, &site_url()?)?;
    let credentials = if guest_mode(app) {
        None
    } else {
        Some(load(app)?.ok_or("Connexion Discord requise.")?)
    };
    let mut request = client()?.get(target);
    if let Some(credentials) = &credentials {
        request = request.bearer_auth(&credentials.token);
    }
    let response = request.send().await.map_err(|e| e.to_string())?;
    checked(
        app,
        response,
        credentials
            .as_ref()
            .map(|credentials| credentials.token.as_str()),
    )
    .await
}

fn trusted_target(url: &str, site: &Url) -> Result<Url, String> {
    let target = Url::parse(url).map_err(|e| e.to_string())?;
    if target.origin() != site.origin()
        || !target.username().is_empty()
        || target.password().is_some()
    {
        return Err("Origine de session non autorisée.".into());
    }
    Ok(target)
}

#[tauri::command]
pub async fn get_discord_auth(app_handle: tauri::AppHandle) -> Result<Option<DiscordUser>, String> {
    if guest_mode(&app_handle) || load(&app_handle)?.is_none() {
        return Ok(None);
    }
    let url = site_url()?
        .join("api/auth/launcher/me")
        .map_err(|e| e.to_string())?;
    match site_get(&app_handle, url.as_str()).await {
        Ok(response) => response.json().await.map(Some).map_err(|e| e.to_string()),
        Err(_) if load(&app_handle)?.is_none() => Ok(None),
        Err(e) => Err(e),
    }
}

fn random_secret() -> String {
    // UUID v4 draws from the OS CSPRNG; two UUIDs provide more than 240 random bits.
    URL_SAFE_NO_PAD.encode(
        [
            uuid::Uuid::new_v4().as_bytes().as_slice(),
            uuid::Uuid::new_v4().as_bytes().as_slice(),
        ]
        .concat(),
    )
}

#[tauri::command]
pub async fn login_discord(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, DiscordState>,
) -> Result<DiscordUser, String> {
    let _guard = state
        .login
        .try_lock()
        .map_err(|_| "Une connexion Discord est déjà en cours.")?;
    let result = tokio::select! {
        result = login(&app_handle) => result,
        _ = state.cancel.notified() => Err("Connexion annulée.".into()),
    };
    focus_launcher(&app_handle);
    result
}

#[tauri::command]
pub fn cancel_discord_login(state: tauri::State<'_, DiscordState>) {
    state.cancel.notify_waiters();
}

async fn login(app: &tauri::AppHandle) -> Result<DiscordUser, String> {
    let site = site_url()?;
    ensure_login_ready(&site).await?;
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| e.to_string())?;
    let redirect = format!(
        "http://127.0.0.1:{}/callback",
        listener.local_addr().map_err(|e| e.to_string())?.port()
    );
    let verifier = random_secret();
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let expected_state = random_secret();
    let mut url = site
        .join("api/auth/discord/login")
        .map_err(|e| e.to_string())?;
    url.query_pairs_mut()
        .append_pair("launcher_redirect", &redirect)
        .append_pair("code_challenge", &challenge)
        .append_pair("launcher_state", &expected_state);
    open::that(url.as_str()).map_err(|e| format!("Impossible d’ouvrir le navigateur : {}", e))?;

    let result = tokio::time::timeout(
        Duration::from_secs(600),
        receive_callback(&listener, &expected_state),
    )
    .await;
    focus_launcher(app);
    let code = result.map_err(|_| "La connexion a expiré. Réessayez.")??;

    let response = client()?
        .post(
            site.join("api/auth/launcher/token")
                .map_err(|e| e.to_string())?,
        )
        .json(&serde_json::json!({ "code": code, "verifier": verifier }))
        .send()
        .await
        .map_err(|_| {
            "Impossible de joindre le site Launched. Vérifiez votre connexion puis réessayez."
        })?;
    if !response.status().is_success() {
        return Err(if response.status() == StatusCode::UNAUTHORIZED {
            "Le code de connexion est expiré ou invalide. Recommencez la connexion Discord."
        } else {
            "Le site n’a pas pu valider votre connexion. Réessayez dans un instant."
        }
        .into());
    }
    let credentials: Credentials = response
        .json()
        .await
        .map_err(|_| "La réponse du site est invalide. Réessayez.")?;
    let local_path = path(app)?;
    if let Some(parent) = local_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|_| "Impossible d’enregistrer la connexion sur cet ordinateur.")?;
    }
    std::fs::write(
        local_path,
        serde_json::to_vec(&credentials).map_err(|e| e.to_string())?,
    )
    .map_err(|_| "Impossible d’enregistrer la connexion sur cet ordinateur.")?;
    app.state::<DiscordState>()
        .guest
        .store(false, Ordering::SeqCst);
    Ok(credentials.user)
}

fn focus_launcher(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

async fn ensure_login_ready(site: &Url) -> Result<(), String> {
    let response = client()?
        .get(
            site.join("api/auth/launcher/ready")
                .map_err(|e| e.to_string())?,
        )
        .send()
        .await
        .map_err(|_| {
            "Impossible de joindre le site Launched. Vérifiez votre connexion puis réessayez."
        })?;
    let success = response.status().is_success();
    let body = response
        .json::<serde_json::Value>()
        .await
        .map_err(|_| "Le service de connexion du site est indisponible. Réessayez plus tard.")?;
    if success && body.get("ready").and_then(|value| value.as_bool()) == Some(true) {
        return Ok(());
    }
    Err(body
        .get("error")
        .and_then(|value| value.as_str())
        .filter(|message| !message.is_empty())
        .map(|message| message.chars().take(240).collect())
        .unwrap_or_else(|| "Le service de connexion est indisponible. Réessayez plus tard.".into()))
}

fn authentication_error(code: &str) -> &'static str {
    match code {
        "access_denied" => "Vous avez annulé l’autorisation Discord.",
        "invalid_csrf_state" => "La demande de connexion a expiré ou n’est plus valide. Réessayez.",
        "missing_code" => "Discord n’a pas renvoyé de code de connexion. Réessayez.",
        "auth_failed" => "Discord n’a pas pu valider la connexion. Réessayez.",
        "profile_failed" => "Impossible de récupérer votre profil Discord. Réessayez.",
        "server_configuration" => {
            "La connexion Discord est indisponible sur le site. Réessayez plus tard."
        }
        "server_error" => "Le site n’a pas pu terminer la connexion. Réessayez dans un instant.",
        _ => "La connexion Discord a échoué. Réessayez.",
    }
}

fn callback_result(callback: &Url, expected_state: &str) -> Option<Result<String, String>> {
    let params: std::collections::HashMap<_, _> = callback.query_pairs().into_owned().collect();
    if callback.path() != "/callback"
        || params.get("state").map(String::as_str) != Some(expected_state)
    {
        return None;
    }
    Some(if let Some(error) = params.get("error") {
        Err(authentication_error(error).into())
    } else {
        params
            .get("code")
            .filter(|code| !code.is_empty())
            .cloned()
            .ok_or_else(|| authentication_error("missing_code").into())
    })
}

fn callback_response() -> String {
    // Never reflect the authorization code, state or provider error in the page.
    let script = r#"try { history.replaceState(null, '', '/callback'); } catch {} window.close();"#;
    let script_hash = STANDARD.encode(Sha256::digest(script.as_bytes()));
    let body = format!(
        r#"<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Launched</title><script>{script}</script><style>html{{color-scheme:dark}}body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0a;color:#a3a3a3;font:14px system-ui}}main{{text-align:center;padding:24px}}p{{margin:8px 0}}strong{{color:#fff;font-weight:600}}</style></head><body><main><p><strong>Retour dans Launched</strong></p><p>Vous pouvez fermer cet onglet.</p></main></body></html>"#
    );
    format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nX-Content-Type-Options: nosniff\r\nContent-Security-Policy: default-src 'none'; script-src 'sha256-{}'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", script_hash, body.len(), body)
}

async fn receive_callback(listener: &TcpListener, expected_state: &str) -> Result<String, String> {
    loop {
        let (mut stream, _) = listener.accept().await.map_err(|e| e.to_string())?;
        let mut bytes = vec![0u8; 8192];
        let count = match tokio::time::timeout(Duration::from_secs(3), async {
            let mut count = 0;
            while count < bytes.len() {
                let read = stream.read(&mut bytes[count..]).await?;
                if read == 0 {
                    break;
                }
                count += read;
                if bytes[..count].windows(4).any(|part| part == b"\r\n\r\n") {
                    break;
                }
            }
            Ok::<usize, std::io::Error>(count)
        })
        .await
        {
            Ok(Ok(count)) => count,
            _ => continue,
        };
        let request = String::from_utf8_lossy(&bytes[..count]);
        let target = request
            .lines()
            .next()
            .and_then(|line| line.strip_prefix("GET "))
            .and_then(|line| line.split_whitespace().next());
        let callback =
            target.and_then(|target| Url::parse(&format!("http://127.0.0.1{}", target)).ok());
        let Some(callback) = callback else { continue };
        let Some(result) = callback_result(&callback, expected_state) else {
            let _ = stream
                .write_all(
                    b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                )
                .await;
            continue;
        };
        // Browser closure is best-effort; a blocked close or disconnected
        // browser must never prevent the result from reaching the launcher.
        let reply = callback_response();
        let _ = tokio::time::timeout(Duration::from_secs(2), async {
            stream.write_all(reply.as_bytes()).await?;
            stream.shutdown().await
        })
        .await;
        return result;
    }
}

#[tauri::command]
pub async fn logout_discord(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(credentials) = load(&app_handle)? {
        let response = client()?
            .post(
                site_url()?
                    .join("api/auth/launcher/logout")
                    .map_err(|e| e.to_string())?,
            )
            .bearer_auth(credentials.token)
            .send()
            .await
            .map_err(|_| {
                "Déconnexion impossible : vérifiez votre connexion au site puis réessayez."
            })?;
        if !response.status().is_success() {
            return Err("Le site n’a pas confirmé la déconnexion. Réessayez.".into());
        }
    }
    clear(&app_handle)?;
    app_handle
        .state::<DiscordState>()
        .guest
        .store(false, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub async fn fetch_session_image(
    app_handle: tauri::AppHandle,
    url: String,
) -> Result<String, String> {
    let response = site_get(&app_handle, &url).await?;
    let mime = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/png")
        .to_string();
    if !mime.starts_with("image/") {
        return Err("Visuel invalide.".into());
    }
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    Ok(format!("data:{};base64,{}", mime, STANDARD.encode(bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn callback_errors_are_safe_and_specific_to_the_failure() {
        let callback =
            |query: &str| Url::parse(&format!("http://127.0.0.1/callback?{}", query)).unwrap();
        assert_eq!(
            callback_result(&callback("state=wrong&error=server_error"), "expected"),
            None
        );
        assert_eq!(
            callback_result(
                &callback("state=expected&code=authorization-secret"),
                "expected"
            ),
            Some(Ok("authorization-secret".into()))
        );
        assert_eq!(
            callback_result(&callback("state=expected&error=access_denied"), "expected"),
            Some(Err(authentication_error("access_denied").into()))
        );
        assert_eq!(
            callback_result(&callback("state=expected&error=server_error"), "expected"),
            Some(Err(authentication_error("server_error").into()))
        );
        assert_eq!(
            callback_result(
                &callback("state=expected&error=%3Cscript%3Esecret%3C/script%3E"),
                "expected"
            ),
            Some(Err(authentication_error("unknown").into()))
        );
    }

    #[test]
    fn callback_page_has_no_credentials_and_permits_only_its_close_script() {
        let response = callback_response();
        let (headers, body) = response.split_once("\r\n\r\n").unwrap();
        let script = body
            .split_once("<script>")
            .unwrap()
            .1
            .split_once("</script>")
            .unwrap()
            .0;
        let expected_hash = STANDARD.encode(Sha256::digest(script.as_bytes()));
        assert!(headers.contains(&format!("script-src 'sha256-{}'", expected_hash)));
        assert!(headers.contains(&format!("Content-Length: {}\r\n", body.len())));
        assert!(headers.contains("Cache-Control: no-store"));
        assert!(headers.contains("Referrer-Policy: no-referrer"));
        assert!(script.contains("window.close()"));
        assert!(script.contains("history.replaceState"));
        assert!(!body.contains("authorization-secret"));
        assert!(!body.contains("error="));
    }

    #[tokio::test]
    async fn loopback_callback_sends_the_close_page_for_both_success_and_error() {
        for query in ["code=authorization-secret", "error=server_error"] {
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let origin = format!("http://{}", listener.local_addr().unwrap());
            let pending =
                tokio::spawn(async move { receive_callback(&listener, "expected").await });
            let http = Client::builder()
                .timeout(Duration::from_secs(5))
                .build()
                .unwrap();
            let invalid = http
                .get(format!("{}/callback?state=wrong&{}", origin, query))
                .send()
                .await
                .unwrap();
            assert_eq!(invalid.status(), StatusCode::BAD_REQUEST);
            let valid = http
                .get(format!("{}/callback?state=expected&{}", origin, query))
                .send()
                .await
                .unwrap();
            assert_eq!(valid.status(), StatusCode::OK);
            assert_eq!(
                valid.headers().get("content-type").unwrap(),
                "text/html; charset=utf-8"
            );
            let body = valid.text().await.unwrap();
            assert!(body.contains("window.close()"));
            assert!(!body.contains("authorization-secret"));
            let result = tokio::time::timeout(Duration::from_secs(5), pending)
                .await
                .unwrap()
                .unwrap();
            if query.starts_with("code=") {
                assert_eq!(result.unwrap(), "authorization-secret");
            } else {
                assert_eq!(result.unwrap_err(), authentication_error("server_error"));
            }
        }
    }

    #[test]
    fn credentials_only_go_to_the_exact_site_origin() {
        let site = parse_site_url("https://launched.example/sessions").unwrap();
        assert!(trusted_target(
            "https://launched.example:443/api/sessions/private/sync",
            &site
        )
        .is_ok());
        for url in [
            "https://cdn.example/mod.jar",
            "https://launched.example.evil.test/sessions",
            "http://launched.example/sessions",
            "https://launched.example:8443/sessions",
            "https://user@launched.example/sessions",
        ] {
            assert!(trusted_target(url, &site).is_err(), "{}", url);
        }
    }

    #[test]
    fn site_requires_https_except_local_development() {
        assert_eq!(
            parse_site_url("https://launched.example/sessions?secret=unused")
                .unwrap()
                .as_str(),
            "https://launched.example/"
        );
        assert!(parse_site_url("http://127.0.0.1:3000").is_ok());
        assert!(parse_site_url("http://localhost:3000").is_ok());
        assert!(parse_site_url("http://remote.example").is_err());
        assert!(parse_site_url("https://user:password@launched.example").is_err());
    }
}
