use super::DiscordPresence;
use serde_json::{json, Value};
use std::{future::Future, io, time::Duration};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt},
    time::{sleep, timeout},
};

const HANDSHAKE: u32 = 0;
const FRAME: u32 = 1;
const CLOSE: u32 = 2;
const PING: u32 = 3;
const PONG: u32 = 4;
const RETRY_DELAY: Duration = Duration::from_secs(5);
const RPC_TIMEOUT: Duration = Duration::from_secs(2);
const CLEAR_TIMEOUT: Duration = Duration::from_millis(750);

#[cfg(windows)]
async fn connect() -> Option<tokio::net::windows::named_pipe::NamedPipeClient> {
    use tokio::net::windows::named_pipe::ClientOptions;
    (0..10).find_map(|index| {
        ClientOptions::new()
            .open(format!(r"\\.\pipe\discord-ipc-{index}"))
            .ok()
    })
}

#[cfg(unix)]
async fn connect() -> Option<tokio::net::UnixStream> {
    use std::{env, path::PathBuf};
    use tokio::net::UnixStream;

    let dirs = ["XDG_RUNTIME_DIR", "TMPDIR", "TMP", "TEMP"]
        .into_iter()
        .filter_map(env::var_os)
        .filter(|path| !path.is_empty())
        .map(PathBuf::from)
        .chain([PathBuf::from("/tmp")]);
    for dir in dirs {
        for index in 0..10 {
            let name = format!("discord-ipc-{index}");
            if let Ok(stream) = UnixStream::connect(dir.join(&name)).await {
                return Some(stream);
            }
            // Flatpak's Discord socket lives below its runtime directory.
            if let Ok(stream) =
                UnixStream::connect(dir.join("app/com.discordapp.Discord").join(&name)).await
            {
                return Some(stream);
            }
        }
    }
    None
}

async fn write_packet(
    stream: &mut (impl AsyncWrite + Unpin),
    opcode: u32,
    body: &[u8],
) -> io::Result<()> {
    let mut packet = Vec::with_capacity(8 + body.len());
    packet.extend_from_slice(&opcode.to_le_bytes());
    packet.extend_from_slice(&(body.len() as u32).to_le_bytes());
    packet.extend_from_slice(body);
    stream.write_all(&packet).await
}

async fn read_packet(stream: &mut (impl AsyncRead + Unpin)) -> io::Result<(u32, Vec<u8>)> {
    let opcode = stream.read_u32_le().await?;
    let length = stream.read_u32_le().await? as usize;
    if length > 64 * 1024 {
        return Err(io::ErrorKind::InvalidData.into());
    }
    let mut body = vec![0; length];
    stream.read_exact(&mut body).await?;
    Ok((opcode, body))
}

async fn wait_response(
    stream: &mut (impl AsyncRead + AsyncWrite + Unpin),
    matches: impl Fn(&Value) -> bool,
) -> io::Result<()> {
    loop {
        let (opcode, body) = read_packet(stream).await?;
        match opcode {
            CLOSE => return Err(io::ErrorKind::ConnectionAborted.into()),
            PING => write_packet(stream, PONG, &body).await?,
            FRAME => {
                let response: Value = serde_json::from_slice(&body)?;
                if response["evt"] == "ERROR" && matches(&response) {
                    let code = response["data"]["code"].as_u64().unwrap_or(0);
                    return Err(io::Error::other(format!("Discord RPC error {code}")));
                }
                if matches(&response) {
                    return Ok(());
                }
            }
            _ => {}
        }
    }
}

async fn set_activity(
    stream: &mut (impl AsyncRead + AsyncWrite + Unpin),
    pid: u32,
    activity: &Value,
) -> io::Result<()> {
    let nonce = uuid::Uuid::new_v4().to_string();
    let command = json!({
        "cmd": "SET_ACTIVITY",
        "nonce": nonce,
        "args": { "pid": pid, "activity": activity },
    });
    write_packet(stream, FRAME, &serde_json::to_vec(&command)?).await?;
    wait_response(stream, |response| response["nonce"] == nonce).await
}

async fn register(
    stream: &mut (impl AsyncRead + AsyncWrite + Unpin),
    application_id: &str,
    pid: u32,
    activity: &Value,
) -> io::Result<()> {
    let handshake = serde_json::to_vec(&json!({"v": 1, "client_id": application_id}))?;
    write_packet(stream, HANDSHAKE, &handshake).await?;
    wait_response(stream, |response| {
        matches!(response["evt"].as_str(), Some("READY" | "ERROR"))
    })
    .await?;
    set_activity(stream, pid, activity).await
}

