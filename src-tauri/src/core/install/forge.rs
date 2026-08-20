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
        if ensure_existing_installation(&client, &ctx).await.is_ok() {
            return Ok(());
        } else {
            log::warn!("Existing Forge installation is corrupted or missing critical files. Re-installing...");
            let _ = tokio_fs::remove_file(&ctx.installed_json).await;
        }
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

        let lib_dir = ctx
            .mc_path
            .join("libraries")
            .join("net")
            .join("minecraftforge")
            .join("forge")
            .join(format!("{}-{}", ctx.mc_version, ctx.forge_version));
        let dest_jar = lib_dir.join(format!("forge-{}-{}.jar", ctx.mc_version, ctx.forge_version));
        let dest_universal_jar = lib_dir.join(format!("forge-{}-{}-universal.jar", ctx.mc_version, ctx.forge_version));

        let mut version_info_obj: Option<Value> = None;
        let mut profile_libraries: Vec<ProfileLibrary> = Vec::new();

        {
            let file = fs::File::open(&ctx.installer_path).map_err(|e| {
                format!(
                    "Failed to open forge installer {:?}: {}",
                    ctx.installer_path, e
                )
            })?;
            let mut archive = zip::ZipArchive::new(file)
                .map_err(|e| format!("Failed to read forge installer ZIP: {}", e))?;

            // 1. Try reading version.json directly from archive
            if let Ok(mut version_file) = archive.by_name("version.json") {
                let mut s = String::new();
                if version_file.read_to_string(&mut s).is_ok() {
                    if let Ok(parsed) = serde_json::from_str::<Value>(&s) {
                        if parsed.is_object() {
                            version_info_obj = Some(parsed);
                        }
                    }
                }
            }

            // 2. Try reading install_profile.json
            if let Ok(mut profile_file) = archive.by_name("install_profile.json") {
                let mut s = String::new();
                if profile_file.read_to_string(&mut s).is_ok() {
                    if let Ok(parsed) = serde_json::from_str::<Value>(&s) {
                        if let Some(libs_val) = parsed.get("libraries") {
                            if let Ok(libs) = serde_json::from_value::<Vec<ProfileLibrary>>(libs_val.clone()) {
                                profile_libraries = libs;
                            }
                        }

                        if version_info_obj.is_none() {
                            if let Some(v_info) = parsed.get("versionInfo").filter(|v| v.is_object()) {
                                version_info_obj = Some(v_info.clone());
                            } else if let Some(v_info) = parsed.get("version").filter(|v| v.is_object()) {
                                version_info_obj = Some(v_info.clone());
                            } else if let Some(v_info) = parsed.get("json").filter(|v| v.is_object()) {
                                version_info_obj = Some(v_info.clone());
                            } else if parsed.get("mainClass").is_some() || parsed.get("minecraftArguments").is_some() {
                                version_info_obj = Some(parsed.clone());
                            }
                        }
                    }
                }
            }

            fs::create_dir_all(&lib_dir)
                .map_err(|e| format!("Failed to create forge lib dir: {}", e))?;

            // 3. Extract bundled maven entries
            extract_maven_entries(&mut archive, &ctx.mc_path)?;

            // 4. Candidate names for universal / forge jar in zip
            let candidate_names = [
                format!("forge-{}-{}-universal.jar", ctx.mc_version, ctx.forge_version),
                format!("forge-{}-{}.jar", ctx.mc_version, ctx.forge_version),
                format!("forge-{}-universal.jar", ctx.forge_version),
                format!("forge-{}.jar", ctx.forge_version),
                format!("maven/net/minecraftforge/forge/{0}-{1}/forge-{0}-{1}-universal.jar", ctx.mc_version, ctx.forge_version),
                format!("maven/net/minecraftforge/forge/{0}-{1}/forge-{0}-{1}.jar", ctx.mc_version, ctx.forge_version),
            ];

            let mut found_entry_name: Option<String> = None;
            for candidate in &candidate_names {
                if archive.by_name(candidate).is_ok() {
                    found_entry_name = Some(candidate.clone());
                    break;
                }
            }

            // Fallback search across all archive entries
            if found_entry_name.is_none() {
                for i in 0..archive.len() {
                    if let Ok(entry) = archive.by_index(i) {
                        let name = entry.name().to_string();
                        if name.ends_with(".jar") && name.contains(&ctx.forge_version) && (name.contains("universal") || name.contains("forge")) {
                            found_entry_name = Some(name);
                            break;
                        }
                    }
                }
            }

            if let Some(entry_name) = found_entry_name {
                if let Ok(mut jar_entry) = archive.by_name(&entry_name) {
                    let mut bytes = Vec::new();
                    if jar_entry.read_to_end(&mut bytes).is_ok() {
                        let _ = fs::write(&dest_jar, &bytes);
                        let _ = fs::write(&dest_universal_jar, &bytes);
                    }
                }
            }
        }

        // 5. Fallback: If forge library jar does not exist, download directly from Maven
        if !dest_jar.exists() && !dest_universal_jar.exists() {
            log::info!("Universal jar not found in installer, downloading directly from Maven...");
            let download_urls = [
                format!("https://maven.minecraftforge.net/net/minecraftforge/forge/{0}-{1}/forge-{0}-{1}-universal.jar", ctx.mc_version, ctx.forge_version),
                format!("https://maven.minecraftforge.net/net/minecraftforge/forge/{0}-{1}/forge-{0}-{1}.jar", ctx.mc_version, ctx.forge_version),
                format!("https://maven.minecraftforge.net/net/minecraftforge/forge/{0}/forge-{0}-universal.jar", ctx.forge_version),
            ];

            for url in &download_urls {
                if let Ok(resp) = client.get(url).send().await {
                    if resp.status().is_success() {
                        if let Ok(bytes) = resp.bytes().await {
                            let _ = tokio_fs::create_dir_all(&lib_dir).await;
                            let _ = tokio_fs::write(&dest_jar, &bytes).await;
                            let _ = tokio_fs::write(&dest_universal_jar, &bytes).await;
                            break;
                        }
                    }
                }
            }
        }

        // 6. Build the final version JSON object
        let mut final_version_info = if let Some(obj) = version_info_obj {
            obj
        } else {
            // Load vanilla version JSON as fallback base
            let vanilla_path = ctx.mc_path.join("versions").join(&ctx.mc_version).join(format!("{}.json", ctx.mc_version));
            let mut vanilla_obj = if vanilla_path.exists() {
                let content = fs::read_to_string(&vanilla_path).map_err(|e| format!("Failed to read vanilla json: {}", e))?;
                serde_json::from_str::<Value>(&content).unwrap_or_else(|_| serde_json::json!({}))
            } else {
                serde_json::json!({
                    "id": ctx.forge_id,
                    "inheritsFrom": ctx.mc_version,
                    "type": "release",
                    "mainClass": "net.minecraft.launchwrapper.Launch",
                    "minecraftArguments": "--username ${auth_player_name} --version ${version_name} --gameDir ${game_directory} --assetsDir ${assets_root} --assetIndex ${assets_index_name} --uuid ${auth_uuid} --accessToken ${auth_access_token} --userType ${user_type} --tweakClass net.minecraftforge.fml.common.launcher.FMLTweaker --versionType Forge",
                    "libraries": []
                })
            };

            if let Value::Object(ref mut map) = vanilla_obj {
                map.insert("mainClass".to_string(), Value::String("net.minecraft.launchwrapper.Launch".to_string()));
                map.insert("inheritsFrom".to_string(), Value::String(ctx.mc_version.clone()));
            }
            vanilla_obj
        };

        set_json_id(&mut final_version_info, &ctx.forge_id)?;
        write_version_json(&ctx.installed_json, &final_version_info)?;

        if let Ok(manifest) = serde_json::from_value::<VersionManifest>(final_version_info) {
            let _ = ensure_manifest_libraries(client, &ctx.mc_path, &manifest).await;
        }

        if !profile_libraries.is_empty() {
            let _ = ensure_profile_libraries(client, &ctx.mc_path, profile_libraries).await;
        }

        log::info!("Forge {} installed with legacy strategy", ctx.forge_id);
        Ok(())
    }
}

