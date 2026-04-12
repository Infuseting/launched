use std::path::{Path, PathBuf};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct SyncFile {
    pub path: String,
    pub size: u64,
    pub md5: String,
}

/**
 * Service for synchronizing session files.
 */
pub struct SyncService;

impl SyncService {
    /**
     * Synchronizes a directory based on server manifest.
     */
    pub async fn sync(&self, _base_dir: &Path, _manifest_url: &str) -> Result<(), String> {
        // Fetch manifest, compare MD5s, download missing/changed, delete extra.
        Ok(())
    }
}
