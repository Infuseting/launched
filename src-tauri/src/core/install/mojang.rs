use std::path::PathBuf;
use serde::Deserialize;
use reqwest::Client;
use tokio::io::AsyncWriteExt;
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

pub async fn get_official_mc_path() -> Result<PathBuf, String> {
    if cfg!(windows) {
        Ok(PathBuf::from(std::env::var("APPDATA").unwrap_or_default()).join(".minecraft"))
    } else {
        let home = std::env::var("HOME").map_err(|_| "Could not find HOME directory")?;
        Ok(PathBuf::from(home).join(".minecraft"))
    }
}

/// Installs the base Minecraft version (JSON and JAR) if missing.
pub async fn install_version(version: &str) -> Result<(), String> {
    let client = Client::new();
    let mc_path = get_official_mc_path().await?;
    let version_dir = mc_path.join("versions").join(version);
    let version_json_path = version_dir.join(format!("{}.json", version));
    let version_jar_path = version_dir.join(format!("{}.jar", version));

    if !version_dir.exists() {
        fs::create_dir_all(&version_dir).await.map_err(|e| format!("Failed to create version directory: {}", e))?;
    }

    // Step 1: Fetch version manifest to find the download URL for the requested version
    let manifest: VersionManifestIndex = client.get(VERSION_MANIFEST_URL)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch version manifest: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse version manifest: {}", e))?;

    let version_info = manifest.versions.iter()
        .find(|v| v.id == version)
        .ok_or_else(|| format!("Version {} not found in manifest", version))?;

    // Step 2: Download the version JSON first
    if !version_json_path.exists() {
        let response = client.get(&version_info.url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch version JSON for {}: {}", version, e))?;
        
        let content = response.text()
            .await
            .map_err(|e| format!("Failed to read version JSON content: {}", e))?;
            
        fs::write(&version_json_path, &content).await
            .map_err(|e| format!("Failed to save version JSON: {}", e))?;
    }

    // Then extract the 'client' download URL and download the JAR
    let content = fs::read_to_string(&version_json_path).await
        .map_err(|e| format!("Failed to read version JSON: {}", e))?;
    
    let detail: VersionDetail = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse version detail for {}: {}", version, e))?;

    if !version_jar_path.exists() {
        let mut response = client.get(&detail.downloads.client.url)
            .send()
            .await
            .map_err(|e| format!("Failed to start JAR download for {}: {}", version, e))?;

        let mut file = fs::File::create(&version_jar_path)
            .await
            .map_err(|e| format!("Failed to create JAR file: {}", e))?;

        while let Some(chunk) = response.chunk().await.map_err(|e| format!("Error downloading JAR chunk: {}", e))? {
            file.write_all(&chunk).await.map_err(|e| format!("Failed to write JAR chunk: {}", e))?;
        }
    }

    Ok(())
}
