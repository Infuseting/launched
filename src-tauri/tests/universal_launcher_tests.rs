use app_lib::core::install::runtime::JreManager;
use app_lib::core::meta::models::*;
use app_lib::core::meta::prism::PrismMetaClient;
use app_lib::core::session::{ComponentSpec, Session};


#[test]
fn test_maven_coordinate_resolution() {
    assert_eq!(
        PrismMetaClient::maven_coordinate_to_path("org.ow2.asm:asm:9.5"),
        Some("org/ow2/asm/asm/9.5/asm-9.5.jar".to_string())
    );

    assert_eq!(
        PrismMetaClient::maven_coordinate_to_path("net.minecraftforge:forge:1.20.1-47.2.0:universal"),
        Some("net/minecraftforge/forge/1.20.1-47.2.0/forge-1.20.1-47.2.0-universal.jar".to_string())
    );

    assert_eq!(
        PrismMetaClient::maven_coordinate_to_path("org.lwjgl:lwjgl-jemalloc:3.3.1:natives-windows"),
        Some("org/lwjgl/lwjgl-jemalloc/3.3.1/lwjgl-jemalloc-3.3.1-natives-windows.jar".to_string())
    );

    assert_eq!(
        PrismMetaClient::maven_coordinate_to_path("invalid_coord"),
        None
    );
}

#[test]
fn test_session_effective_components_legacy_fallback() {
    let session_forge = Session {
        name: "Forge Session".to_string(),
        minecraft: "1.20.1".to_string(),
        forge: Some("47.2.0".to_string()),
        neoforge: None,
        fabric: None,
        quilt: None,
        components: None,
        sync_dir: "mods".to_string(),
        sync_url: "https://example.com/sync".to_string(),
        welcome: "Welcome".to_string(),
        jvm_arg: "".to_string(),
        credits: "".to_string(),
        assets_path: None,
        hostname: None,
        is_default: false,
        links: None,
        crack: None,
    };

    let comps = session_forge.effective_components();
    assert_eq!(comps.len(), 2);
    assert_eq!(comps[0], ComponentSpec { uid: "net.minecraft".to_string(), version: "1.20.1".to_string() });
    assert_eq!(comps[1], ComponentSpec { uid: "net.minecraftforge".to_string(), version: "47.2.0".to_string() });

    let session_neoforge = Session {
        name: "NeoForge Session".to_string(),
        minecraft: "1.20.4".to_string(),
        forge: None,
        neoforge: Some("20.4.80".to_string()),
        fabric: None,
        quilt: None,
        components: None,
        sync_dir: "mods".to_string(),
        sync_url: "https://example.com/sync".to_string(),
        welcome: "Welcome".to_string(),
        jvm_arg: "".to_string(),
        credits: "".to_string(),
        assets_path: None,
        hostname: None,
        is_default: false,
        links: None,
        crack: None,
    };

    let comps_neo = session_neoforge.effective_components();
    assert_eq!(comps_neo.len(), 2);
    assert_eq!(comps_neo[0], ComponentSpec { uid: "net.minecraft".to_string(), version: "1.20.4".to_string() });
    assert_eq!(comps_neo[1], ComponentSpec { uid: "net.neoforged".to_string(), version: "20.4.80".to_string() });
}

#[test]
fn test_session_custom_components_priority() {
    let custom_comps = vec![
        ComponentSpec { uid: "net.minecraft".to_string(), version: "1.20.1".to_string() },
        ComponentSpec { uid: "net.fabricmc.fabric-loader".to_string(), version: "0.15.11".to_string() },
    ];

    let session = Session {
        name: "Custom Components".to_string(),
        minecraft: "1.12.2".to_string(),
        forge: Some("14.23.5.2860".to_string()),
        neoforge: None,
        fabric: None,
        quilt: None,
        components: Some(custom_comps.clone()),
        sync_dir: "mods".to_string(),
        sync_url: "https://example.com/sync".to_string(),
        welcome: "Welcome".to_string(),
        jvm_arg: "".to_string(),
        credits: "".to_string(),
        assets_path: None,
        hostname: None,
        is_default: false,
        links: None,
        crack: None,
    };

    assert_eq!(session.effective_components(), custom_comps);
}

