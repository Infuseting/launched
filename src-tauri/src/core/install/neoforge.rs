use crate::core::install::{mojang, resolve_installer_java, run_java_installer};
use crate::core::launch::models::VersionManifest;
use crate::core::maven::{maven_coordinate_to_path, validate_relative_path};
use reqwest::Client;
use serde_json::Value;
use std::{io::Read, path::Path};
use tokio::fs;

/// NeoForge's native installer executes its client processors and produces the
/// patched Minecraft libraries; downloading only the version JSON is insufficient.
pub async fn install_neoforge(mc_version: &str, version: &str) -> Result<(), String> {
    let mc_path = mojang::get_official_mc_path().await?;
    let version_id = format!("neoforge-{}", version);
    let version_dir = mc_path.join("versions").join(&version_id);
    fs::create_dir_all(&version_dir)
        .await
        .map_err(|e| e.to_string())?;
    let installed_json = version_dir.join(format!("{}.json", version_id));
    let completion = version_dir.join("installed-client-libraries.json");

    // A manifest alone does not prove that the installer processors completed.
    if let Ok(content) = fs::read_to_string(&installed_json).await {
        if let Ok(marker) = fs::read_to_string(&completion).await {
            if let Ok(paths) = serde_json::from_str::<Vec<String>>(&marker) {
                if !paths.is_empty()
                    && validate_profile(&content, mc_version, &mc_path).is_ok()
                    && validate_generated_libraries(&paths, &mc_path).is_ok()
                {
                    return Ok(());
                }
            }
        }
    }

    let client = Client::new();
    let installer = version_dir.join(format!("{}-installer.jar", version_id));
    let url = format!("https://maven.neoforged.net/releases/net/neoforged/neoforge/{0}/neoforge-{0}-installer.jar", version);
    let bytes = client
        .get(&url)
        .send()
        .await
        .and_then(|response| response.error_for_status())
        .map_err(|e| format!("Failed to download NeoForge {}: {}", version, e))?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    let (profile, generated_libraries) = {
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(&bytes))
            .map_err(|e| format!("Invalid NeoForge installer: {}", e))?;
        let mut content = String::new();
        archive
            .by_name("version.json")
            .map_err(|e| e.to_string())?
            .read_to_string(&mut content)
            .map_err(|e| e.to_string())?;
        let profile =
            serde_json::from_str::<VersionManifest>(&content).map_err(|e| e.to_string())?;
        content.clear();
        archive
            .by_name("install_profile.json")
            .map_err(|e| e.to_string())?
            .read_to_string(&mut content)
            .map_err(|e| e.to_string())?;
        let install: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        let mut paths = Vec::new();
        for key in ["PATCHED", "MC_EXTRA"] {
            let coordinate = install["data"][key]["client"]
                .as_str()
                .and_then(|v| v.strip_prefix('['))
                .and_then(|v| v.strip_suffix(']'))
                .ok_or_else(|| format!("NeoForge installer is missing client output {}", key))?;
            paths.push(
                maven_coordinate_to_path(coordinate)
                    .ok_or_else(|| format!("Invalid NeoForge client output {}", coordinate))?,
            );
        }
        (profile, paths)
    };
    if profile.inherits_from.as_deref() != Some(mc_version) {
        return Err(format!(
            "NeoForge {} requires Minecraft {}, but this session uses {}.",
            version,
            profile.inherits_from.as_deref().unwrap_or("unknown"),
            mc_version
        ));
    }
    // The official profile ID is used to locate the installer's actual output.
    if profile.id.contains(['/', '\\']) || profile.id == "." || profile.id == ".." {
        return Err("Invalid NeoForge profile ID".to_string());
    }
    fs::write(&installer, &bytes)
        .await
        .map_err(|e| e.to_string())?;

    let vanilla_path = mc_path
        .join("versions")
        .join(mc_version)
        .join(format!("{}.json", mc_version));
    let vanilla: VersionManifest = serde_json::from_str(
        &fs::read_to_string(vanilla_path)
            .await
            .map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    let java = profile
        .java_version
        .as_ref()
        .or(vanilla.java_version.as_ref());
    let java_bin = resolve_installer_java(
        &mc_path,
        Some(mc_version),
        java.map(|j| j.major_version),
        java.map(|j| j.component.as_str()),
    )
    .await?;
    run_java_installer(&installer, &mc_path, &java_bin, "NeoForge").await?;

    let output_json = mc_path
        .join("versions")
        .join(&profile.id)
        .join(format!("{}.json", profile.id));
    let content = fs::read_to_string(&output_json).await.map_err(|e| {
        format!(
            "NeoForge installer did not produce {:?}: {}",
            output_json, e
        )
    })?;
    validate_profile(&content, mc_version, &mc_path)?;
    validate_generated_libraries(&generated_libraries, &mc_path)?;
    let mut manifest: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    manifest["id"] = Value::String(version_id);
    fs::write(
        &installed_json,
        serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?,
    )
    .await
    .map_err(|e| e.to_string())?;
    fs::write(
        &completion,
        serde_json::to_vec(&generated_libraries).map_err(|e| e.to_string())?,
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn validate_generated_libraries(paths: &[String], mc_path: &Path) -> Result<(), String> {
    for relative in paths {
        let safe_rel = validate_relative_path(relative)
            .ok_or_else(|| format!("Invalid NeoForge library path: {}", relative))?;
        let path = mc_path.join("libraries").join(safe_rel);
        if !path.is_file() || path.metadata().map(|m| m.len() == 0).unwrap_or(true) {
            return Err(format!(
                "NeoForge client processor output missing or empty: {}",
                path.display()
            ));
        }
    }
    Ok(())
}

fn validate_profile(content: &str, mc_version: &str, mc_path: &Path) -> Result<(), String> {
    let manifest: VersionManifest = serde_json::from_str(content).map_err(|e| e.to_string())?;
    if manifest.inherits_from.as_deref() != Some(mc_version) || manifest.main_class.is_empty() {
        return Err("NeoForge profile does not match this Minecraft version".to_string());
    }
    if !manifest
        .libraries
        .iter()
        .any(|lib| lib.name.starts_with("net.neoforged:"))
    {
        return Err("NeoForge profile contains no NeoForge libraries".to_string());
    }
    for lib in &manifest.libraries {
        let relative = lib
            .downloads
            .as_ref()
            .and_then(|d| d.artifact.as_ref())
            .map(|a| a.path.clone())
            .or_else(|| maven_coordinate_to_path(&lib.name))
            .ok_or_else(|| format!("Invalid NeoForge library: {}", lib.name))?;
        let safe_rel = validate_relative_path(&relative)
            .ok_or_else(|| format!("Unsafe NeoForge library path: {}", relative))?;
        let path = mc_path.join("libraries").join(safe_rel);
        if !path.is_file() || path.metadata().map(|m| m.len() == 0).unwrap_or(true) {
            return Err(format!(
                "NeoForge library missing or empty: {}. Re-sync the session.",
                path.display()
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_wrong_minecraft_and_incomplete_installation() {
        let content = r#"{"id":"neoforge-21.1.80","inheritsFrom":"1.21.1","mainClass":"cpw.mods.bootstraplauncher.BootstrapLauncher","libraries":[{"name":"net.neoforged:neoforge:21.1.80:client"}]}"#;
        let root = std::env::temp_dir().join(format!("neo-validation-{}", uuid::Uuid::new_v4()));
        assert!(validate_profile(content, "1.20.1", &root)
            .unwrap_err()
            .contains("does not match"));
        assert!(validate_profile(content, "1.21.1", &root)
            .unwrap_err()
            .contains("missing or empty"));
    }
}
