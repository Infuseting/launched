use crate::core::download::{Checksum, DownloadEngine, DownloadTask};
use crate::core::install::assets::AssetIndexReference;
use crate::core::install::assets::AssetManager;
use crate::core::maven::validate_relative_path;
use serde::Deserialize;
use std::path::PathBuf;
use tokio::fs;

const VERSION_MANIFEST_URL: &str = "https://launchermeta.mojang.com/mc/game/version_manifest.json";

#[derive(Debug, Deserialize)]
pub struct VersionManifestIndex {
    pub versions: Vec<VersionIndexItem>,
}

#[derive(Debug, Deserialize)]
pub struct VersionIndexItem {
    pub id: String,
    pub url: String,
    pub r#type: String,
}

#[derive(Debug, Deserialize)]
pub struct VersionDetail {
    pub downloads: VersionDownloads,
    pub libraries: Option<Vec<InstallLibrary>>,
    #[serde(rename = "javaVersion")]
    pub java_version: Option<JavaVersionRequirement>,
    #[serde(rename = "assetIndex")]
    pub asset_index: Option<AssetIndexReference>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaVersionRequirement {
    pub component: String,
    pub major_version: u8,
}

#[derive(Debug, Deserialize)]
pub struct VersionDownloads {
    pub client: DownloadInfo,
}

#[derive(Debug, Deserialize)]
pub struct DownloadInfo {
    pub url: String,
    pub sha1: String,
    pub size: u64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct InstallLibrary {
    pub name: String,
    pub downloads: Option<InstallLibraryDownloads>,
    pub rules: Option<Vec<LibraryRule>>,
    pub natives: Option<std::collections::HashMap<String, String>>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct InstallLibraryDownloads {
    pub artifact: Option<LibraryArtifact>,
    pub classifiers: Option<std::collections::HashMap<String, LibraryArtifact>>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct LibraryArtifact {
    pub path: String,
    pub url: String,
    #[serde(default)]
    pub sha1: Option<String>,
    pub size: Option<u64>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct LibraryRule {
    pub action: String,
    pub os: Option<OsCondition>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct OsCondition {
    pub name: Option<String>,
}

pub async fn get_official_mc_path() -> Result<PathBuf, String> {
    crate::core::install::official_mc_path()
}

/// Returns the current OS name as Minecraft knows it ("windows", "osx", "linux").
fn current_os_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    }
}

/// Evaluates library rules: should this library be included on the current OS?
fn library_allowed(rules: &Option<Vec<LibraryRule>>) -> bool {
    let rules = match rules {
        Some(r) if !r.is_empty() => r,
        _ => return true,
    };

    let os = current_os_name();
    let mut allowed = false;

    for rule in rules {
        let matches_os = match &rule.os {
            Some(cond) => cond.name.as_deref() == Some(os),
            None => true,
        };
        if matches_os {
            allowed = rule.action == "allow";
        }
    }
    allowed
}

/// Installs a Minecraft version with an explicit assets directory and optional progress window.
pub async fn install_version_with_assets(
    version: &str,
    assets_dir: Option<&std::path::Path>,
    window: Option<&tauri::Window>,
) -> Result<(), String> {
    let engine = DownloadEngine::new(24);
    let mc_path = get_official_mc_path().await?;
    let version_dir = mc_path.join("versions").join(version);
    let version_json_path = version_dir.join(format!("{}.json", version));
    let version_jar_path = version_dir.join(format!("{}.jar", version));

    fs::create_dir_all(&version_dir)
        .await
        .map_err(|e| format!("Failed to create version directory: {}", e))?;

    // 1. Fetch version manifest index
    let manifest: VersionManifestIndex = engine.fetch_json(VERSION_MANIFEST_URL).await?;
    let version_info = manifest
        .versions
        .iter()
        .find(|v| v.id == version)
        .ok_or_else(|| format!("Version {} not found in Mojang manifest", version))?;

    // 2. Download version JSON if missing or invalid JSON
    let json_valid = match fs::read_to_string(&version_json_path).await {
        Ok(content) => serde_json::from_str::<VersionDetail>(&content).is_ok(),
        Err(_) => false,
    };
    if !json_valid {
        log::info!("Downloading version JSON for {}...", version);
        let task = DownloadTask {
            url: version_info.url.clone(),
            dest: version_json_path.clone(),
            size: None,
            checksum: None,
            is_executable: false,
            description: Some(format!("Minecraft {} JSON", version)),
        };
        engine.download_single(&task).await?;
    }

    // 3. Parse version JSON
    let content = fs::read_to_string(&version_json_path)
        .await
        .map_err(|e| format!("Failed to read version JSON: {}", e))?;
    let detail: VersionDetail = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse version detail: {}", e))?;

    // 4. Download and verify client JAR
    let jar_task = DownloadTask {
        url: detail.downloads.client.url.clone(),
        dest: version_jar_path,
        size: Some(detail.downloads.client.size),
        checksum: Some(Checksum::Sha1(detail.downloads.client.sha1)),
        is_executable: false,
        description: Some(format!("Minecraft {} client JAR", version)),
    };
    engine.download_single(&jar_task).await?;

    // 5. Download and verify all required libraries
    if let Some(libraries) = detail.libraries {
        let os = current_os_name();
        let lib_base = mc_path.join("libraries");
        let mut tasks = Vec::new();

        for lib in &libraries {
            if !library_allowed(&lib.rules) {
                continue;
            }
            if let Some(dl) = &lib.downloads {
                if let Some(artifact) = &dl.artifact {
                    let safe_rel = validate_relative_path(&artifact.path).ok_or_else(|| {
                        format!("Unsafe library artifact path: {}", artifact.path)
                    })?;
                    tasks.push(DownloadTask {
                        url: artifact.url.clone(),
                        dest: lib_base.join(safe_rel),
                        size: artifact.size,
                        checksum: artifact.sha1.clone().map(Checksum::Sha1),
                        is_executable: false,
                        description: Some(lib.name.clone()),
                    });
                }

                if let (Some(natives_map), Some(classifiers)) = (&lib.natives, &dl.classifiers) {
                    if let Some(native_key) = natives_map.get(os) {
                        if let Some(native_art) = classifiers.get(native_key) {
                            let safe_rel =
                                validate_relative_path(&native_art.path).ok_or_else(|| {
                                    format!("Unsafe native artifact path: {}", native_art.path)
                                })?;
                            tasks.push(DownloadTask {
                                url: native_art.url.clone(),
                                dest: lib_base.join(safe_rel),
                                size: native_art.size,
                                checksum: native_art.sha1.clone().map(Checksum::Sha1),
                                is_executable: false,
                                description: Some(format!("{} ({})", lib.name, native_key)),
                            });
                        }
                    }
                }
            }
        }

        if !tasks.is_empty() {
            engine
                .download_all(
                    window,
                    tasks,
                    &format!("Downloading Minecraft {} libraries", version),
                )
                .await?;
        }
    }

    // 6. Ensure required Java runtime is downloaded
    let component = detail
        .java_version
        .as_ref()
        .map(|req| req.component.as_str())
        .unwrap_or("jre-legacy");
    download_jre(component).await?;

    // 7. Ensure game assets and asset index are downloaded
    let effective_assets_dir = match assets_dir {
        Some(dir) => {
            let str_val = dir.to_string_lossy();
            if str_val.starts_with("http://")
                || str_val.starts_with("https://")
                || str_val.contains("://")
                || str_val.ends_with(".json")
            {
                mc_path.join("assets")
            } else {
                dir.to_path_buf()
            }
        }
        None => mc_path.join("assets"),
    };
    fs::create_dir_all(&effective_assets_dir)
        .await
        .map_err(|e| {
            format!(
                "Failed to create assets directory {:?}: {}",
                effective_assets_dir, e
            )
        })?;
    fs::create_dir_all(effective_assets_dir.join("indexes"))
        .await
        .map_err(|e| format!("Failed to create asset indexes directory: {}", e))?;
    fs::create_dir_all(effective_assets_dir.join("objects"))
        .await
        .map_err(|e| format!("Failed to create asset objects directory: {}", e))?;

    if let Some(ref asset_index_ref) = detail.asset_index {
        log::info!(
            "Ensuring game assets for {} (index: {}) in {:?}",
            version,
            asset_index_ref.id,
            effective_assets_dir
        );
        let asset_manager = AssetManager::new_with_assets_dir(effective_assets_dir);
        asset_manager.ensure_assets(window, asset_index_ref).await?;
    } else {
        AssetManager::ensure_index_file_on_disk(&effective_assets_dir, version, None, None).await;
    }

    Ok(())
}

/// Downloads a specific Java runtime component from Mojang's manifest.
pub async fn download_jre(component: &str) -> Result<PathBuf, String> {
    let mc_path = get_official_mc_path().await?;
    let java_bin = crate::core::install::runtime::JreManager::new(mc_path)
        .ensure_jre(None, component)
        .await?;
    java_bin
        .parent()
        .and_then(|bin| bin.parent())
        .map(|root| root.to_path_buf())
        .ok_or_else(|| format!("Invalid Java executable path: {}", java_bin.display()))
}
