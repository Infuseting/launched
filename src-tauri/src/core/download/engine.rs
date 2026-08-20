use futures::stream::{self, StreamExt};
use reqwest::Client;
use serde::Serialize;
use sha1::Digest;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::Emitter;
use tokio::fs;
use tokio::io::AsyncWriteExt;

#[derive(Debug, Clone)]
pub enum Checksum {
    Sha1(String),
    Md5(String),
}

#[derive(Debug, Clone)]
pub struct DownloadTask {
    pub url: String,
    pub dest: PathBuf,
    pub size: Option<u64>,
    pub checksum: Option<Checksum>,
    pub is_executable: bool,
    pub description: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct DownloadProgress {
    pub current_file: String,
    pub files_done: usize,
    pub total_files: usize,
    pub percentage: f64,
}

pub struct DownloadEngine {
    client: Client,
    concurrency: usize,
}

impl Default for DownloadEngine {
    fn default() -> Self {
        Self::new(24)
    }
}

impl DownloadEngine {
    pub fn new(concurrency: usize) -> Self {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(15))
            .pool_max_idle_per_host(32)
            .pool_idle_timeout(Duration::from_secs(60))
            .build()
            .unwrap_or_else(|_| Client::new());

        Self {
            client,
            concurrency: concurrency.clamp(4, 64),
        }
    }

    /// Verifies if a local file exists and matches size and/or checksum.
    pub async fn is_file_valid(path: &Path, expected_size: Option<u64>, expected_checksum: &Option<Checksum>) -> bool {
        if !path.exists() {
            return false;
        }

        let metadata = match fs::metadata(path).await {
            Ok(m) => m,
            Err(_) => return false,
        };

        if let Some(size) = expected_size {
            if metadata.len() != size {
                return false;
            }
        }

        if let Some(checksum) = expected_checksum {
            let data = match fs::read(path).await {
                Ok(d) => d,
                Err(_) => return false,
            };

            match checksum {
                Checksum::Sha1(expected) => {
                    let mut hasher = sha1::Sha1::new();
                    hasher.update(&data);
                    let result = format!("{:x}", hasher.finalize());
                    if !result.eq_ignore_ascii_case(expected) {
                        return false;
                    }
                }
                Checksum::Md5(expected) => {
                    let hash = format!("{:x}", md5::compute(&data));
                    if !hash.eq_ignore_ascii_case(expected) {
                        return false;
                    }
                }
            }
        }

        true
    }

