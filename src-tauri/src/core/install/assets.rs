use crate::core::download::{Checksum, DownloadEngine, DownloadTask};
use crate::core::meta::models::{AssetIndexManifest, AssetIndexReference};
use std::path::PathBuf;
use tokio::fs;

const MOJANG_RESOURCES_BASE_URL: &str = "https://resources.download.minecraft.net";

pub struct AssetManager {
    engine: DownloadEngine,
    mc_path: PathBuf,
}

impl AssetManager {
    pub fn new(mc_path: PathBuf) -> Self {
        Self {
            engine: DownloadEngine::new(32),
            mc_path,
        }
    }

    /// Ensures the complete asset index and all asset objects are downloaded.
    pub async fn ensure_assets(
        &self,
        window: Option<&tauri::Window>,
        asset_index_ref: &AssetIndexReference,
    ) -> Result<(), String> {
        let index_dir = self.mc_path.join("assets").join("indexes");
        let index_file = index_dir.join(format!("{}.json", asset_index_ref.id));

        fs::create_dir_all(&index_dir)
            .await
            .map_err(|e| format!("Failed to create asset indexes directory: {}", e))?;

        // 1. Download asset index JSON if not present
        if !index_file.exists() {
            if let Some(index_url) = &asset_index_ref.url {
                log::info!("Downloading asset index for {} from {}...", asset_index_ref.id, index_url);
                let task = DownloadTask {
                    url: index_url.clone(),
                    dest: index_file.clone(),
                    size: asset_index_ref.size,
                    checksum: asset_index_ref.sha1.clone().map(Checksum::Sha1),
                    is_executable: false,
                    description: Some(format!("Asset Index {}", asset_index_ref.id)),
                };
                self.engine.download_single(&task).await?;
            }
        }

        if !index_file.exists() {
            log::warn!("Asset index JSON missing at {:?}, skipping detailed asset download", index_file);
            return Ok(());
        }

        // 2. Parse asset index JSON
        let content = fs::read_to_string(&index_file)
            .await
            .map_err(|e| format!("Failed to read asset index {:?}: {}", index_file, e))?;

        let manifest: AssetIndexManifest = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse asset index {:?}: {}", index_file, e))?;

        let objects_dir = self.mc_path.join("assets").join("objects");

        // 3. Prepare asset download tasks
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

        log::info!("Checking and downloading {} asset objects...", tasks.len());
        self.engine
            .download_all(window, tasks, "Downloading Game Assets")
            .await?;

        Ok(())
    }
}