#[test]
fn test_jre_resolution() {
    assert_eq!(JreManager::resolve_component_name(None, Some(21), None), "java-runtime-delta");
    assert_eq!(JreManager::resolve_component_name(None, Some(17), None), "java-runtime-gamma");
    assert_eq!(JreManager::resolve_component_name(None, Some(16), None), "java-runtime-alpha");
    assert_eq!(JreManager::resolve_component_name(None, Some(8), None), "jre-legacy");
    assert_eq!(JreManager::resolve_component_name(None, None, None), "jre-legacy");
    assert_eq!(JreManager::resolve_component_name(None, None, Some("java-runtime-delta")), "java-runtime-delta");

    // Version deductions
    assert_eq!(JreManager::resolve_component_name(Some("1.20.1"), None, None), "java-runtime-gamma"); // Java 17
    assert_eq!(JreManager::resolve_component_name(Some("1.20.6"), None, None), "java-runtime-delta"); // Java 21
    assert_eq!(JreManager::resolve_component_name(Some("1.21.1"), None, None), "java-runtime-delta"); // Java 21
    assert_eq!(JreManager::resolve_component_name(Some("1.17.1"), None, None), "java-runtime-alpha"); // Java 16
    assert_eq!(JreManager::resolve_component_name(Some("1.12.2"), None, None), "jre-legacy");        // Java 8
    assert_eq!(JreManager::resolve_component_name(Some("1.7.10"), None, None), "jre-legacy");        // Java 8
}

#[test]
fn test_library_rule_filtering() {
    let current_os = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    };

    let allowed_rules = Some(vec![LibraryRule {
        action: "allow".to_string(),
        os: Some(OsCondition {
            name: Some(current_os.to_string()),
            version: None,
            arch: None,
        }),
        features: None,
    }]);

    assert!(PrismMetaClient::is_library_allowed(&allowed_rules));

    let disallowed_rules = Some(vec![
        LibraryRule {
            action: "allow".to_string(),
            os: None,
            features: None,
        },
        LibraryRule {
            action: "disallow".to_string(),
            os: Some(OsCondition {
                name: Some(current_os.to_string()),
                version: None,
                arch: None,
            }),
            features: None,
        },
    ]);

    assert!(!PrismMetaClient::is_library_allowed(&disallowed_rules));
}

#[tokio::test]
async fn test_fetch_real_component_manifest() {
    let client = PrismMetaClient::new(std::env::temp_dir().join("test_mc"));
    let manifest = client.get_component("net.minecraft", "1.12.2").await;
    assert!(manifest.is_ok(), "Failed to fetch 1.12.2 manifest: {:?}", manifest.err());
    let _m = manifest.unwrap();
    let m1201 = client.get_component("net.minecraft", "1.20.1").await.unwrap();
    println!("1.20.1 jvm arguments: {:?}", m1201.arguments.as_ref().map(|a| &a.jvm));
    println!("1.20.1 plus_jvm_args: {:?}", m1201.plus_jvm_args);
    let forge1201 = client.get_component("net.minecraftforge", "47.4.0").await.unwrap();
    println!("Forge 47.4.0 jvm arguments: {:?}", forge1201.arguments.as_ref().map(|a| &a.jvm));
    println!("Forge 47.4.0 plus_jvm_args: {:?}", forge1201.plus_jvm_args);
}

#[tokio::test]
async fn test_fetch_all_servers_json_versions() {
    let client = PrismMetaClient::new(std::env::temp_dir().join("test_mc"));

    // 1.12.2 Forge 14.23.5.2847
    let v2847 = client.get_component("net.minecraftforge", "14.23.5.2847").await;
    println!("Forge 14.23.5.2847 result: {:?}", v2847.as_ref().map(|m| &m.main_class));
    assert!(v2847.is_ok(), "Failed 14.23.5.2847: {:?}", v2847.err());

    // 1.12.2 Forge 14.23.5.2859
    let v2859 = client.get_component("net.minecraftforge", "14.23.5.2859").await;
    println!("Forge 14.23.5.2859 result: {:?}", v2859.as_ref().map(|m| &m.main_class));
    assert!(v2859.is_ok(), "Failed 14.23.5.2859: {:?}", v2859.err());

    // 1.20.1 Forge 47.4.0
    let v4740 = client.get_component("net.minecraftforge", "47.4.0").await;
    assert!(v4740.is_ok(), "Failed 47.4.0: {:?}", v4740.err());
    let m4740 = v4740.unwrap();
    assert_eq!(m4740.main_class.as_deref(), Some("io.github.zekerzhayard.forgewrapper.installer.Main"));
    assert!(m4740.maven_files.as_ref().unwrap().iter().any(|f| f.name.contains(":installer")), "Installer jar must be in mavenFiles");

    if let Some(libs) = &m4740.libraries {
        for l in libs {
            println!("Forge 47.4.0 lib: {} -> MMC-hint: {:?}", l.name, l.mmc_hint);
        }
    }

    let fab = client.get_component("net.fabricmc.fabric-loader", "0.15.11").await.unwrap();
    println!("Fabric Loader 0.15.11 requires: {:?}", fab.requires);
}

