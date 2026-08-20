use crate::core::install::mojang::get_official_mc_path;
use reqwest::Client;
use serde::Deserialize;
use tokio::fs;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FabricLibrary {
    pub name: String,
    pub url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FabricProfile {
    pub id: String,
    #[serde(alias = "inherits_from", default)]
    pub inherits_from: Option<String>,
    #[serde(default)]
    pub r#type: Option<String>,
    #[serde(alias = "main_class", default)]
    pub main_class: Option<String>,
    #[serde(default)]
    pub arguments: Option<serde_json::Value>,
    #[serde(default)]
    pub libraries: Vec<FabricLibrary>,
}

/**
 * Installs the Fabric mod loader for a specific Minecraft version.
 */
pub async fn install_fabric(mc_version: &str, loader_version: &str) -> Result<(), String> {
    let client = Client::new();
    let mc_path = get_official_mc_path().await?;
    let fabric_version_id = format!("fabric-loader-{}-{}", loader_version, mc_version);
    let version_dir = mc_path.join("versions").join(&fabric_version_id);
    let version_json_path = version_dir.join(format!("{}.json", fabric_version_id));

    if !version_dir.exists() {
        fs::create_dir_all(&version_dir)
            .await
            .map_err(|e| format!("Failed to create Fabric version directory: {}", e))?;
    }

    // Step 1: Fetch Fabric profile JSON
    let url = format!(
        "https://meta.fabricmc.net/v2/versions/loader/{}/{}/profile/json",
        mc_version, loader_version
    );

    if !version_json_path.exists() {
        let response = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch Fabric profile for {}: {}", mc_version, e))?;

        let content = response
            .text()
            .await
            .map_err(|e| format!("Failed to read Fabric profile content: {}", e))?;

        fs::write(&version_json_path, &content)
            .await
            .map_err(|e| format!("Failed to save Fabric version JSON: {}", e))?;
    }

    // Step 2: Download libraries
    let content = fs::read_to_string(&version_json_path)
        .await
        .map_err(|e| format!("Failed to read Fabric version JSON: {}", e))?;

    let profile: FabricProfile = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse Fabric profile: {}", e))?;

    for lib in profile.libraries {
        // Resolve library path
        let parts: Vec<&str> = lib.name.split(':').collect();
        if parts.len() < 3 {
            continue;
        }

        let package = parts[0].replace('.', "/");
        let name = parts[1];
        let version = parts[2];
        let jar_name = format!("{}-{}.jar", name, version);

        let lib_path = mc_path
            .join("libraries")
            .join(package)
            .join(name)
            .join(version)
            .join(&jar_name);

        if !lib_path.exists() {
            if let Some(parent) = lib_path.parent() {
                fs::create_dir_all(parent)
                    .await
                    .map_err(|e| format!("Failed to create library directory: {}", e))?;
            }

            let base_url = lib.url.as_deref().unwrap_or("https://maven.fabricmc.net/");
            let formatted_base = if base_url.ends_with('/') {
                base_url.to_string()
            } else {
                format!("{}/", base_url)
            };

            let download_url = format!("{}{}", formatted_base, package_path_to_maven_path(&lib.name));

            // Skip errors for individual libraries to keep installation robust
            if let Ok(response) = client.get(&download_url).send().await {
                if let Ok(bytes) = response.bytes().await {
                    let _ = fs::write(&lib_path, &bytes).await;
                }
            }
        }
    }

    Ok(())
}

pub async fn is_fabric_installed(mc_version: &str, loader_version: &str) -> bool {
    if let Ok(mc_path) = get_official_mc_path().await {
        let fabric_version_id = format!("fabric-loader-{}-{}", loader_version, mc_version);
        let version_dir = mc_path.join("versions").join(&fabric_version_id);
        let version_json_path = version_dir.join(format!("{}.json", fabric_version_id));

        version_dir.exists() && version_json_path.exists()
    } else {
        false
    }
}

fn package_path_to_maven_path(name: &str) -> String {
    let parts: Vec<&str> = name.split(':').collect();
    if parts.len() < 3 {
        return String::new();
    }

    let package = parts[0].replace('.', "/");
    let name_str = parts[1];
    let version = parts[2];

    format!(
        "{}/{}/{}/{}-{}.jar",
        package, name_str, version, name_str, version
    )
}
