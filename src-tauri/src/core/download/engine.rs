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
use tokio::io::{AsyncReadExt, AsyncWriteExt};

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
    auth_token: Option<String>,
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
            auth_token: None,
        }
    }

    pub fn with_auth_token(mut self, auth_token: Option<String>) -> Self {
        self.auth_token = auth_token;
        self
    }

    /// Verifies if a local file exists and matches size and/or checksum.
    pub async fn is_file_valid(
        path: &Path,
        expected_size: Option<u64>,
        expected_checksum: &Option<Checksum>,
    ) -> bool {
        let metadata = match fs::metadata(path).await {
            Ok(m) => m,
            Err(_) => return false,
        };

        if !metadata.is_file() {
            return false;
        }

        if let Some(size) = expected_size {
            if metadata.len() != size {
                return false;
            }
        }

        if let Some(checksum) = expected_checksum {
            let mut file = match fs::File::open(path).await {
                Ok(file) => file,
                Err(_) => return false,
            };
            // Modpacks contain large archives; bounded buffers prevent each
            // concurrent verification from holding a whole archive in memory.
            let mut buffer = [0_u8; 64 * 1024];
            let mut sha1_hasher = sha1::Sha1::new();
            let mut md5_context = md5::Context::new();
            loop {
                let bytes_read = match file.read(&mut buffer).await {
                    Ok(0) => break,
                    Ok(bytes_read) => bytes_read,
                    Err(_) => return false,
                };
                match checksum {
                    Checksum::Sha1(_) => sha1_hasher.update(&buffer[..bytes_read]),
                    Checksum::Md5(_) => md5_context.consume(&buffer[..bytes_read]),
                }
            }

            match checksum {
                Checksum::Sha1(expected) => {
                    let result = format!("{:x}", sha1_hasher.finalize());
                    if !result.eq_ignore_ascii_case(expected) {
                        return false;
                    }
                }
                Checksum::Md5(expected) => {
                    let hash = format!("{:x}", md5_context.finalize());
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
        let temp_path = task
            .dest
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join(temp_filename);

        let mut attempts = 0;
        let max_attempts = 4;
        let mut last_error = String::new();

        while attempts < max_attempts {
            attempts += 1;

            match self
                .download_to_temp(&task.url, &temp_path, task.size, &task.checksum)
                .await
            {
                Ok(()) => {
                    // Atomic move to destination
                    if let Err(e) = fs::rename(&temp_path, &task.dest).await {
                        // Fallback copy + remove if cross-filesystem rename fails
                        if let Err(copy_err) = fs::copy(&temp_path, &task.dest).await {
                            let _ = fs::remove_file(&temp_path).await;
                            return Err(format!(
                                "Failed to move {:?} to {:?}: {} / {}",
                                temp_path, task.dest, e, copy_err
                            ));
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
                        tokio::time::sleep(Duration::from_millis(150 * (2_u64.pow(attempts))))
                            .await;
                    }
                }
            }
        }

        Err(format!(
            "Failed to download {} after {} attempts: {}",
            task.url, max_attempts, last_error
        ))
    }

    async fn download_to_temp(
        &self,
        url: &str,
        temp_path: &Path,
        expected_size: Option<u64>,
        expected_checksum: &Option<Checksum>,
    ) -> Result<(), String> {
        let mut request = self.client.get(url);
        if let Some(token) = &self.auth_token {
            request = request.bearer_auth(token);
        }
        let mut response = request
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
        let mut received_size = 0_u64;

        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|e| format!("Error receiving chunk from {}: {}", url, e))?
        {
            received_size += chunk.len() as u64;
            // Validate the manifest size even when no checksum is available. An
            // HTTP 200 response can still contain a truncated or incorrect file.
            if expected_size.is_some_and(|size| received_size > size) {
                return Err(format!("Download exceeds expected size for {}", url));
            }
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

        if let Some(size) = expected_size {
            if received_size != size {
                return Err(format!(
                    "Size mismatch for {}: expected {}, got {}",
                    url, size, received_size
                ));
            }
        }

        if let Some(checksum) = expected_checksum {
            match checksum {
                Checksum::Sha1(expected) => {
                    let calculated = format!("{:x}", sha1_hasher.finalize());
                    if !calculated.eq_ignore_ascii_case(expected) {
                        return Err(format!(
                            "SHA-1 mismatch for {}: expected {}, got {}",
                            url, expected, calculated
                        ));
                    }
                }
                Checksum::Md5(expected) => {
                    let calculated = format!("{:x}", md5_context.finalize());
                    if !calculated.eq_ignore_ascii_case(expected) {
                        return Err(format!(
                            "MD5 mismatch for {}: expected {}, got {}",
                            url, expected, calculated
                        ));
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

#[cfg(test)]
mod tests {
    use super::{Checksum, DownloadEngine, DownloadTask};
    use sha1::Digest;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    #[tokio::test]
    async fn directories_are_not_valid_downloaded_files() {
        assert!(!DownloadEngine::is_file_valid(&std::env::temp_dir(), None, &None).await);
    }

    #[tokio::test]
    async fn verifies_checksums_across_multiple_buffers() {
        let path = std::env::temp_dir().join(format!("launched-checksum-{}", uuid::Uuid::new_v4()));
        let content = vec![b'x'; 150_000];
        tokio::fs::write(&path, &content).await.unwrap();
        for checksum in [
            Checksum::Sha1(format!("{:X}", sha1::Sha1::digest(&content))),
            Checksum::Md5(format!("{:X}", md5::compute(&content))),
        ] {
            assert!(
                DownloadEngine::is_file_valid(&path, Some(content.len() as u64), &Some(checksum))
                    .await
            );
        }
        for checksum in [
            Checksum::Sha1("invalid".into()),
            Checksum::Md5("invalid".into()),
        ] {
            assert!(!DownloadEngine::is_file_valid(&path, None, &Some(checksum)).await);
        }
        tokio::fs::remove_file(path).await.unwrap();
    }

    #[tokio::test]
    async fn rejects_incorrect_sizes_without_replacing_existing_file() {
        let root = std::env::temp_dir().join(format!("launched-download-{}", uuid::Uuid::new_v4()));
        tokio::fs::create_dir_all(&root).await.unwrap();
        let destination = root.join("client.jar");
        tokio::fs::write(&destination, b"previous-file")
            .await
            .unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/client.jar", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            // Each failed download is retried four times. Both size mismatches
            // must preserve the previous file and clean up their temporary file.
            for _ in 0..8 {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut request = [0; 2048];
                assert!(stream.read(&mut request).await.unwrap() > 0);
                stream
                    .write_all(
                        b"HTTP/1.1 200 OK\r\nContent-Length: 4\r\nConnection: close\r\n\r\ndata",
                    )
                    .await
                    .unwrap();
            }
        });
        let engine = DownloadEngine::new(4);
        for expected_size in [3, 5] {
            let task = DownloadTask {
                url: url.clone(),
                dest: destination.clone(),
                size: Some(expected_size),
                checksum: None,
                is_executable: false,
                description: None,
            };
            assert!(engine.download_single(&task).await.is_err());
            assert_eq!(
                tokio::fs::read(&destination).await.unwrap(),
                b"previous-file"
            );
            assert_eq!(std::fs::read_dir(&root).unwrap().count(), 1);
        }
        server.await.unwrap();
        tokio::fs::remove_dir_all(root).await.unwrap();
    }
}
