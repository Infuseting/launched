use crate::core::install::mojang::get_official_mc_path;
use crate::core::launch::models::{Library, VersionManifest};
use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use tokio::fs as tokio_fs;
use tokio::io::AsyncWriteExt;

const DEFAULT_MAVEN_BASE: &str = "https://libraries.minecraft.net/";

struct ForgeInstallContext {
    mc_path: PathBuf,
    mc_version: String,
    forge_version: String,
    forge_id: String,
    installer_path: PathBuf,
    installed_json: PathBuf,
}

#[derive(Debug, Deserialize)]
struct InstallProfile {
    #[serde(rename = "versionInfo")]
    version_info: Option<Value>,
    libraries: Option<Vec<ProfileLibrary>>,
}

#[derive(Debug, Deserialize)]
struct ProfileLibrary {
    name: String,
    url: Option<String>,
}

#[async_trait]
trait ForgeVersionInstallStrategy: Send + Sync {
    async fn install(&self, client: &Client, ctx: &ForgeInstallContext) -> Result<(), String>;
}

struct LegacyForgeInstallStrategy;
struct ModernForgeInstallStrategy;

/**
 * Installs the Forge mod loader for a specific Minecraft version.
 */
pub async fn install_forge(mc_version: &str, forge_version: &str) -> Result<(), String> {
    let client = Client::new();
    let mc_path = get_official_mc_path().await?;
    let forge_id = format!("{}-forge-{}", mc_version, forge_version);
    let version_dir = mc_path.join("versions").join(&forge_id);
    let installer_path = version_dir.join(format!("{}-installer.jar", forge_id));
    let installed_json = version_dir.join(format!("{}.json", forge_id));

    if !version_dir.exists() {
        tokio_fs::create_dir_all(&version_dir)
            .await
            .map_err(|e| format!("Failed to create Forge version directory: {}", e))?;
    }

    let ctx = ForgeInstallContext {
        mc_path,
        mc_version: mc_version.to_string(),
        forge_version: forge_version.to_string(),
        forge_id,
        installer_path,
        installed_json,
    };

    if ctx.installed_json.exists() {
        log::info!(
            "Forge {} already installed, validating and repairing missing libraries if needed",
            ctx.forge_id
        );
        ensure_existing_installation(&client, &ctx).await?;
        return Ok(());
    }

    ensure_installer_downloaded(&client, &ctx).await?;

    let strategy: Box<dyn ForgeVersionInstallStrategy> = if is_legacy_forge_layout(mc_version) {
        Box::new(LegacyForgeInstallStrategy)
    } else {
        Box::new(ModernForgeInstallStrategy)
    };

    strategy.install(&client, &ctx).await
}

#[async_trait]
impl ForgeVersionInstallStrategy for LegacyForgeInstallStrategy {
    async fn install(&self, client: &Client, ctx: &ForgeInstallContext) -> Result<(), String> {
        log::info!("Using legacy Forge install strategy for {}", ctx.forge_id);

        let mut profile_str = String::new();
        let universal_name = format!(
            "forge-{}-{}-universal.jar",
            ctx.mc_version, ctx.forge_version
        );

        {
            let file = fs::File::open(&ctx.installer_path).map_err(|e| {
                format!(
                    "Failed to open forge installer {:?}: {}",
                    ctx.installer_path, e
                )
            })?;
            let mut archive = zip::ZipArchive::new(file)
                .map_err(|e| format!("Failed to read forge installer ZIP: {}", e))?;

            let mut profile_file = archive
                .by_name("install_profile.json")
                .map_err(|e| format!("install_profile.json not found in installer: {}", e))?;

            profile_file
                .read_to_string(&mut profile_str)
                .map_err(|e| format!("Failed to read install_profile.json: {}", e))?;
            drop(profile_file);

            let lib_dir = ctx
                .mc_path
                .join("libraries")
                .join("net")
                .join("minecraftforge")
                .join("forge")
                .join(format!("{}-{}", ctx.mc_version, ctx.forge_version));
            fs::create_dir_all(&lib_dir)
                .map_err(|e| format!("Failed to create forge lib dir: {}", e))?;
            let dest_jar = lib_dir.join(format!("forge-{}-{}.jar", ctx.mc_version, ctx.forge_version));

            let mut universal_jar = archive.by_name(&universal_name).map_err(|e| {
                format!(
                    "Universal jar {} not found in installer: {}",
                    universal_name, e
                )
            })?;

            let mut out_file = fs::File::create(&dest_jar)
                .map_err(|e| format!("Failed to create forge library jar: {}", e))?;
            std::io::copy(&mut universal_jar, &mut out_file)
                .map_err(|e| format!("Failed to extract forge universal jar: {}", e))?;
            drop(universal_jar);
            drop(out_file);

            extract_maven_entries(&mut archive, &ctx.mc_path)?;
        }

        let profile: InstallProfile = serde_json::from_str(&profile_str)
            .map_err(|e| format!("Failed to parse install_profile.json: {}", e))?;

        let mut version_info_obj = profile
            .version_info
            .ok_or_else(|| "Missing versionInfo in install_profile.json".to_string())?;
        set_json_id(&mut version_info_obj, &ctx.forge_id)?;

        write_version_json(&ctx.installed_json, &version_info_obj)?;

        let manifest: VersionManifest = serde_json::from_value(version_info_obj)
            .map_err(|e| format!("Failed to parse legacy Forge version manifest: {}", e))?;

        ensure_manifest_libraries(client, &ctx.mc_path, &manifest).await?;
        ensure_profile_libraries(client, &ctx.mc_path, profile.libraries.unwrap_or_default()).await?;

        log::info!("Forge {} installed with legacy strategy", ctx.forge_id);
        Ok(())
    }
}