    /// Downloads a single file with retry, validation and atomic rename.
    pub async fn download_single(&self, task: &DownloadTask) -> Result<bool, String> {
        if Self::is_file_valid(&task.dest, task.size, &task.checksum).await {
            return Ok(false); // Already valid
        }

        if let Some(parent) = task.dest.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("Failed to create parent directory {:?}: {}", parent, e))?;
        }

        let temp_filename = format!(
            ".tmp_{}_{}",
            uuid::Uuid::new_v4().simple(),
            task.dest.file_name().unwrap_or_default().to_string_lossy()
        );
        let temp_path = task.dest.parent().unwrap_or_else(|| Path::new(".")).join(temp_filename);

        let mut attempts = 0;
        let max_attempts = 4;
        let mut last_error = String::new();

        while attempts < max_attempts {
            attempts += 1;

            match self.download_to_temp(&task.url, &temp_path, &task.checksum).await {
                Ok(()) => {
                    // Atomic move to destination
                    if let Err(e) = fs::rename(&temp_path, &task.dest).await {
                        // Fallback copy + remove if cross-filesystem rename fails
                        if let Err(copy_err) = fs::copy(&temp_path, &task.dest).await {
                            let _ = fs::remove_file(&temp_path).await;
                            return Err(format!("Failed to move {:?} to {:?}: {} / {}", temp_path, task.dest, e, copy_err));
                        }
                        let _ = fs::remove_file(&temp_path).await;
                    }

                    #[cfg(unix)]
                    if task.is_executable {
                        use std::os::unix::fs::PermissionsExt;
                        if let Ok(meta) = fs::metadata(&task.dest).await {
                            let mut perms = meta.permissions();
                            perms.set_mode(0o755);
                            let _ = fs::set_permissions(&task.dest, perms).await;
                        }
                    }

                    return Ok(true);
                }
                Err(e) => {
                    let _ = fs::remove_file(&temp_path).await;
                    last_error = e;
                    if attempts < max_attempts {
                        tokio::time::sleep(Duration::from_millis(150 * (2_u64.pow(attempts)))).await;
                    }
                }
            }
        }

        Err(format!("Failed to download {} after {} attempts: {}", task.url, max_attempts, last_error))
    }

    async fn download_to_temp(&self, url: &str, temp_path: &Path, expected_checksum: &Option<Checksum>) -> Result<(), String> {
        let mut response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("HTTP request error for {}: {}", url, e))?;

        if !response.status().is_success() {
            return Err(format!("HTTP {} for {}", response.status(), url));
        }

        let mut file = fs::File::create(temp_path)
            .await
            .map_err(|e| format!("Failed to create temporary file {:?}: {}", temp_path, e))?;

        let mut sha1_hasher = sha1::Sha1::new();
        let mut md5_context = md5::Context::new();

        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|e| format!("Error receiving chunk from {}: {}", url, e))?
        {
            if let Some(Checksum::Sha1(_)) = expected_checksum {
                sha1_hasher.update(&chunk);
            } else if let Some(Checksum::Md5(_)) = expected_checksum {
                md5_context.consume(&chunk);
            }

            file.write_all(&chunk)
                .await
                .map_err(|e| format!("Error writing chunk to {:?}: {}", temp_path, e))?;
        }

        file.flush()
            .await
            .map_err(|e| format!("Error flushing file {:?}: {}", temp_path, e))?;
        drop(file);

        if let Some(checksum) = expected_checksum {
            match checksum {
                Checksum::Sha1(expected) => {
                    let calculated = format!("{:x}", sha1_hasher.finalize());
                    if !calculated.eq_ignore_ascii_case(expected) {
                        return Err(format!("SHA-1 mismatch for {}: expected {}, got {}", url, expected, calculated));
                    }
                }
                Checksum::Md5(expected) => {
                    let calculated = format!("{:x}", md5_context.finalize());
                    if !calculated.eq_ignore_ascii_case(expected) {
                        return Err(format!("MD5 mismatch for {}: expected {}, got {}", url, expected, calculated));
                    }
                }
            }
        }

        Ok(())
    }

    /// Downloads a batch of tasks concurrently with a worker semaphore and progress emission.
    pub async fn download_all(
        &self,
        window: Option<&tauri::Window>,
        tasks: Vec<DownloadTask>,
        stage_name: &str,
    ) -> Result<usize, String> {
        let total = tasks.len();
        if total == 0 {
            if let Some(win) = window {
                let _ = win.emit(
                    "sync-progress",
                    DownloadProgress {
                        current_file: format!("{} complete", stage_name),
                        files_done: 0,
                        total_files: 0,
                        percentage: 100.0,
                    },
                );
            }
            return Ok(0);
        }

        let done_counter = Arc::new(AtomicUsize::new(0));
        let engine = Arc::new(self);
        let win_opt = window.cloned();
        let stage_str = stage_name.to_string();

        let results: Vec<Result<bool, String>> = stream::iter(tasks)
            .map(|task| {
                let engine = engine.clone();
                let done = done_counter.clone();
                let win = win_opt.clone();
                let stage = stage_str.clone();

                async move {
                    let res = engine.download_single(&task).await;
                    let finished = done.fetch_add(1, Ordering::SeqCst) + 1;

                    if let Some(w) = &win {
                        let desc = task.description.clone().unwrap_or_else(|| {
                            task.dest
                                .file_name()
                                .unwrap_or_default()
                                .to_string_lossy()
                                .to_string()
                        });
                        let pct = (finished as f64 / total as f64) * 100.0;
                        let _ = w.emit(
                            "sync-progress",
                            DownloadProgress {
                                current_file: format!("{}: {}", stage, desc),
                                files_done: finished,
                                total_files: total,
                                percentage: pct,
                            },
                        );
                    }

                    res
                }
            })
            .buffer_unordered(self.concurrency)
            .collect()
            .await;

        let mut downloaded_count = 0;
        for res in results {
            match res {
                Ok(newly_downloaded) => {
                    if newly_downloaded {
                        downloaded_count += 1;
                    }
                }
                Err(err) => return Err(err),
            }
        }

        Ok(downloaded_count)
    }

    /// Fetches a JSON object from a URL.
    pub async fn fetch_json<T: serde::de::DeserializeOwned>(&self, url: &str) -> Result<T, String> {
        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch {}: {}", url, e))?;

        if !response.status().is_success() {
            return Err(format!("HTTP {} for {}", response.status(), url));
        }

        response
            .json::<T>()
            .await
            .map_err(|e| format!("Failed to parse JSON from {}: {}", url, e))
    }

    /// Fetches raw text from a URL.
    pub async fn fetch_text(&self, url: &str) -> Result<String, String> {
        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch {}: {}", url, e))?;

        if !response.status().is_success() {
            return Err(format!("HTTP {} for {}", response.status(), url));
        }

        response
            .text()
            .await
            .map_err(|e| format!("Failed to read text from {}: {}", url, e))
    }
}
