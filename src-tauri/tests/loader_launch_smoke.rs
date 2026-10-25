//! Runs argument generation against isolated profiles without starting Minecraft.
//! Explicitly invoked because Java 21 must be installed on the test machine.
#[cfg(windows)]
#[test]
#[ignore = "requires Windows and Java 21; run with --ignored"]
fn builds_launch_commands_for_fabric_forge_and_neoforge() {
    use app_lib::{
        auth::AuthResponse,
        core::{launch::args::LaunchArguments, session::Session, settings::AppSettings},
    };
    use std::fs;

    let root = std::env::temp_dir().join(format!("loader-smoke-{}", uuid::Uuid::new_v4()));
    let mc = root.join(".minecraft");
    let original_appdata = std::env::var_os("APPDATA");
    struct RestoreAppdata(Option<std::ffi::OsString>, std::path::PathBuf);
    impl Drop for RestoreAppdata {
        fn drop(&mut self) {
            match &self.0 {
                Some(value) => std::env::set_var("APPDATA", value),
                None => std::env::remove_var("APPDATA"),
            }
            let _ = std::fs::remove_dir_all(&self.1);
        }
    }
    let _restore = RestoreAppdata(original_appdata, root.clone());
    std::env::set_var("APPDATA", &root);

    let write = |relative: &str, bytes: &[u8]| {
        let path = mc.join(relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, bytes).unwrap();
    };
    write("versions/1.21.1/1.21.1.jar", b"vanilla client placeholder");
    write(
        "versions/1.21.1/1.21.1.json",
        br#"{
        "id":"1.21.1","mainClass":"net.minecraft.client.main.Main","libraries":[],
        "javaVersion":{"component":"java-runtime-delta","majorVersion":21},
        "arguments":{"game":["--username","${auth_player_name}"],"jvm":[]}
    }"#,
    );
    let auth = AuthResponse {
        uuid: "00000000000000000000000000000000".into(),
        name: "SmokeTest".into(),
        access_token: "offline".into(),
        refresh_token: None,
    };

    for (loader, version, id, main_class) in [
        (
            "fabric",
            "0.16.9",
            "fabric-loader-0.16.9-1.21.1",
            "net.fabricmc.loader.impl.launch.knot.KnotClient",
        ),
        (
            "forge",
            "52.0.28",
            "1.21.1-forge-52.0.28",
            "cpw.mods.bootstraplauncher.BootstrapLauncher",
        ),
        (
            "neoforge",
            "21.1.80",
            "neoforge-21.1.80",
            "cpw.mods.bootstraplauncher.BootstrapLauncher",
        ),
    ] {
        let mut config = serde_json::json!({ "name":loader,"minecraft":"1.21.1",
            "syncDir":"mods","syncUrl":"https://example.com","welcome":"","jvmArg":"","credits":"" });
        config[loader] = version.into();
        let session: Session = serde_json::from_value(config).unwrap();
        let profile = serde_json::json!({"id":id,"inheritsFrom":"1.21.1","mainClass":main_class,
            "libraries":[],"arguments":{"game":["--loader-test",loader],
            "jvm":["-DlibraryDirectory=${library_directory}","-Dtest.separator=${classpath_separator}"]}});
        write(
            &format!("versions/{id}/{id}.json"),
            &serde_json::to_vec(&profile).unwrap(),
        );
        if loader == "forge" {
            write(
                "libraries/net/minecraftforge/forge/1.21.1-52.0.28/forge-1.21.1-52.0.28-client.jar",
                b"patched client placeholder",
            );
        }
        let args = LaunchArguments::from_session(
            &session,
            &root.join(loader),
            &auth,
            &AppSettings::default(),
        )
        .unwrap();
        assert_eq!(args.main_class, main_class);
        let command = args.build();
        assert!(
            !command.iter().any(|value| value.contains("${")),
            "Unresolved placeholder for {loader}"
        );
        assert!(command.iter().any(|value| value == id));
        assert!(command.iter().any(|value| value == "SmokeTest"));
        assert_eq!(
            args.classpath
                .contains(&mc.join("versions/1.21.1/1.21.1.jar")),
            loader == "fabric",
            "Fabric needs the vanilla client; module bootstraps must exclude it"
        );
        assert!(args.java_path.is_file());
    }
}