#[async_trait]
impl ForgeVersionInstallStrategy for ModernForgeInstallStrategy {
    async fn install(&self, client: &Client, ctx: &ForgeInstallContext) -> Result<(), String> {
        log::info!("Using modern Forge install strategy for {}", ctx.forge_id);

        let mut version_json_from_installer: Option<Value> = None;
        let mut profile: Option<InstallProfile> = None;

        {
            let file = fs::File::open(&ctx.installer_path).map_err(|e| {
                format!(
                    "Failed to open forge installer {:?}: {}",
                    ctx.installer_path, e
                )
            })?;
            let mut archive = zip::ZipArchive::new(file)
                .map_err(|e| format!("Failed to read forge installer ZIP: {}", e))?;

            if let Ok(mut version_json_file) = archive.by_name("version.json") {
                let mut version_json_str = String::new();
                version_json_file
                    .read_to_string(&mut version_json_str)
                    .map_err(|e| format!("Failed to read version.json from installer: {}", e))?;
                let parsed: Value = serde_json::from_str(&version_json_str)
                    .map_err(|e| format!("Failed to parse installer version.json: {}", e))?;
                version_json_from_installer = Some(parsed);
            }

            if let Ok(mut profile_file) = archive.by_name("install_profile.json") {
                let mut profile_str = String::new();
                profile_file
                    .read_to_string(&mut profile_str)
                    .map_err(|e| format!("Failed to read install_profile.json: {}", e))?;
                let parsed_profile: InstallProfile = serde_json::from_str(&profile_str)
                    .map_err(|e| format!("Failed to parse install_profile.json: {}", e))?;
                profile = Some(parsed_profile);
            }

            extract_maven_entries(&mut archive, &ctx.mc_path)?;
        }

        let mut version_json = if let Some(v) = version_json_from_installer {
            v
        } else if let Some(p) = &profile {
            p.version_info
                .clone()
                .ok_or_else(|| "Missing both version.json and versionInfo in installer".to_string())?
        } else {
            return Err("Missing both version.json and install_profile.json in installer".to_string());
        };

        set_json_id(&mut version_json, &ctx.forge_id)?;
        write_version_json(&ctx.installed_json, &version_json)?;

        let manifest: VersionManifest = serde_json::from_value(version_json)
            .map_err(|e| format!("Failed to parse modern Forge version manifest: {}", e))?;

        ensure_manifest_libraries(client, &ctx.mc_path, &manifest).await?;
        if let Some(p) = profile {
            ensure_profile_libraries(client, &ctx.mc_path, p.libraries.unwrap_or_default()).await?;
        }

        log::info!("Forge {} installed with modern strategy", ctx.forge_id);
        Ok(())
    }
}

