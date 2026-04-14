use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;
use tauri::Emitter;
use tokio::io::AsyncWriteExt;

#[derive(Debug, Deserialize, Serialize)]
pub struct SyncFile {
    pub name: String,
    pub size: String,
    pub md5: String,
}

#[derive(Clone, Serialize)]
pub struct SyncProgress {
    pub current_file: String,
    pub files_done: usize,
    pub total_files: usize,
    pub percentage: f64,
}

/**
 * Service for synchronizing session files.
 */
pub struct SyncService;

impl SyncService {
    /**
     * Calculates MD5 hash of a file.
     */
    fn calculate_md5(&self, path: &Path) -> Result<String, String> {
        let file = File::open(path).map_err(|e| e.to_string())?;
        let mut reader = BufReader::new(file);
        let mut context = md5::Context::new();
        let mut buffer = [0; 8192];

        loop {
            let count = reader.read(&mut buffer).map_err(|e| e.to_string())?;
            if count == 0 {
                break;
            }
            context.consume(&buffer[..count]);
        }

        Ok(format!("{:x}", context.finalize()))
    }

    /**
     * Fetches manifest from the remote URL.
     */
    pub async fn fetch_manifest(&self, url: &str) -> Result<Vec<SyncFile>, String> {
        reqwest::get(url)
            .await
            .map_err(|e| e.to_string())?
            .json::<Vec<SyncFile>>()
            .await
            .map_err(|e| e.to_string())
    }

    /**
     * Synchronizes directories based on server manifest.
     */
    pub async fn sync(
        &self,
        window: &tauri::Window,
        base_dir: &Path,
        manifest_url: &str,
        sync_dirs: &str,
    ) -> Result<(), String> {
        let manifest = self.fetch_manifest(manifest_url).await?;
        let sync_dir_list: Vec<&str> = sync_dirs.split(',').collect();

        // 1. Cleanup: Scan each sync_dir and delete files not in manifest
        for dir_name in &sync_dir_list {
            let local_path = base_dir.join(dir_name);
            if local_path.exists() {
                self.cleanup_local_files(&local_path, &manifest, base_dir)
                    .await?;
            }
        }

        // 2. Download/Update: For each file in manifest, check if needs update
        // We assume files are located at the same base as the manifest URL
        let base_download_url = if manifest_url.ends_with(".json") || manifest_url.ends_with('/') {
            manifest_url
                .rsplit_once('/')
                .map(|(base, _)| base)
                .unwrap_or(manifest_url)
        } else {
            manifest_url
        };

        // Pre-filter manifest to only include files that need action
        let mut files_to_sync = Vec::new();
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

            let mut needs_download = !local_file_path.exists();
            if !needs_download {
                let local_md5 = self.calculate_md5(&local_file_path)?;
                if local_md5 != sync_file.md5 {
                    needs_download = true;
                }
            }

            if needs_download {
                files_to_sync.push((sync_file, local_file_path));
            }
        }

        let total_files = files_to_sync.len();
        let mut files_done = 0;

        if total_files == 0 {
            let _ = window.emit(
                "sync-progress",
                SyncProgress {
                    current_file: "All files up to date".to_string(),
                    files_done: 0,
                    total_files: 0,
                    percentage: 100.0,
                },
            );
            return Ok(());
        }

        for (sync_file, local_file_path) in files_to_sync {
            let normalized_name = sync_file.name.replace('\\', "/");

            // Emit progress event
            files_done += 1;
            let percentage = (files_done as f64 / total_files as f64) * 100.0;
            let _ = window.emit(
                "sync-progress",
                SyncProgress {
                    current_file: normalized_name.clone(),
                    files_done,
                    total_files,
                    percentage,
                },
            );

            // Ensure parent directory exists
            if let Some(parent) = local_file_path.parent() {
                tokio::fs::create_dir_all(parent)
                    .await
                    .map_err(|e| e.to_string())?;
            }

            let file_url = format!("{}/{}", base_download_url, normalized_name);
            self.download_file(&file_url, &local_file_path).await?;
        }

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

    /**
     * Downloads a file from a URL to a destination path.
     */
    async fn download_file(&self, url: &str, dest: &Path) -> Result<(), String> {
        let response = reqwest::get(url).await.map_err(|e| e.to_string())?;
        if !response.status().is_success() {
            return Err(format!(
                "Failed to download file from {}: status {}",
                url,
                response.status()
            ));
        }
        let bytes = response.bytes().await.map_err(|e| e.to_string())?;
        let mut file = tokio::fs::File::create(dest)
            .await
            .map_err(|e| e.to_string())?;
        file.write_all(&bytes).await.map_err(|e| e.to_string())?;
        Ok(())
    }
}
