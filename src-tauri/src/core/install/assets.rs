use crate::core::download::{Checksum, DownloadEngine, DownloadTask};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tokio::fs;

const MOJANG_RESOURCES_BASE_URL: &str = "https://resources.download.minecraft.net";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetIndexReference {
    pub id: String,
    pub sha1: Option<String>,
    pub size: Option<u64>,
    pub url: Option<String>,
    pub total_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetIndexManifest {
    pub objects: HashMap<String, AssetObject>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetObject {
    pub hash: String,
    pub size: u64,
}

pub struct AssetManager {
    engine: DownloadEngine,
    assets_dir: PathBuf,
}

impl AssetManager {
    pub fn new(path: PathBuf) -> Self {
        let assets_dir = if path.file_name().is_some_and(|name| name == ".minecraft") {
            path.join("assets")
        } else {
            path
        };
        Self {
            engine: DownloadEngine::new(32),
            assets_dir,
        }
    }

    pub fn new_with_assets_dir(assets_dir: PathBuf) -> Self {
        Self {
            engine: DownloadEngine::new(32),
            assets_dir,
        }
    }

    pub fn assets_dir(&self) -> &Path {
        &self.assets_dir
    }

    /// Ensures the complete asset index and all asset objects are downloaded.
    pub async fn ensure_assets(
        &self,
        window: Option<&tauri::Window>,
        asset_index_ref: &AssetIndexReference,
    ) -> Result<(), String> {
        fs::create_dir_all(&self.assets_dir).await.map_err(|e| {
            format!(
                "Failed to create assets directory {:?}: {}",
                self.assets_dir, e
            )
        })?;

        let index_dir = self.assets_dir.join("indexes");
        let index_file = index_dir.join(format!("{}.json", asset_index_ref.id));

        fs::create_dir_all(&index_dir)
            .await
            .map_err(|e| format!("Failed to create asset indexes directory: {}", e))?;

        // 1. If index file exists but is empty, invalid JSON, or an empty placeholder {"objects":{}}
        // while we have a download URL to fetch the real index, remove it to allow re-download
        if index_file.exists() {
            let is_invalid_or_placeholder = if let Ok(meta) = fs::metadata(&index_file).await {
                if meta.len() == 0 {
                    true
                } else if let Ok(content) = fs::read_to_string(&index_file).await {
                    match serde_json::from_str::<serde_json::Value>(&content) {
                        Ok(val) => {
                            if asset_index_ref
                                .url
                                .as_deref()
                                .is_some_and(|u| !u.trim().is_empty())
                            {
                                val.get("objects")
                                    .and_then(|o| o.as_object())
                                    .map_or(true, |o| o.is_empty())
                            } else {
                                false
                            }
                        }
                        Err(_) => true,
                    }
                } else {
                    true
                }
            } else {
                true
            };

            if is_invalid_or_placeholder {
                let _ = fs::remove_file(&index_file).await;
            }
        }

        // 2. Ensure asset index JSON is downloaded if URL is provided and file is missing or invalid
        if let Some(index_url) = &asset_index_ref.url {
            let trimmed_url = index_url.trim();
            if !trimmed_url.is_empty() {
                let checksum = asset_index_ref.sha1.clone().map(Checksum::Sha1);
                let is_valid =
                    DownloadEngine::is_file_valid(&index_file, asset_index_ref.size, &checksum)
                        .await;

                if !is_valid {
                    log::info!(
                        "Downloading asset index for {} from {}...",
                        asset_index_ref.id,
                        trimmed_url
                    );
                    let task = DownloadTask {
                        url: trimmed_url.to_string(),
                        dest: index_file.clone(),
                        size: asset_index_ref.size,
                        checksum,
                        is_executable: false,
                        description: Some(format!("Asset Index {}", asset_index_ref.id)),
                    };
                    if let Err(e) = self.engine.download_single(&task).await {
                        log::warn!("Failed to download asset index from {}: {}", trimmed_url, e);
                    }
                }
            }
        }

        // If index file is still missing, empty, or corrupted JSON, place fallback minimal index so launch won't fail
        let needs_fallback = if !index_file.exists() {
            true
        } else if let Ok(meta) = fs::metadata(&index_file).await {
            if meta.len() == 0 {
                true
            } else if let Ok(content) = fs::read_to_string(&index_file).await {
                serde_json::from_str::<serde_json::Value>(&content).is_err()
            } else {
                true
            }
        } else {
            true
        };

        if needs_fallback {
            log::warn!(
                "Asset index JSON missing, empty or corrupted at {:?}, placing fallback minimal index",
                index_file
            );
            let _ = fs::write(&index_file, r#"{"objects":{}}"#).await;
        }

        // 3. Parse asset index JSON
        let content = fs::read_to_string(&index_file)
            .await
            .map_err(|e| format!("Failed to read asset index {:?}: {}", index_file, e))?;

        let manifest: AssetIndexManifest = match serde_json::from_str(&content) {
            Ok(m) => m,
            Err(e) => {
                log::warn!(
                    "Failed to parse asset index {:?}: {}, writing valid fallback",
                    index_file,
                    e
                );
                let _ = fs::write(&index_file, r#"{"objects":{}}"#).await;
                AssetIndexManifest {
                    objects: std::collections::HashMap::new(),
                }
            }
        };

        let objects_dir = self.assets_dir.join("objects");
        fs::create_dir_all(&objects_dir).await.map_err(|e| {
            format!(
                "Failed to create asset objects directory {:?}: {}",
                objects_dir, e
            )
        })?;

        // 4. Prepare asset download tasks
        let mut tasks = Vec::with_capacity(manifest.objects.len());

        for (name, obj) in manifest.objects {
            if obj.hash.len() < 2 {
                continue;
            }

            let sub_dir = &obj.hash[0..2];
            let dest_path = objects_dir.join(sub_dir).join(&obj.hash);

            let url = format!("{}/{}/{}", MOJANG_RESOURCES_BASE_URL, sub_dir, obj.hash);

            tasks.push(DownloadTask {
                url,
                dest: dest_path,
                size: Some(obj.size),
                checksum: Some(Checksum::Sha1(obj.hash)),
                is_executable: false,
                description: Some(name),
            });
        }

        if !tasks.is_empty() {
            log::info!("Checking and downloading {} asset objects...", tasks.len());
            if let Err(e) = self
                .engine
                .download_all(window, tasks, "Downloading Game Assets")
                .await
            {
                log::warn!("Non-fatal: Some asset objects failed to download: {}", e);
            }
        }

        Ok(())
    }

    /// Ensures the asset index file exists and contains valid objects, downloading from `url` when needed.
    pub async fn ensure_index_file_on_disk(
        assets_dir: &Path,
        resolved_index_id: &str,
        manifest_index_id: Option<&str>,
        url: Option<&str>,
    ) {
        let indexes_dir = assets_dir.join("indexes");
        if let Err(e) = fs::create_dir_all(&indexes_dir).await {
            log::warn!(
                "Failed to create asset indexes dir {:?}: {}",
                indexes_dir,
                e
            );
            return;
        }
        let index_path = indexes_dir.join(format!("{}.json", resolved_index_id));
        let has_url = url.map(str::trim).is_some_and(|u| !u.is_empty());

        let is_corrupted_or_missing = match fs::read_to_string(&index_path).await {
            Ok(content) if !content.trim().is_empty() => {
                match serde_json::from_str::<serde_json::Value>(&content) {
                    Ok(val) if has_url => val
                        .get("objects")
                        .and_then(|o| o.as_object())
                        .map_or(true, |o| o.is_empty()),
                    Ok(_) => false,
                    Err(_) => true,
                }
            }
            _ => true,
        };

        if !is_corrupted_or_missing {
            return;
        }

        let mut downloaded = false;
        if let Some(trimmed_url) = url.map(str::trim).filter(|u| !u.is_empty()) {
            let engine = DownloadEngine::new(4);
            let task = DownloadTask {
                url: trimmed_url.to_string(),
                dest: index_path.clone(),
                size: None,
                checksum: None,
                is_executable: false,
                description: Some(format!("Asset Index {}", resolved_index_id)),
            };
            if engine.download_single(&task).await.is_ok() {
                if let Ok(text) = fs::read_to_string(&index_path).await {
                    if !text.trim().is_empty()
                        && serde_json::from_str::<serde_json::Value>(&text).is_ok()
                    {
                        downloaded = true;
                        if let Some(manifest_id) = manifest_index_id {
                            let manifest_index_path =
                                indexes_dir.join(format!("{}.json", manifest_id));
                            if manifest_index_path != index_path && !manifest_index_path.exists() {
                                let _ = fs::write(&manifest_index_path, &text).await;
                            }
                        }
                    }
                }
            }
        }

        if !downloaded
            && fs::read_to_string(&index_path)
                .await
                .map(|s| serde_json::from_str::<serde_json::Value>(&s).is_err())
                .unwrap_or(true)
        {
            if let Err(e) = fs::write(&index_path, r#"{"objects":{}}"#).await {
                log::warn!(
                    "Failed to write fallback asset index {:?}: {}",
                    index_path,
                    e
                );
            }
        }
    }
}