async fn ensure_installer_downloaded(client: &Client, ctx: &ForgeInstallContext) -> Result<(), String> {
    if ctx.installer_path.exists() {
        return Ok(());
    }

    let url = format!(
        "https://maven.minecraftforge.net/net/minecraftforge/forge/{}-{}/forge-{}-{}-installer.jar",
        ctx.mc_version, ctx.forge_version, ctx.mc_version, ctx.forge_version
    );

    let mut response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to download Forge installer: {}", e))?;

    if !response.status().is_success() {
        let alt_url = format!(
            "https://maven.minecraftforge.net/net/minecraftforge/forge/{0}/forge-{0}-installer.jar",
            ctx.forge_version
        );
        response = client
            .get(&alt_url)
            .send()
            .await
            .map_err(|e| format!("Failed to download Forge installer (alt): {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Forge installer not found at {}", url));
        }
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read Forge installer: {}", e))?;
    tokio_fs::write(&ctx.installer_path, &bytes)
        .await
        .map_err(|e| format!("Failed to save Forge installer: {}", e))?;

    Ok(())
}

fn is_legacy_forge_layout(mc_version: &str) -> bool {
    let parts: Vec<&str> = mc_version.split('.').collect();
    if parts.len() < 2 {
        return false;
    }

    let major = parts[0].parse::<u32>().ok();
    let minor = parts[1].parse::<u32>().ok();

    matches!((major, minor), (Some(1), Some(m)) if m < 13)
}

fn set_json_id(value: &mut Value, id: &str) -> Result<(), String> {
    match value {
        Value::Object(map) => {
            map.insert("id".to_string(), Value::String(id.to_string()));
            Ok(())
        }
        _ => Err("Forge version JSON is not an object".to_string()),
    }
}

fn write_version_json(path: &Path, value: &Value) -> Result<(), String> {
    let json_str = serde_json::to_string_pretty(value)
        .map_err(|e| format!("Failed to serialize Forge version JSON: {}", e))?;
    fs::write(path, json_str).map_err(|e| format!("Failed to write forge version JSON: {}", e))
}

fn extract_maven_entries(
    archive: &mut zip::ZipArchive<fs::File>,
    mc_path: &Path,
) -> Result<(), String> {
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read installer archive entry {}: {}", i, e))?;
        let entry_name = entry.name().to_string();

        if !entry_name.starts_with("maven/") || entry_name.ends_with('/') {
            continue;
        }

        let rel = entry_name.trim_start_matches("maven/");
        let dest = mc_path.join("libraries").join(rel);

        if dest.exists() {
            continue;
        }

        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create bundled lib dir {:?}: {}", parent, e))?;
        }

        let mut out = fs::File::create(&dest)
            .map_err(|e| format!("Failed to create bundled lib {:?}: {}", dest, e))?;
        std::io::copy(&mut entry, &mut out)
            .map_err(|e| format!("Failed to extract bundled lib {:?}: {}", dest, e))?;
    }

    Ok(())
}

async fn ensure_manifest_libraries(
    client: &Client,
    mc_path: &Path,
    manifest: &VersionManifest,
) -> Result<(), String> {
    for lib in &manifest.libraries {
        if let Err(e) = ensure_library_from_manifest(client, mc_path, lib).await {
            log::warn!("Failed to download manifest library {}: {}", lib.name, e);
        }
    }

    Ok(())
}

async fn ensure_profile_libraries(
    client: &Client,
    mc_path: &Path,
    libraries: Vec<ProfileLibrary>,
) -> Result<(), String> {
    let mut seen = HashSet::new();

    for lib in libraries {
        if !seen.insert(lib.name.clone()) {
            continue;
        }

        if let Err(e) = ensure_library_from_coordinates(client, mc_path, &lib.name, lib.url.as_deref()).await {
            log::warn!("Failed to download profile library {}: {}", lib.name, e);
        }
    }

    Ok(())
}

async fn ensure_library_from_manifest(
    client: &Client,
    mc_path: &Path,
    lib: &Library,
) -> Result<(), String> {
    if let Some(downloads) = &lib.downloads {
        if let Some(artifact) = &downloads.artifact {
            let dest = mc_path.join("libraries").join(&artifact.path);

            if dest.exists() {
                return Ok(());
            }

            let url = if let Some(url) = &artifact.url {
                url.clone()
            } else {
                let base = lib.url.as_deref().unwrap_or(DEFAULT_MAVEN_BASE);
                join_maven_url(base, &artifact.path)
            };

            download_file_stream(client, &url, &dest).await?;
            return Ok(());
        }
    }

    ensure_library_from_coordinates(client, mc_path, &lib.name, lib.url.as_deref()).await
}

async fn ensure_library_from_coordinates(
    client: &Client,
    mc_path: &Path,
    coordinates: &str,
    base_url: Option<&str>,
) -> Result<(), String> {
    let maven_path = maven_path_from_name(coordinates)
        .ok_or_else(|| format!("Invalid maven coordinates: {}", coordinates))?;

    let dest = mc_path.join("libraries").join(&maven_path);
    if dest.exists() {
        return Ok(());
    }

    let url = join_maven_url(base_url.unwrap_or(DEFAULT_MAVEN_BASE), &maven_path);
    download_file_stream(client, &url, &dest).await
}