// Returns Some on owner shutdown, or None when Discord disconnected.
async fn monitor(
    stream: &mut (impl AsyncRead + AsyncWrite + Unpin),
    pid: u32,
    mut stop: std::pin::Pin<&mut impl Future<Output = io::Result<()>>>,
) -> Option<io::Result<()>> {
    loop {
        let packet = tokio::select! {
            biased;
            result = &mut stop => {
                let _ = timeout(CLEAR_TIMEOUT, set_activity(stream, pid, &Value::Null)).await;
                return Some(result);
            }
            packet = read_packet(stream) => packet,
        };
        match packet {
            Ok((PING, body)) => {
                if !matches!(
                    timeout(RPC_TIMEOUT, write_packet(stream, PONG, &body)).await,
                    Ok(Ok(()))
                ) {
                    return None;
                }
            }
            Ok((CLOSE, _)) | Err(_) => return None,
            _ => {}
        }
    }
}

pub(super) async fn publish_until(
    config: &DiscordPresence,
    stop: impl Future<Output = io::Result<()>>,
) -> io::Result<()> {
    let pid = std::process::id();
    let activity = config.payload(chrono::Utc::now().timestamp());
    tokio::pin!(stop);
    loop {
        let stream = tokio::select! {
            biased;
            result = &mut stop => return result,
            stream = connect() => stream,
        };
        if let Some(mut stream) = stream {
            let registered = timeout(
                RPC_TIMEOUT,
                register(&mut stream, &config.application_id, pid, &activity),
            )
            .await;
            match registered {
                Ok(Ok(())) => {
                    if let Some(result) = monitor(&mut stream, pid, stop.as_mut()).await {
                        return result;
                    }
                }
                Ok(Err(error)) => log::debug!("Discord Rich Presence: {error}"),
                Err(_) => log::debug!("Discord Rich Presence: RPC timeout"),
            }
        }
        tokio::select! {
            biased;
            result = &mut stop => return result,
            _ = sleep(RETRY_DELAY) => {},
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::oneshot;

    async fn reply(stream: &mut tokio::io::DuplexStream, response: Value) {
        write_packet(stream, FRAME, &serde_json::to_vec(&response).unwrap())
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn publishes_and_clears_the_same_process_on_owner_shutdown() {
        let (mut client, mut discord) = tokio::io::duplex(4096);
        let (stopped, stop) = oneshot::channel();
        let activity = json!({
            "type": 0,
            "buttons": [{"label": "Discord", "url": "https://discord.gg/example"}],
            "timestamps": {"start": 1760000000},
        });
        let expected_activity = activity.clone();
        let peer = tokio::spawn(async move {
            let (opcode, payload) = read_packet(&mut discord).await.unwrap();
            assert_eq!(opcode, HANDSHAKE);
            assert_eq!(
                serde_json::from_slice::<Value>(&payload).unwrap()["client_id"],
                "1552256142317453423"
            );
            reply(&mut discord, json!({"cmd": "DISPATCH", "evt": "READY"})).await;

            let (opcode, payload) = read_packet(&mut discord).await.unwrap();
            let command: Value = serde_json::from_slice(&payload).unwrap();
            assert_eq!(opcode, FRAME);
            assert_eq!(command["cmd"], "SET_ACTIVITY");
            assert_eq!(
                command["args"],
                json!({"pid": 123, "activity": expected_activity})
            );
            reply(
                &mut discord,
                json!({"cmd": "SET_ACTIVITY", "nonce": command["nonce"]}),
            )
            .await;

            write_packet(&mut discord, PING, b"keepalive")
                .await
                .unwrap();
            assert_eq!(
                read_packet(&mut discord).await.unwrap(),
                (PONG, b"keepalive".to_vec())
            );
            stopped.send(()).unwrap();

            let (opcode, payload) = read_packet(&mut discord).await.unwrap();
            let clear: Value = serde_json::from_slice(&payload).unwrap();
            assert_eq!(opcode, FRAME);
            assert_eq!(clear["cmd"], "SET_ACTIVITY");
            assert_eq!(clear["args"], json!({"pid": 123, "activity": null}));
            reply(
                &mut discord,
                json!({"cmd": "SET_ACTIVITY", "nonce": clear["nonce"]}),
            )
            .await;
        });

        timeout(Duration::from_secs(5), async {
            register(&mut client, "1552256142317453423", 123, &activity)
                .await
                .unwrap();
            let shutdown = async { stop.await.map_err(io::Error::other) };
            tokio::pin!(shutdown);
            monitor(&mut client, 123, shutdown).await.unwrap().unwrap();
            peer.await.unwrap();
        })
        .await
        .unwrap();
    }
}