#[async_trait]
impl ForgeVersionInstallStrategy for ModernForgeInstallStrategy {
    async fn install(&self, client: &Client, ctx: &ForgeInstallContext) -> Result<(), String> {
        log::info!("Using modern Forge install strategy for {}", ctx.forge_id);

        // 1. Fetch vanilla version JSON to determine the correct Java component
        let vanilla_json_path = ctx
            .mc_path
            .join("versions")
            .join(&ctx.mc_version)
            .join(format!("{}.json", ctx.mc_version));
            
        let mut java_component = "jre-legacy".to_string();
        if vanilla_json_path.exists() {
            if let Ok(content) = fs::read_to_string(&vanilla_json_path) {
                if let Ok(parsed) = serde_json::from_str::<Value>(&content) {
                    if let Some(comp) = parsed
                        .get("javaVersion")
                        .and_then(|j| j.get("component"))
                        .and_then(|c| c.as_str())
                    {
                        java_component = comp.to_string();
                    }
                }
            }
        }

        // 2. Download/Ensure JRE is available
        let jre_path = crate::core::install::mojang::download_jre(&java_component).await?;
        let java_bin = if cfg!(windows) {
            jre_path.join("bin/java.exe")
        } else {
            jre_path.join("bin/java")
        };

        // 3. Ensure launcher_profiles.json exists (Forge installer requires it)
        let profiles_path = ctx.mc_path.join("launcher_profiles.json");
        if !profiles_path.exists() {
            let _ = fs::write(&profiles_path, "{ \"profiles\": {} }");
        }

        log::info!("Running Forge Installer natively using java: {:?}", java_bin);
        
        // 4. Execute Forge Installer headlessly
        let output = std::process::Command::new(&java_bin)
            .current_dir(&ctx.mc_path)
            .arg("-jar")
            .arg(&ctx.installer_path)
            .arg("--installClient")
            .arg(&ctx.mc_path)
            .output()
            .map_err(|e| format!("Failed to execute Forge installer: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            return Err(format!("Forge installer failed:\nSTDOUT: {}\nSTDERR: {}", stdout, stderr));
        }

        // 5. Ensure version.json is available in the expected location
        if !ctx.installed_json.exists() {
            log::warn!("Forge installer did not create json at {:?}, extracting manually...", ctx.installed_json);
            
            let file = fs::File::open(&ctx.installer_path).map_err(|e| {
                format!("Failed to open forge installer {:?}: {}", ctx.installer_path, e)
            })?;
            let mut archive = zip::ZipArchive::new(file)
                .map_err(|e| format!("Failed to read forge installer ZIP: {}", e))?;

            let version_json_str = {
                if let Ok(mut version_json_file) = archive.by_name("version.json") {
                    let mut s = String::new();
                    if version_json_file.read_to_string(&mut s).is_ok() {
                        Some(s)
                    } else {
                        None
                    }
                } else {
                    None
                }
            };

            let profile_str = if version_json_str.is_none() {
                if let Ok(mut profile_file) = archive.by_name("install_profile.json") {
                    let mut s = String::new();
                    if profile_file.read_to_string(&mut s).is_ok() {
                        Some(s)
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                None
            };

            let mut version_json = if let Some(v) = version_json_str {
                serde_json::from_str::<Value>(&v)
                    .map_err(|e| format!("Failed to parse installer version.json: {}", e))?
            } else if let Some(p) = profile_str {
                let parsed_profile: Value = serde_json::from_str(&p)
                    .map_err(|e| format!("Failed to parse install_profile.json: {}", e))?;
                if let Some(v) = parsed_profile.get("versionInfo").filter(|v| v.is_object()) {
                    v.clone()
                } else if let Some(v) = parsed_profile.get("version").filter(|v| v.is_object()) {
                    v.clone()
                } else if let Some(v) = parsed_profile.get("json").filter(|v| v.is_object()) {
                    v.clone()
                } else {
                    parsed_profile
                }
            } else {
                return Err("Missing version.json and install_profile.json in installer".to_string());
            };

            set_json_id(&mut version_json, &ctx.forge_id)?;
            write_version_json(&ctx.installed_json, &version_json)?;
        } else {
            // If it exists, enforce our custom ID to match exactly
            if let Ok(content) = fs::read_to_string(&ctx.installed_json) {
                if let Ok(mut parsed) = serde_json::from_str::<Value>(&content) {
                    if set_json_id(&mut parsed, &ctx.forge_id).is_ok() {
                        let _ = write_version_json(&ctx.installed_json, &parsed);
                    }
                }
            }
        }

        // 6. Verify manifest libraries
        let content = fs::read_to_string(&ctx.installed_json)
            .map_err(|e| format!("Failed to read generated version json: {}", e))?;
        let manifest: VersionManifest = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse modern Forge version manifest: {}", e))?;

        ensure_manifest_libraries(client, &ctx.mc_path, &manifest).await?;

        log::info!("Forge {} installed with modern strategy via native installer", ctx.forge_id);
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
    let mut missing_critical = false;
    for lib in &manifest.libraries {
        if let Err(e) = ensure_library_from_manifest(client, mc_path, lib).await {
            log::warn!("Failed to download manifest library {}: {}", lib.name, e);
            if lib.name.starts_with("net.minecraftforge:") || lib.name.starts_with("net.minecraft:client:") {
                missing_critical = true;
            }
        }
    }

    if missing_critical {
        return Err("Critical Forge libraries are missing and could not be downloaded.".to_string());
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

        let mut success = false;
        if let Some(url) = lib.url.as_deref() {
            if ensure_library_from_coordinates(client, mc_path, &lib.name, Some(url)).await.is_ok() {
                success = true;
            }
        }

        if !success {
            // Try default maven
            if ensure_library_from_coordinates(client, mc_path, &lib.name, None).await.is_ok() {
                success = true;
            }
        }

        if !success {
            // Try forge maven
            if ensure_library_from_coordinates(client, mc_path, &lib.name, Some("https://maven.minecraftforge.net/")).await.is_ok() {
                success = true;
            }
        }

        if !success {
            log::warn!("Failed to download profile library {}", lib.name);
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

    loop {
        match response.chunk().await {
            Ok(Some(chunk)) => {
                if let Err(e) = file.write_all(&chunk).await {
                    drop(file);
                    let _ = tokio_fs::remove_file(destination).await;
                    return Err(format!("Write error for {:?}: {}", destination, e));
                }
            }
            Ok(None) => break,
            Err(e) => {
                drop(file);
                let _ = tokio_fs::remove_file(destination).await;
                return Err(format!("Chunk error from {}: {}", url, e));
            }
        }
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