fn maven_path_from_name(name: &str) -> Option<String> {
    let parts: Vec<&str> = name.split(':').collect();
    if parts.len() < 3 {
        return None;
    }

    let group = parts[0].replace('.', "/");
    let artifact = parts[1];

    let (version, explicit_ext) = if let Some((v, ext)) = parts[2].split_once('@') {
        (v, Some(ext))
    } else {
        (parts[2], None)
    };

    let classifier = if parts.len() >= 4 {
        let raw = parts[3];
        if let Some((c, _)) = raw.split_once('@') {
            Some(c)
        } else {
            Some(raw)
        }
    } else {
        None
    };

    let extension = if parts.len() >= 4 {
        if let Some((_, ext)) = parts[3].split_once('@') {
            ext
        } else {
            explicit_ext.unwrap_or("jar")
        }
    } else {
        explicit_ext.unwrap_or("jar")
    };

    let filename = if let Some(classifier) = classifier {
        format!("{}-{}-{}.{}", artifact, version, classifier, extension)
    } else {
        format!("{}-{}.{}", artifact, version, extension)
    };

    Some(format!(
        "{}/{}/{}/{}",
        group, artifact, version, filename
    ))
}

fn join_maven_url(base: &str, path: &str) -> String {
    if base.ends_with('/') {
        format!("{}{}", base, path)
    } else {
        format!("{}/{}", base, path)
    }
}

async fn download_file_stream(client: &Client, url: &str, destination: &Path) -> Result<(), String> {
    if let Some(parent) = destination.parent() {
        tokio_fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create dir {:?}: {}", parent, e))?;
    }

    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to download {}: {}", url, e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP {} for {}", response.status(), url));
    }

    let mut file = tokio_fs::File::create(destination)
        .await
        .map_err(|e| format!("Failed to create file {:?}: {}", destination, e))?;

    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("Chunk error from {}: {}", url, e))?
    {
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Write error for {:?}: {}", destination, e))?;
    }

    Ok(())
}

pub async fn is_forge_installed(mc_version: &str, forge_version: &str) -> bool {
    if let Ok(mc_path) = get_official_mc_path().await {
        let forge_id = format!("{}-forge-{}", mc_version, forge_version);
        mc_path
            .join("versions")
            .join(&forge_id)
            .join(format!("{}.json", forge_id))
            .exists()
    } else {
        false
    }
}

async fn ensure_existing_installation(client: &Client, ctx: &ForgeInstallContext) -> Result<(), String> {
    let content = tokio_fs::read_to_string(&ctx.installed_json)
        .await
        .map_err(|e| format!("Failed to read existing forge version JSON: {}", e))?;

    let manifest: VersionManifest = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse existing forge version manifest: {}", e))?;

    ensure_manifest_libraries(client, &ctx.mc_path, &manifest).await?;

    if ctx.installer_path.exists() {
        let profile_libraries = {
            let file = fs::File::open(&ctx.installer_path).map_err(|e| {
                format!(
                    "Failed to open existing forge installer {:?}: {}",
                    ctx.installer_path, e
                )
            })?;
            let mut archive = zip::ZipArchive::new(file)
                .map_err(|e| format!("Failed to read existing forge installer ZIP: {}", e))?;

            extract_maven_entries(&mut archive, &ctx.mc_path)?;

            let parsed_profile_libraries = if let Ok(mut profile_file) = archive.by_name("install_profile.json") {
                let mut profile_str = String::new();
                profile_file
                    .read_to_string(&mut profile_str)
                    .map_err(|e| format!("Failed to read existing install_profile.json: {}", e))?;
                let profile: InstallProfile = serde_json::from_str(&profile_str)
                    .map_err(|e| format!("Failed to parse existing install_profile.json: {}", e))?;
                profile.libraries.unwrap_or_default()
            } else {
                Vec::new()
            };

            parsed_profile_libraries
        };

        if !profile_libraries.is_empty() {
            ensure_profile_libraries(client, &ctx.mc_path, profile_libraries).await?;
        }
    } else {
        log::warn!(
            "Forge installer missing at {:?}, cannot extract bundled maven entries for repair",
            ctx.installer_path
        );
    }

    Ok(())
}
