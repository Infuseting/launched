use crate::core::install::mojang::get_official_mc_path;
use reqwest::Client;
use std::fs;
use tokio::fs as tokio_fs;

/**
 * Installs the Forge mod loader for a specific Minecraft version.
 */
pub async fn install_forge(mc_version: &str, forge_version: &str) -> Result<(), String> {
    let client = Client::new();
    let mc_path = get_official_mc_path().await?;
    let forge_id = format!("{}-forge-{}", mc_version, forge_version);
    let version_dir = mc_path.join("versions").join(&forge_id);
    let installer_path = version_dir.join(format!("{}-installer.jar", forge_id));

    if !version_dir.exists() {
        tokio_fs::create_dir_all(&version_dir)
            .await
            .map_err(|e| format!("Failed to create Forge version directory: {}", e))?;
    }

    let installed_json = version_dir.join(format!("{}.json", forge_id));
    if installed_json.exists() {
        return Ok(());
    }

    // Step 1: Download the Forge installer
    if !installer_path.exists() {
        let url = format!(
            "https://maven.minecraftforge.net/net/minecraftforge/forge/{}-{}/forge-{}-{}-installer.jar",
            mc_version, forge_version, mc_version, forge_version
        );

        let mut response = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to download Forge installer: {}", e))?;

        if !response.status().is_success() {
            let alt_url = format!(
                "https://maven.minecraftforge.net/net/minecraftforge/forge/{0}/forge-{0}-installer.jar",
                forge_version
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
        tokio_fs::write(&installer_path, &bytes)
            .await
            .map_err(|e| format!("Failed to save Forge installer: {}", e))?;
    }

    log::info!("Extracting Forge profile from installer {}", forge_id);

    // Step 2: Extract manually (in a sync block to avoid holding non-Send ZipArchive across awaits)
    let mut profile_str = String::new();
    let universal_name = format!("forge-{}-{}-universal.jar", mc_version, forge_version);
    let dest_jar: std::path::PathBuf;
    let lib_dir: std::path::PathBuf;

    {
        let file = fs::File::open(&installer_path)
            .map_err(|e| format!("Failed to open forge installer {:?}: {}", installer_path, e))?;
        let mut archive = zip::ZipArchive::new(file)
            .map_err(|e| format!("Failed to read forge installer ZIP: {}", e))?;

        // 2.1 Extract install_profile.json
        let mut profile_file = archive
            .by_name("install_profile.json")
            .map_err(|e| format!("install_profile.json not found in installer: {}", e))?;

        std::io::Read::read_to_string(&mut profile_file, &mut profile_str)
            .map_err(|e| format!("Failed to read install_profile.json: {}", e))?;

        drop(profile_file);

        // Prep the jar extraction paths
        lib_dir = mc_path
            .join("libraries")
            .join("net")
            .join("minecraftforge")
            .join("forge")
            .join(format!("{}-{}", mc_version, forge_version));

        fs::create_dir_all(&lib_dir)
            .map_err(|e| format!("Failed to create forge lib dir: {}", e))?;
        dest_jar = lib_dir.join(format!("forge-{}-{}.jar", mc_version, forge_version));

        // 2.2 Extract universal jar
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
    }

    // Now format and save JSON without blocking tokio awaits issues
    let profile: serde_json::Value = serde_json::from_str(&profile_str)
        .map_err(|e| format!("Failed to parse install_profile.json: {}", e))?;

    let version_info = profile
        .get("versionInfo")
        .ok_or_else(|| "Missing versionInfo in install_profile.json".to_string())?;

    let mut version_info_obj = version_info.clone();
    if let serde_json::Value::Object(ref mut map) = version_info_obj {
        map.insert(
            "id".to_string(),
            serde_json::Value::String(forge_id.clone()),
        );
    }

    let version_json_str = serde_json::to_string_pretty(&version_info_obj)
        .map_err(|e| format!("Failed to serialize version JSON: {}", e))?;

    // Save version.json synchronously (we just did heavy synchronous disk IO anyway)
    fs::write(&installed_json, &version_json_str)
        .map_err(|e| format!("Failed to write forge version JSON: {}", e))?;

    // Step 3: Download missing libraries declared in version.json
    // Forge libraries don't have the standard 'downloads' block, we must resolve them via Maven coordinates
    let manifest: crate::core::launch::models::VersionManifest =
        serde_json::from_str(&version_json_str).map_err(|e| {
            format!(
                "Failed to parse final forge JSON for library downloads: {}",
                e
            )
        })?;

    let lib_base = mc_path.join("libraries");
    for lib in manifest.libraries {
        let parts: Vec<&str> = lib.name.split(':').collect();
        if parts.len() >= 3 {
            let group = parts[0].replace('.', "/");
            let name = parts[1];
            let ver = parts[2];
            let jar_name = format!("{}-{}.jar", name, ver);
            let p = lib_base.join(&group).join(name).join(ver).join(&jar_name);

            if !p.exists() {
                let base_url = lib
                    .url
                    .clone()
                    .unwrap_or_else(|| "https://libraries.minecraft.net/".to_string());
                let mut url = format!("{}{}/{}/{}/{}", base_url, group, name, ver, jar_name);

                // Some old forge json URLs are just "https://maven.minecraftforge.net/" without the trailing slash
                if !base_url.ends_with('/') {
                    url = format!("{}/{}/{}/{}/{}", base_url, group, name, ver, jar_name);
                }

                log::info!("Downloading Forge lib: {}", jar_name);
                if let Some(parent) = p.parent() {
                    tokio_fs::create_dir_all(parent).await.unwrap_or_default();
                }

                if let Ok(mut response) = client.get(&url).send().await {
                    if response.status().is_success() {
                        if let Ok(mut file) = tokio_fs::File::create(&p).await {
                            while let Ok(Some(chunk)) = response.chunk().await {
                                let _ =
                                    tokio::io::AsyncWriteExt::write_all(&mut file, &chunk).await;
                            }
                        }
                    } else {
                        log::warn!("Failed to download {}: HTTP {}", url, response.status());
                    }
                }
            }
        }
    }

    log::info!("Forge {} completely installed successfully.", forge_id);
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
