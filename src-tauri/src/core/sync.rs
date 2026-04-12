use std::path::Path;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{Read, BufReader};
use tokio::io::AsyncWriteExt;

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
     * Calculates MD5 hash of a file.
     */
    fn calculate_md5(&self, path: &Path) -> Result<String, String> {
        let file = File::open(path).map_err(|e| e.to_string())?;
        let mut reader = BufReader::new(file);
        let mut context = md5::Context::new();
        let mut buffer = [0; 8192];
        
        loop {
            let count = reader.read(&mut buffer).map_err(|e| e.to_string())?;
            if count == 0 { break; }
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
    pub async fn sync(&self, base_dir: &Path, manifest_url: &str, sync_dirs: &str) -> Result<(), String> {
        let manifest = self.fetch_manifest(manifest_url).await?;
        let sync_dir_list: Vec<&str> = sync_dirs.split(',').collect();

        // 1. Cleanup: Scan each sync_dir and delete files not in manifest
        for dir_name in &sync_dir_list {
            let local_path = base_dir.join(dir_name);
            if local_path.exists() {
                self.cleanup_local_files(&local_path, &manifest, base_dir).await?;
            }
        }

        // 2. Download/Update: For each file in manifest, check if needs update
        // We assume files are located at the same base as the manifest URL
        let base_download_url = if manifest_url.ends_with(".json") || manifest_url.ends_with('/') {
            manifest_url.rsplit_once('/').map(|(base, _)| base).unwrap_or(manifest_url)
        } else {
            manifest_url
        };

        for sync_file in manifest {
            let local_file_path = base_dir.join(&sync_file.name);
            
            let mut needs_download = !local_file_path.exists();
            if !needs_download {
                let local_md5 = self.calculate_md5(&local_file_path)?;
                if local_md5 != sync_file.md5 {
                    needs_download = true;
                }
            }

            if needs_download {
                // Ensure parent directory exists
                if let Some(parent) = local_file_path.parent() {
                    tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
                }
                
                let file_url = format!("{}/{}", base_download_url, sync_file.name.replace('\\', "/"));
                self.download_file(&file_url, &local_file_path).await?;
            }
        }

        Ok(())
    }

    /**
     * Recursively cleans up local files that are not in the manifest.
     */
    async fn cleanup_local_files(&self, current_path: &Path, manifest: &[SyncFile], base_dir: &Path) -> Result<(), String> {
        let mut entries = tokio::fs::read_dir(current_path).await.map_err(|e| e.to_string())?;
        
        while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
            let path = entry.path();
            if path.is_dir() {
                // Recurse into directory
                Box::pin(self.cleanup_local_files(&path, manifest, base_dir)).await?;
                
                // Remove directory if empty (optional but clean)
                let mut sub_entries = tokio::fs::read_dir(&path).await.map_err(|e| e.to_string())?;
                if sub_entries.next_entry().await.map_err(|e| e.to_string())?.is_none() {
                    tokio::fs::remove_dir(&path).await.map_err(|e| e.to_string())?;
                }
            } else {
                // Check if file is in manifest
                let relative_path = path.strip_prefix(base_dir).map_err(|e| e.to_string())?;
                let relative_path_str = relative_path.to_string_lossy().replace('\\', "/");
                
                let file_name = path.file_name().unwrap().to_string_lossy();
                
                if !manifest.iter().any(|f| f.name.replace('\\', "/") == relative_path_str) {
                    // Ignore files starting with '!'
                    if !file_name.starts_with('!') {
                        tokio::fs::remove_file(path).await.map_err(|e| e.to_string())?;
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
            return Err(format!("Failed to download file from {}: status {}", url, response.status()));
        }
        let bytes = response.bytes().await.map_err(|e| e.to_string())?;
        let mut file = tokio::fs::File::create(dest).await.map_err(|e| e.to_string())?;
        file.write_all(&bytes).await.map_err(|e| e.to_string())?;
        Ok(())
    }
}
