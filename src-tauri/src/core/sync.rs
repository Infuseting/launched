use crate::core::download::{Checksum, DownloadEngine, DownloadTask};
pub use crate::core::download::DownloadProgress as SyncProgress;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::Emitter;

#[derive(Debug, Deserialize, Serialize)]
pub struct SyncFile {
    pub name: String,
    pub size: String,
    pub md5: String,
}

/**
 * Service for synchronizing session files.
 */
pub struct SyncService;

impl SyncService {
    /**
     * Fetches manifest from the remote URL.
     */
    pub async fn fetch_manifest(&self, app: &tauri::AppHandle, url: &str) -> Result<Vec<SyncFile>, String> {
        crate::auth::discord::site_get(app, url).await?
            .json::<Vec<SyncFile>>()
            .await
            .map_err(|e| e.to_string())
    }

    /**
     * Synchronizes directories based on server manifest.
     */
    pub async fn sync(
        &self,
        app: &tauri::AppHandle,
        window: &tauri::Window,
        base_dir: &Path,
        manifest_url: &str,
        sync_dirs: &str,
    ) -> Result<(), String> {
        let manifest = self.fetch_manifest(app, manifest_url).await?;
        let sync_dir_list: Vec<&str> = sync_dirs.split(',').collect();

        // 1. Cleanup: Scan each sync_dir and delete files not in manifest
        for dir_name in &sync_dir_list {
            let local_path = base_dir.join(dir_name);
            if local_path.exists() {
                self.cleanup_local_files(&local_path, &manifest, base_dir)
                    .await?;
            }
        }

        // 2. Base download url
        let base_download_url = if manifest_url.ends_with(".json") || manifest_url.ends_with('/') {
            manifest_url
                .rsplit_once('/')
                .map(|(base, _)| base)
                .unwrap_or(manifest_url)
        } else {
            manifest_url
        };

        // 3. Prepare download tasks for files needing update
        let mut tasks = Vec::new();
        for sync_file in manifest {
            let normalized_name = sync_file.name.replace('\\', "/");
            let is_dir = normalized_name.ends_with('/') || sync_file.size == "0";
            let local_file_path = base_dir.join(&normalized_name);

            if is_dir {
                tokio::fs::create_dir_all(&local_file_path)
                    .await
                    .map_err(|e| e.to_string())?;
                continue;
            }

            let expected_size = sync_file.size.parse::<u64>().ok();
            let checksum = if !sync_file.md5.is_empty() {
                Some(Checksum::Md5(sync_file.md5.clone()))
            } else {
                None
            };

            if !DownloadEngine::is_file_valid(&local_file_path, expected_size, &checksum).await {
                let file_url = format!("{}/{}", base_download_url, normalized_name);
                tasks.push(DownloadTask {
                    url: file_url,
                    dest: local_file_path,
                    size: expected_size,
                    checksum,
                    is_executable: false,
                    description: Some(normalized_name),
                });
            }
        }

        if tasks.is_empty() {
            let _ = window.emit(
                "sync-progress",
                SyncProgress {
                    current_file: "Tous les fichiers sont à jour".to_string(),
                    files_done: 0,
                    total_files: 0,
                    percentage: 100.0,
                },
            );
            return Ok(());
        }

        let auth_token = crate::auth::discord::current_auth_token(app)?;
        let engine = DownloadEngine::new(16).with_auth_token(auth_token);
        engine.download_all(Some(window), tasks, "Synchronisation").await?;

        Ok(())
    }

    /**
     * Recursively cleans up local files that are not in the manifest.
     */
    async fn cleanup_local_files(
        &self,
        current_path: &Path,
        manifest: &[SyncFile],
        base_dir: &Path,
    ) -> Result<(), String> {
        let mut entries = tokio::fs::read_dir(current_path)
            .await
            .map_err(|e| e.to_string())?;

        while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
            let path = entry.path();
            let relative_path = path.strip_prefix(base_dir).map_err(|e| e.to_string())?;
            let mut relative_path_str = relative_path.to_string_lossy().replace('\\', "/");

            if path.is_dir() {
                // Ensure directory path ends with / for comparison
                if !relative_path_str.ends_with('/') {
                    relative_path_str.push('/');
                }

                // Recurse into directory
                Box::pin(self.cleanup_local_files(&path, manifest, base_dir)).await?;

                // Remove directory if empty AND not in manifest
                let mut sub_entries = tokio::fs::read_dir(&path)
                    .await
                    .map_err(|e| e.to_string())?;
                if sub_entries
                    .next_entry()
                    .await
                    .map_err(|e| e.to_string())?
                    .is_none()
                {
                    let in_manifest = manifest.iter().any(|f| {
                        let f_name = f.name.replace('\\', "/");
                        f_name == relative_path_str
                    });
                    if !in_manifest {
                        tokio::fs::remove_dir(&path)
                            .await
                            .map_err(|e| e.to_string())?;
                    }
                }
            } else {
                let file_name = path.file_name().unwrap().to_string_lossy();

                let in_manifest = manifest.iter().any(|f| {
                    let f_name = f.name.replace('\\', "/");
                    f_name == relative_path_str
                });

                if !in_manifest {
                    // Ignore files starting with '!'
                    if !file_name.starts_with('!') {
                        tokio::fs::remove_file(path)
                            .await
                            .map_err(|e| e.to_string())?;
                    }
                }
            }
        }
        Ok(())
    }
}