#[tokio::test]
async fn test_resolve_fabric_components() {
    let client = PrismMetaClient::new(std::env::temp_dir().join("test_mc"));
    let initial = vec![
        ComponentSpec { uid: "net.minecraft".to_string(), version: "1.20.1".to_string() },
        ComponentSpec { uid: "net.fabricmc.fabric-loader".to_string(), version: "0.15.11".to_string() },
    ];

    let manifests = client.resolve_all_components(&initial).await.unwrap();
    println!("Resolved {} manifests for 1.20.1 Fabric:", manifests.len());
    for m in &manifests {
        println!(" - Component: {:?}", m.uid);
    }

    assert!(manifests.iter().any(|m| m.uid.as_deref() == Some("net.fabricmc.intermediary")), "net.fabricmc.intermediary must be resolved");
    let intermediary = manifests.iter().find(|m| m.uid.as_deref() == Some("net.fabricmc.intermediary")).unwrap();
    assert_eq!(intermediary.version.as_deref(), Some("1.20.1"), "Intermediary must use Minecraft version 1.20.1");
}

#[tokio::test]
async fn test_resolve_all_components_includes_lwjgl() {
    let client = PrismMetaClient::new(std::env::temp_dir().join("test_mc"));
    let initial = vec![
        ComponentSpec { uid: "net.minecraft".to_string(), version: "1.12.2".to_string() },
        ComponentSpec { uid: "net.minecraftforge".to_string(), version: "14.23.5.2847".to_string() },
    ];

    let manifests = client.resolve_all_components(&initial).await.unwrap();
    println!("Resolved {} manifests for 1.12.2 Forge:", manifests.len());
    for m in &manifests {
        println!(" - Component: {:?}", m.uid);
    }

    assert!(manifests.iter().any(|m| m.uid.as_deref() == Some("org.lwjgl")), "org.lwjgl must be resolved for 1.12.2");
    assert!(manifests.iter().any(|m| m.uid.as_deref() == Some("net.minecraft")), "net.minecraft must be resolved");
    assert!(manifests.iter().any(|m| m.uid.as_deref() == Some("net.minecraftforge")), "net.minecraftforge must be resolved");

    let lwjgl_m = manifests.iter().find(|m| m.uid.as_deref() == Some("org.lwjgl")).unwrap();
    println!("org.lwjgl libraries count: {:?}", lwjgl_m.libraries.as_ref().map(|l| l.len()));
    for lib in lwjgl_m.libraries.as_ref().unwrap() {
        println!(" - lib: {} natives: {:?} downloads: {:?}", lib.name, lib.natives, lib.downloads.is_some());
        let urls = PrismMetaClient::resolve_library_urls(lib);
        println!("   resolved urls: {:?}", urls);
    }
}

#[test]
fn test_crack_pseudo_validation() {
    fn validate_pseudo(pseudo: &str) -> bool {
        let trimmed = pseudo.trim();
        !trimmed.is_empty()
            && trimmed.len() <= 16
            && trimmed == pseudo
            && trimmed.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
    }

    assert!(validate_pseudo("Infuseting"));
    assert!(validate_pseudo("Player_123"));
    assert!(validate_pseudo("a"));
    assert!(validate_pseudo("1234567890123456")); // 16 chars

    // Invalid cases
    assert!(!validate_pseudo(""));
    assert!(!validate_pseudo("   "));
    assert!(!validate_pseudo("TooLongUsernameExceedingLimit"));
    assert!(!validate_pseudo("Player with space"));
    assert!(!validate_pseudo("Steve;rm -rf /"));
    assert!(!validate_pseudo("Player\n"));
    assert!(!validate_pseudo("Player\0"));
}

#[test]
fn test_sync_path_traversal_sanitization() {
    fn is_safe_sync_path(path_str: &str) -> bool {
        let normalized = path_str.replace('\\', "/");
        !normalized.contains("..")
            && !normalized.starts_with('/')
            && !normalized.contains(':')
            && !normalized.is_empty()
    }

    assert!(is_safe_sync_path("mods/jei_1.12.2.jar"));
    assert!(is_safe_sync_path("config/custom.cfg"));
    assert!(is_safe_sync_path("resourcepacks/pack.zip"));

    // Traversal attacks
    assert!(!is_safe_sync_path("../../../Windows/System32/calc.exe"));
    assert!(!is_safe_sync_path("mods/../../escape.txt"));
    assert!(!is_safe_sync_path("/etc/passwd"));
    assert!(!is_safe_sync_path("C:/Users/danger.dll"));
}

#[test]
fn test_minecraft_arguments_spaces_preservation() {
    let raw_args = "--username ${auth_player_name} --version ${version_name} --gameDir ${game_directory}";
    let game_placeholders = [
        ("${auth_player_name}", "Infuseting".to_string()),
        ("${version_name}", "1.20.1".to_string()),
        ("${game_directory}", "C:\\Sessions\\Stolbovo RP".to_string()),
    ];

    let mut args = Vec::new();
    for raw_token in raw_args.split_whitespace() {
        let mut token = raw_token.to_string();
        for (placeholder, val) in &game_placeholders {
            token = token.replace(placeholder, val);
        }
        args.push(token);
    }

    assert_eq!(args.len(), 6);
    assert_eq!(args[4], "--gameDir");
    assert_eq!(args[5], "C:\\Sessions\\Stolbovo RP"); // Preserved whole!
}


