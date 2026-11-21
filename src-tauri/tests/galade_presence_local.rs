use app_lib::{
    auth::AuthResponse,
    core::{launch::args::LaunchArguments, session::Session, settings::AppSettings},
};
use fs2::FileExt;
use std::{
    fs::{self, File},
    path::Path,
    process::{Child, Command},
    thread,
    time::{Duration, Instant},
};

struct RunningGame(Child);

impl Drop for RunningGame {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

#[test]
#[ignore = "manual Minecraft smoke test: requires LAUNCHED_GALADE_TEST_DIR and LAUNCHED_GALADE_TEST_MODE with a prepared installation"]
fn galade_launch_with_the_production_presence_agent() {
    let root = std::env::var_os("LAUNCHED_GALADE_TEST_DIR").unwrap();
    let root = Path::new(&root);
    let mode = std::env::var("LAUNCHED_GALADE_TEST_MODE").unwrap();
    let game_dir = root.join(&mode);
    let session: Session = serde_json::from_value(serde_json::json!({
        "name": "Galade", "minecraft": "1.12.2", "forge": "14.23.5.2847",
        "syncDir": "mods", "syncUrl": "https://example.invalid", "welcome": "",
        "jvmArg": "", "credits": ""
    }))
    .unwrap();
    let auth = AuthResponse {
        uuid: "00000000-0000-0000-0000-000000000000".into(),
        name: "LauncherSmoke".into(),
        access_token: "offline".into(),
        refresh_token: None,
    };
    let settings = AppSettings::default();
    let args = LaunchArguments::from_session(&session, &game_dir, &auth, &settings).unwrap();

    let agent = if mode == "fixed" {
        let path = root.join("fixed-agent.jar");
        fs::write(
            &path,
            include_bytes!(concat!(env!("OUT_DIR"), "/discord-presence.jar")),
        )
        .unwrap();
        path
    } else {
        root.join("released-agent.jar")
    };
    let locks = game_dir.join("presence");
    fs::create_dir(&locks).unwrap();
    let launcher_lock = fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(locks.join("launcher.lock"))
        .unwrap();
    FileExt::lock_exclusive(&launcher_lock).unwrap();

    let stdout = game_dir.join("stdout.log");
    let stderr = game_dir.join("stderr.log");
    let mut game = RunningGame(Command::new(&args.java_path)
        .arg(format!("-javaagent:{}", agent.display()))
        .args(args.build())
        .current_dir(&game_dir)
        .env("LAUNCHED_DISCORD_WORKER", env!("CARGO_BIN_EXE_app"))
        .env("LAUNCHED_DISCORD_LOCK_DIR", &locks)
        .env("LAUNCHED_DISCORD_PRESENCE", r#"{"applicationId":"1552256142317453423","showElapsed":true,"activity":{"type":0,"details":"Galade launch test"}}"#)
        .stdout(File::create(&stdout).unwrap())
        .stderr(File::create(&stderr).unwrap())
        .spawn().unwrap());

    let stop_at = Instant::now() + Duration::from_secs(150);
    loop {
        let output = fs::read_to_string(&stdout).unwrap_or_default();
        if mode == "released" && output.contains("signer information does not match") {
            eprintln!("v1.7.0 agent reproduced the signature conflict");
            return;
        }
        if mode == "fixed" {
            assert!(
                !output.contains("signer information does not match"),
                "original crash still present"
            );
            if output.contains("Sound engine started")
                || output.contains("Forge Mod Loader has successfully loaded")
            {
                assert!(
                    locks.join("game.lock").exists(),
                    "Discord worker didn't start"
                );
                eprintln!("Galade finished loading mods with the corrected agent and the Discord worker started");
                return;
            }
        }
        assert!(
            game.0.try_wait().unwrap().is_none(),
            "Minecraft exited, see logs in {}",
            game_dir.display()
        );
        assert!(
            Instant::now() < stop_at,
            "Loading timed out, see logs in {}",
            game_dir.display()
        );
        thread::sleep(Duration::from_millis(300));
    }
}
