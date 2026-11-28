/**
 * Handles building JVM arguments and launching the game.
 */
pub mod args;
pub mod builder;
pub mod java;
pub mod models;

use crate::core::discord_presence::{self, DiscordPresence};
use crate::core::launch::args::LaunchArguments;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
use tauri::Manager;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub struct LaunchService;

impl LaunchService {
    /**
     * Launches the game process.
     */
    pub fn launch(
        &self,
        args: LaunchArguments,
        show_logs: bool,
        app_handle: &tauri::AppHandle,
        presence: &DiscordPresence,
    ) -> Result<(), String> {
        // Guarantee that the directory path passed to --assetsDir exists on disk prior to process execution
        if let Some(assets_dir) = LaunchArguments::extract_assets_dir(&args.minecraft_args) {
            LaunchArguments::guarantee_assets_dir_and_subdirs(&assets_dir).map_err(|e| {
                format!(
                    "Cannot launch: failed to guarantee assets directory {:?}: {}",
                    assets_dir.display(),
                    e
                )
            })?;
        }

        let jvm_args = args.build();

        let log_file_path = args.game_dir.join("launcher_debug.log");
        log::info!("Game logs will be written to: {:?}", log_file_path);

        let mut wrapper_parts = args.wrapper_command.split_whitespace();
        let mut cmd = if let Some(wrapper_cmd) = wrapper_parts.next() {
            let mut c = Command::new(wrapper_cmd);
            c.args(wrapper_parts);
            c.arg(&args.java_path);
            c
        } else {
            Command::new(&args.java_path)
        };

        match app_handle.path().app_data_dir() {
            Ok(app_dir) => {
                if let Err(error) =
                    discord_presence::configure_java(&mut cmd, &args.game_dir, &app_dir, presence)
                {
                    log::warn!("Discord Rich Presence unavailable: {error}");
                }
            }
            Err(error) => log::warn!("Discord Rich Presence unavailable: {error}"),
        }
        cmd.args(jvm_args);
        cmd.current_dir(&args.game_dir);

        // --- Environment Isolation ---
        #[cfg(unix)]
        {
            cmd.env_remove("LD_LIBRARY_PATH");
            let mut lib_paths: Vec<String> = Vec::new();

            if let Some(ref java_home) = args.java_home {
                let java_lib = java_home.join("lib");
                if java_lib.exists() {
                    lib_paths.push(java_lib.to_string_lossy().into_owned());
                }
                let java_lib_server = java_home.join("lib/server");
                if java_lib_server.exists() {
                    lib_paths.push(java_lib_server.to_string_lossy().into_owned());
                }
            }

            if !lib_paths.is_empty() {
                let ld_path = lib_paths.join(":");
                log::info!("Setting isolated LD_LIBRARY_PATH: {}", ld_path);
                cmd.env("LD_LIBRARY_PATH", ld_path);
            }
        }

        // --- Output Redirection ---
        // We use pipes to stream logs to the UI AND write to file
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let game_dir = args.game_dir.clone();
        let state = app_handle.state::<crate::state::AppState>();
        let mut running = state
            .running_sessions
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        match cmd.spawn() {
            Ok(mut child) => {
                *running.entry(game_dir.clone()).or_default() += 1;
                log::info!(
                    "Game process spawned successfully with PID: {:?}",
                    child.id()
                );

                let log_writer = std::fs::OpenOptions::new()
                    .append(true)
                    .create(true)
                    .open(&log_file_path)
                    .ok()
                    .map(|f| {
                        std::sync::Arc::new(std::sync::Mutex::new(std::io::BufWriter::new(f)))
                    });

                if let Some(stdout) = child.stdout.take() {
                    spawn_log_stream(
                        stdout,
                        "",
                        show_logs,
                        app_handle.clone(),
                        log_writer.clone(),
                    );
                }
                if let Some(stderr) = child.stderr.take() {
                    spawn_log_stream(
                        stderr,
                        "[ERROR] ",
                        show_logs,
                        app_handle.clone(),
                        log_writer,
                    );
                }

                let app_handle_wait = app_handle.clone();
                // Thread to wait for process exit
                std::thread::spawn(move || {
                    use tauri::Emitter;
                    match child.wait() {
                        Ok(status) => {
                            log::info!("Game process exited with status: {}", status);
                            let _ = app_handle_wait.emit(
                                "game-log",
                                format!("--- Process exited with status {} ---", status),
                            );
                        }
                        Err(e) => log::error!("Error waiting for game process: {}", e),
                    }
                    let state = app_handle_wait.state::<crate::state::AppState>();
                    let mut running = state
                        .running_sessions
                        .lock()
                        .unwrap_or_else(|e| e.into_inner());
                    if let Some(count) = running.get_mut(&game_dir) {
                        *count -= 1;
                        if *count == 0 {
                            running.remove(&game_dir);
                        }
                    }
                });

                Ok(())
            }
            Err(e) => {
                let err_msg = format!(
                    "Failed to spawn game process: {}. Java path: {:?}",
                    e, args.java_path
                );
                log::error!("{}", err_msg);
                Err(err_msg)
            }
        }
    }
}

fn spawn_log_stream<R: std::io::Read + Send + 'static>(
    stream: R,
    prefix: &'static str,
    show_logs: bool,
    app_handle: tauri::AppHandle,
    log_writer: Option<std::sync::Arc<std::sync::Mutex<std::io::BufWriter<std::fs::File>>>>,
) {
    std::thread::spawn(move || {
        use std::io::{BufRead, BufReader, Write};
        use tauri::Emitter;

        let mut reader = BufReader::new(stream);
        let mut buf = Vec::new();
        loop {
            buf.clear();
            match reader.read_until(b'\n', &mut buf) {
                Ok(0) => break,
                Ok(_) => {
                    while matches!(buf.last(), Some(b'\n' | b'\r')) {
                        buf.pop();
                    }
                    let line = String::from_utf8_lossy(&buf);
                    let formatted = if prefix.is_empty() {
                        line.into_owned()
                    } else {
                        format!("{}{}", prefix, line)
                    };
                    if show_logs {
                        let _ = app_handle.emit("game-log", &formatted);
                    }
                    if let Some(writer) = log_writer.as_ref() {
                        if let Ok(mut guard) = writer.lock() {
                            let _ = writeln!(guard, "{}", formatted);
                            let _ = guard.flush();
                        }
                    }
                }
                Err(e) => {
                    log::warn!("Error reading game output stream: {}", e);
                    break;
                }
            }
        }
    });
}
