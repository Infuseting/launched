/**
 * Handles building JVM arguments and launching the game.
 */
pub mod args;
pub mod models;

use crate::core::launch::args::LaunchArguments;
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use tauri::Emitter;

pub struct LaunchService;

impl LaunchService {
    /**
     * Launches the game process.
     */
    pub fn launch(&self, args: LaunchArguments, show_logs: bool, app_handle: &tauri::AppHandle) -> Result<(), String> {
        let jvm_args = args.build();
        log::info!(
            "Launching game with command: {} {}",
            args.java_path.display(),
            jvm_args.join(" ")
        );

        let mut cmd = Command::new(&args.java_path);
        cmd.args(jvm_args);
        cmd.current_dir(&args.game_dir);

        // Build LD_LIBRARY_PATH: include $JAVA_HOME/lib so libjawt.so is found,
        // plus any existing LD_LIBRARY_PATH from environment.
        #[cfg(unix)]
        {
            let mut lib_paths: Vec<String> = Vec::new();

            if let Some(ref java_home) = args.java_home {
                // Primary: $JAVA_HOME/lib (contains libjawt.so, libawt.so, etc.)
                let java_lib = java_home.join("lib");
                if java_lib.exists() {
                    lib_paths.push(java_lib.to_string_lossy().into_owned());
                }
                // Also add $JAVA_HOME/lib/server (contains libjvm.so on some distros)
                let java_lib_server = java_home.join("lib/server");
                if java_lib_server.exists() {
                    lib_paths.push(java_lib_server.to_string_lossy().into_owned());
                }
                // $JAVA_HOME/jre/lib for Java 8
                let jre_lib = java_home.join("jre/lib");
                if jre_lib.exists() {
                    lib_paths.push(jre_lib.to_string_lossy().into_owned());
                }
                let jre_lib_amd64 = java_home.join("jre/lib/amd64");
                if jre_lib_amd64.exists() {
                    lib_paths.push(jre_lib_amd64.to_string_lossy().into_owned());
                }
            }

            // Append existing LD_LIBRARY_PATH if set
            if let Ok(existing) = std::env::var("LD_LIBRARY_PATH") {
                if !existing.is_empty() {
                    lib_paths.push(existing);
                }
            }

            if !lib_paths.is_empty() {
                let ld_path = lib_paths.join(":");
                log::info!("LD_LIBRARY_PATH: {}", ld_path);
                cmd.env("LD_LIBRARY_PATH", ld_path);
            }
        }

        if show_logs {
            cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
        } else {
            cmd.stdout(Stdio::null()).stderr(Stdio::null());
        }

        match cmd.spawn() {
            Ok(mut child) => {
                log::info!("Game process spawned successfully.");
                if show_logs {
                    let app_clone_out = app_handle.clone();
                    if let Some(stdout) = child.stdout.take() {
                        let reader = BufReader::new(stdout);
                        std::thread::spawn(move || {
                            for line in reader.lines() {
                                if let Ok(l) = line {
                                    let _ = app_clone_out.emit("game-log", l);
                                }
                            }
                        });
                    }
                    let app_clone_err = app_handle.clone();
                    if let Some(stderr) = child.stderr.take() {
                        let reader = BufReader::new(stderr);
                        std::thread::spawn(move || {
                            for line in reader.lines() {
                                if let Ok(l) = line {
                                    let _ = app_clone_err.emit("game-log", l);
                                }
                            }
                        });
                    }
                }
                
                std::thread::spawn(move || {
                    let _ = child.wait();
                });

                Ok(())
            }
            Err(e) => {
                let err_msg = format!("Failed to spawn game process: {}", e);
                log::error!("{}", err_msg);
                Err(err_msg)
            }
        }
    }
}
