// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args_os().nth(1).as_deref()
        == Some(std::ffi::OsStr::new("--discord-presence-worker"))
    {
        if let Err(error) = app_lib::core::discord_presence::run_worker() {
            eprintln!("[Launched] Discord Rich Presence: {error}");
        }
        return;
    }
    app_lib::run();
}
