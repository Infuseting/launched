mod rpc;

use super::settings::SettingsManager;
use crate::auth::secrets::SecretManager;
use fs2::FileExt;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    env,
    ffi::OsString,
    fs,
    io::{self, ErrorKind},
    path::{Path, PathBuf},
    process::Command,
    time::Duration,
};
use tauri::Manager;
use tokio::{io::AsyncReadExt, sync::Notify, time::sleep};

const LAUNCHED_APPLICATION_ID: &str = "1552256142317453423";
const LAUNCHED_DISCORD_INVITE: &str = "https://discord.gg/BWaj9JzsX6";
const AGENT_JAR: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/discord-presence.jar"));
const WORKER_ENV: &str = "LAUNCHED_DISCORD_WORKER";
const CONFIG_ENV: &str = "LAUNCHED_DISCORD_PRESENCE";
const LOCK_DIR_ENV: &str = "LAUNCHED_DISCORD_LOCK_DIR";
const LOCK_POLL_INTERVAL: Duration = Duration::from_millis(250);

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordPresence {
    application_id: String,
    show_elapsed: bool,
    activity: Activity,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct Activity {
    #[serde(rename = "type")]
    kind: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    status_display_type: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    details: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    details_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    state: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    state_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    assets: Option<Assets>,
    #[serde(skip_serializing_if = "Option::is_none")]
    buttons: Option<Vec<Button>>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
struct Assets {
    #[serde(skip_serializing_if = "Option::is_none")]
    large_image: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    large_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    large_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    small_image: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    small_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    small_url: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct Button {
    label: String,
    url: String,
}

fn valid_url(url: &str) -> bool {
    url.len() <= 256
        && reqwest::Url::parse(url).is_ok_and(|parsed| {
            matches!(parsed.scheme(), "http" | "https")
                && parsed.username().is_empty()
                && parsed.password().is_none()
                && parsed.has_host()
        })
}

impl DiscordPresence {
    pub(crate) fn launched(session_name: Option<&str>, account_uuid: Option<&str>) -> Self {
        Self {
            application_id: LAUNCHED_APPLICATION_ID.into(),
            show_elapsed: session_name.is_some(),
            activity: Activity {
                kind: 0,
                status_display_type: None,
                name: None,
                details: Some(
                    session_name.map_or_else(|| "Dans le launcher".into(), session_details),
                ),
                details_url: None,
                state: None,
                state_url: None,
                assets: Some(Assets {
                    large_image: Some("icon".into()),
                    small_image: account_uuid.and_then(minecraft_avatar),
                    ..Assets::default()
                }),
                buttons: Some(vec![Button {
                    label: "Discord".into(),
                    url: LAUNCHED_DISCORD_INVITE.into(),
                }]),
            },
        }
    }

    fn is_valid(&self) -> bool {
        let activity = &self.activity;
        let id = &self.application_id;
        let mut links = vec![
            activity.details_url.as_deref(),
            activity.state_url.as_deref(),
        ];
        if let Some(assets) = &activity.assets {
            links.extend([assets.large_url.as_deref(), assets.small_url.as_deref()]);
            links.extend(
                [&assets.large_image, &assets.small_image]
                    .into_iter()
                    .map(|image| {
                        image.as_deref().filter(|value| {
                            !value
                                .bytes()
                                .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, b'-' | b'_'))
                        })
                    }),
            );
        }
        (17..=20).contains(&id.len())
            && id.as_bytes()[0].is_ascii_digit()
            && !id.starts_with('0')
            && id.parse::<u64>().is_ok()
            && matches!(activity.kind, 0 | 2 | 3 | 5)
            && matches!(activity.status_display_type, None | Some(0..=2))
            && links.into_iter().flatten().all(valid_url)
            && activity.buttons.as_ref().map_or(true, |buttons| {
                buttons.len() <= 2
                    && buttons.iter().all(|button| {
                        (1..=32).contains(&button.label.encode_utf16().count())
                            && valid_url(&button.url)
                    })
            })
    }

    fn payload(&self, started_at: i64) -> Value {
        let mut activity = json!(self.activity);
        if self.show_elapsed {
            activity["timestamps"] = json!({"start": started_at});
        }
        activity
    }
}

fn session_details(name: &str) -> String {
    let name: String = name
        .chars()
        .filter(|ch| !ch.is_control() || ch.is_whitespace())
        .collect();
    let name = name.split_whitespace().collect::<Vec<_>>().join(" ");
    if name.is_empty() {
        return "En jeu".into();
    }
    format!("Sur {name}")
        .chars()
        .scan(128usize, |remaining, ch| {
            *remaining = remaining.checked_sub(ch.len_utf16())?;
            Some(ch)
        })
        .collect()
}

fn minecraft_avatar(account_uuid: &str) -> Option<String> {
    let uuid = uuid::Uuid::parse_str(account_uuid).ok()?;
    (!uuid.is_nil()).then(|| format!("https://mc-heads.net/avatar/{}/64.png", uuid.simple()))
}

pub(crate) fn deserialize_optional<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<DiscordPresence>, D::Error> {
    let value = Value::deserialize(deserializer)?;
    Ok(serde_json::from_value::<DiscordPresence>(value)
        .ok()
        .filter(DiscordPresence::is_valid))
}

pub(crate) fn configure_java(
    cmd: &mut Command,
    game_dir: &Path,
    app_dir: &Path,
    presence: &DiscordPresence,
) -> io::Result<()> {
    let executable = env::current_exe()?;
    #[cfg(target_os = "linux")]
    let executable = env::var_os("APPIMAGE")
        .map(PathBuf::from)
        .filter(|path| path.is_absolute() && path.is_file())
        .unwrap_or(executable);
    let jar_hash = Sha256::digest(AGENT_JAR);
    let file = format!("discord-presence-{jar_hash:x}.jar");
    let mut jar = app_dir.join("discord-presence").join(&file);
    let mut agent_arg = OsString::from("-javaagent:");
    if jar.to_string_lossy().contains('=') {
        // HotSpot uses '=' to separate a javaagent path from its options.
        let relative = PathBuf::from(".launched").join(file);
        jar = game_dir.join(&relative);
        agent_arg.push(relative);
    } else {
        agent_arg.push(&jar);
    }
    install_agent(&jar)?;

    let config = serde_json::to_string(presence)?;
    cmd.arg(agent_arg)
        .env(WORKER_ENV, executable)
        .env(CONFIG_ENV, config)
        .env(LOCK_DIR_ENV, app_dir.join("discord-presence"));
    #[cfg(unix)]
    cmd.env(
        "LAUNCHED_DISCORD_LIBRARY_PATH",
        env::var_os("LD_LIBRARY_PATH").unwrap_or_default(),
    );
    Ok(())
}

fn install_agent(jar: &Path) -> io::Result<()> {
    if fs::read(jar).is_ok_and(|bytes| bytes == AGENT_JAR) {
        return Ok(());
    }
    fs::create_dir_all(jar.parent().unwrap())?;
    let temporary = jar.with_extension(uuid::Uuid::new_v4().to_string());
    let result = fs::write(&temporary, AGENT_JAR).and_then(|_| fs::rename(&temporary, jar));
    if result.is_err() {
        let _ = fs::remove_file(temporary);
        if fs::read(jar).is_ok_and(|bytes| bytes == AGENT_JAR) {
            return Ok(());
        }
    }
    result
}

struct PresenceLocks {
    game: fs::File,
    launcher: fs::File,
}

impl PresenceLocks {
    fn open(dir: &Path) -> io::Result<Self> {
        fs::create_dir_all(dir)?;
        let open = |file| {
            fs::OpenOptions::new()
                .read(true)
                .write(true)
                .create(true)
                .truncate(false)
                .open(dir.join(file))
        };
        Ok(Self {
            game: open("game.lock")?,
            launcher: open("launcher.lock")?,
        })
    }

    fn game_active(&self) -> io::Result<bool> {
        if acquired(FileExt::try_lock_exclusive(&self.game))? {
            FileExt::unlock(&self.game)?;
            return Ok(false);
        }
        Ok(true)
    }

    fn acquire_launcher(&self) -> io::Result<bool> {
        if self.game_active()? || !acquired(FileExt::try_lock_exclusive(&self.launcher))? {
            return Ok(false);
        }
        // A game might have started between probing and acquiring the lease.
        if self.game_active()? {
            FileExt::unlock(&self.launcher)?;
            return Ok(false);
        }
        Ok(true)
    }
}

fn acquired(result: io::Result<()>) -> io::Result<bool> {
    match result {
        Ok(()) => Ok(true),
        Err(error) if error.raw_os_error() == fs2::lock_contended_error().raw_os_error() => {
            Ok(false)
        }
        Err(error) => Err(error),
    }
}

async fn wait_for(mut ready: impl FnMut() -> io::Result<bool>) -> io::Result<()> {
    while !ready()? {
        sleep(LOCK_POLL_INTERVAL).await;
    }
    Ok(())
}

#[derive(Default)]
pub(crate) struct LauncherPresenceState {
    account_changed: Notify,
}

pub(crate) fn notify_account_change(app: &tauri::AppHandle) {
    if let Some(presence) = app.try_state::<LauncherPresenceState>() {
        presence.account_changed.notify_one();
    }
}

fn active_account_uuid(app: &tauri::AppHandle) -> Option<String> {
    let settings = SettingsManager::load(app);
    SecretManager::get_active_account(app, settings.active_account_uuid.as_deref())
        .map(|account| account.uuid)
}

pub(crate) async fn launcher_presence(app: &tauri::AppHandle, app_dir: &Path) -> io::Result<()> {
    let locks = PresenceLocks::open(&app_dir.join("discord-presence"))?;
    let state = app.state::<LauncherPresenceState>();
    loop {
        wait_for(|| locks.acquire_launcher()).await?;
        let account_uuid = active_account_uuid(app);
        let config = DiscordPresence::launched(None, account_uuid.as_deref());
        rpc::publish_until(&config, async {
            let game_started = wait_for(|| locks.game_active());
            tokio::pin!(game_started);
            loop {
                tokio::select! {
                    biased;
                    result = &mut game_started => return result,
                    _ = state.account_changed.notified() => {
                        if active_account_uuid(app) != account_uuid {
                            return Ok(());
                        }
                    }
                }
            }
        })
        .await?;
        FileExt::unlock(&locks.launcher)?;
    }
}

// Entered before Tauri setup. The only lifetime signal is the pipe from Java.
#[tokio::main(flavor = "current_thread")]
pub async fn run_worker() -> io::Result<()> {
    let config = env::var(CONFIG_ENV)
        .ok()
        .and_then(|value| serde_json::from_str::<DiscordPresence>(&value).ok())
        .filter(DiscordPresence::is_valid)
        .ok_or(ErrorKind::InvalidInput)?;
    let lock_dir = env::var_os(LOCK_DIR_ENV).ok_or(ErrorKind::InvalidInput)?;
    let locks = PresenceLocks::open(Path::new(&lock_dir))?;

    let mut pipe = tokio::io::stdin();
    let mut signal = [0u8; 1];
    let shutdown = async { pipe.read(&mut signal).await.map(|_| ()) };
    tokio::pin!(shutdown);

    // Mark the game active before waiting for any launcher to clear its status.
    // Shared leases allow concurrent games while keeping the launcher suspended.
    tokio::select! {
        biased;
        result = &mut shutdown => return result,
        result = wait_for(|| acquired(FileExt::try_lock_shared(&locks.game))) => result?,
    }
    tokio::select! {
        biased;
        result = &mut shutdown => return result,
        result = wait_for(|| acquired(FileExt::try_lock_shared(&locks.launcher))) => result?,
    }
    rpc::publish_until(&config, shutdown).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launched_activity_uses_branding_and_the_selected_minecraft_head() {
        let launcher =
            DiscordPresence::launched(None, Some("c5ef3347-4593-4f39-8bb1-2eaa40dd986e"));
        assert_eq!(launcher.application_id, "1552256142317453423");
        assert!(launcher.is_valid());
        assert_eq!(
            launcher.payload(123),
            json!({
                "type": 0,
                "details": "Dans le launcher",
                "assets": {
                    "large_image": "icon",
                    "small_image": "https://mc-heads.net/avatar/c5ef334745934f398bb12eaa40dd986e/64.png",
                },
                "buttons": [{"label": "Discord", "url": "https://discord.gg/BWaj9JzsX6"}],
            })
        );

        let game = DiscordPresence::launched(
            Some("  MineRP\n  Saison 2  "),
            Some("7fae8afc9afa4ca580e6dbaa80d78f7d"),
        );
        let activity = game.payload(123);
        assert_eq!(activity["details"], "Sur MineRP Saison 2");
        assert_eq!(activity["timestamps"]["start"], 123);
        assert_eq!(
            activity["assets"]["small_image"],
            "https://mc-heads.net/avatar/7fae8afc9afa4ca580e6dbaa80d78f7d/64.png"
        );
    }

    #[test]
    fn offline_activity_keeps_the_logo_and_bounds_the_session_text() {
        let name = "🎮".repeat(128);
        let offline =
            DiscordPresence::launched(Some(&name), Some("00000000-0000-0000-0000-000000000000"));
        let activity = offline.payload(123);
        assert_eq!(activity["assets"], json!({"large_image": "icon"}));
        assert_eq!(
            activity["details"].as_str().unwrap().encode_utf16().count(),
            128
        );
    }
}
