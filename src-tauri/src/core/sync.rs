pub use crate::core::download::DownloadProgress as SyncProgress;
use crate::core::download::{Checksum, DownloadEngine, DownloadTask};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use tauri::{Emitter, Manager};

#[derive(Debug, Default, Deserialize, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SyncFileType {
    #[default]
    Mandatory,
    Optional,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct SyncFile {
    pub name: String,
    pub size: String,
    pub md5: String,
    #[serde(rename = "type", default)]
    pub file_type: SyncFileType,
}

pub(crate) fn relative_path_key(path: &str) -> String {
    let normalized = path.replace('\\', "/");
    if cfg!(windows) {
        normalized.to_lowercase()
    } else {
        normalized
    }
}

impl SyncFile {
    /**
     * Returns destination relative path on the client by stripping "mandatory/" or "optional/" prefix.
     */
    pub fn destination_path(&self) -> String {
        let normalized = self.name.replace('\\', "/");
        let stripped = if let Some(s) = normalized.strip_prefix("mandatory/") {
            s
        } else if let Some(s) = normalized.strip_prefix("optional/") {
            s
        } else {
            &normalized
        };
        stripped.to_string()
    }
}

/// Validate portable relative paths, including Windows drive paths and alternate streams.
pub(crate) fn validate_relative_path(path: &str) -> Result<(), String> {
    let normalized = path.replace('\\', "/");
    let clean = normalized.strip_suffix('/').unwrap_or(&normalized);
    if clean.is_empty()
        || clean.split('/').any(|part| {
            part.is_empty()
                || part == "."
                || part == ".."
                || part.ends_with(['.', ' '])
                || part
                    .chars()
                    .any(|c| c.is_control() || "<>:\"|?*".contains(c))
                || matches!(
                    part.split('.')
                        .next()
                        .unwrap_or("")
                        .to_ascii_uppercase()
                        .as_str(),
                    "CON"
                        | "PRN"
                        | "AUX"
                        | "NUL"
                        | "COM1"
                        | "COM2"
                        | "COM3"
                        | "COM4"
                        | "COM5"
                        | "COM6"
                        | "COM7"
                        | "COM8"
                        | "COM9"
                        | "LPT1"
                        | "LPT2"
                        | "LPT3"
                        | "LPT4"
                        | "LPT5"
                        | "LPT6"
                        | "LPT7"
                        | "LPT8"
                        | "LPT9"
                )
        })
    {
        return Err(format!("Chemin de synchronisation invalide : {path}"));
    }
    Ok(())
}

/// Reject links in existing ancestors before reading, renaming or deleting files.
pub(crate) async fn local_path(base_dir: &Path, relative: &str) -> Result<PathBuf, String> {
    validate_relative_path(relative)?;
    let normalized = relative.replace('\\', "/");
    let target = base_dir.join(normalized.trim_end_matches('/'));
    for ancestor in target.ancestors().collect::<Vec<_>>().into_iter().rev() {
        match tokio::fs::symlink_metadata(ancestor).await {
            Ok(meta) if meta.file_type().is_symlink() => {
                return Err(format!("Lien symbolique interdit : {}", ancestor.display()));
            }
            // A file ancestor is a type conflict, staged separately by sync.
            // Its descendants cannot contain links until that conflict is resolved.
            Ok(meta) if meta.is_file() => break,
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(target)
}

pub(crate) fn validate_manifest(manifest: &[SyncFile]) -> Result<(), String> {
    let mut files = HashSet::new();
    let mut directories = HashSet::new();
    for file in manifest {
        validate_relative_path(&file.name)?;
        let dest = file.destination_path();
        if dest.is_empty() {
            continue;
        } // mandatory/ and optional/ roots
        if crate::core::optional_files::is_launcher_metadata(&dest) {
            return Err(format!("Chemin réservé au launcher : {dest}"));
        }
        validate_relative_path(&dest)?;
        let key = dest.trim_end_matches('/').to_lowercase();
        if dest.ends_with('/') {
            directories.insert(key.clone());
        } else if !files.insert(key.clone()) {
            return Err(format!(
                "Plusieurs fichiers ciblent le même chemin : {dest}"
            ));
        }
        let mut parent = Path::new(&key).parent();
        while let Some(path) = parent.filter(|p| !p.as_os_str().is_empty()) {
            directories.insert(path.to_string_lossy().replace('\\', "/"));
            parent = path.parent();
        }
    }
    if let Some(conflict) = files.intersection(&directories).next() {
        return Err(format!("Un fichier remplace un dossier : {conflict}"));
    }
    for path in &files {
        if files.contains(&format!("{path}.disabled"))
            || directories.contains(&format!("{path}.disabled"))
        {
            return Err(format!(
                "Chemin réservé à la désactivation : {path}.disabled"
            ));
        }
    }
    Ok(())
}

pub(crate) fn download_url(manifest_url: &str, source: &str) -> Result<String, String> {
    let mut url = reqwest::Url::parse(manifest_url).map_err(|e| e.to_string())?;
    url.set_query(None);
    url.set_fragment(None);
    let normalized = source.replace('\\', "/");
    let json_manifest = url.path().ends_with(".json");
    let mut segments = url
        .path_segments_mut()
        .map_err(|_| "URL de synchronisation invalide")?;
    segments.pop_if_empty();
    if json_manifest {
        segments.pop();
    }
    segments.extend(normalized.split('/'));
    drop(segments);
    Ok(url.to_string())
}

/**
 * Service for synchronizing session files.
 */
pub struct SyncService;

impl SyncService {
    /**
     * Fetches manifest from the remote URL.
     */
    pub async fn fetch_manifest(
        &self,
        app: &tauri::AppHandle,
        url: &str,
    ) -> Result<Vec<SyncFile>, String> {
        let manifest = crate::auth::discord::site_get(app, url)
            .await?
            .json::<Vec<SyncFile>>()
            .await
            .map_err(|e| e.to_string())?;
        validate_manifest(&manifest)?;
        Ok(manifest)
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
        enabled_optional_files: Option<&[String]>,
    ) -> Result<(), String> {
        log::info!(
            "SyncService::sync starting (manifest_url={}, base_dir={}, sync_dirs={})",
            manifest_url,
            base_dir.display(),
            sync_dirs
        );
        let manifest = self.fetch_manifest(app, manifest_url).await.map_err(|e| {
            log::error!(
                "Failed to fetch/validate manifest from {}: {}",
                manifest_url,
                e
            );
            e
        })?;
        log::info!("Fetched sync manifest with {} entries", manifest.len());
        let sync_dir_list: Vec<&str> = sync_dirs
            .split(',')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();

        // Validate every path before any local mutation.
        for file in &manifest {
            let dest = file.destination_path();
            if !dest.is_empty() {
                local_path(base_dir, &dest).await?;
            }
        }
        for dir_name in &sync_dir_list {
            if crate::core::optional_files::is_launcher_metadata(dir_name) {
                return Err("Dossier de synchronisation réservé au launcher".into());
            }
            local_path(base_dir, dir_name).await?;
        }

        let managed = crate::core::optional_files::OptionalFilesManager::managed_files(
            base_dir,
            enabled_optional_files.unwrap_or(&[]),
        )
        .await?;
        let mut conflicts = crate::core::sync_conflicts::SyncConflicts::prepare(
            base_dir,
            &manifest,
            &sync_dir_list,
            &managed,
        )
        .await?;
        let result = self
            .sync_manifest(
                window,
                base_dir,
                manifest_url,
                &sync_dir_list,
                enabled_optional_files,
                &manifest,
            )
            .await;
        match result {
            Ok(()) => conflicts.commit().await,
            Err(error) => match conflicts.rollback().await {
                Ok(()) => Err(error),
                Err(restore) => Err(format!("{error}. Restauration incomplète : {restore}")),
            },
        }
    }

    async fn sync_manifest(
        &self,
        window: &tauri::Window,
        base_dir: &Path,
        manifest_url: &str,
        sync_dir_list: &[&str],
        enabled_optional_files: Option<&[String]>,
        manifest: &[SyncFile],
    ) -> Result<(), String> {
        crate::core::optional_files::OptionalFilesManager::record_manifest(
            base_dir,
            manifest,
            enabled_optional_files.unwrap_or(&[]),
        )
        .await?;

        let enabled_set = crate::core::optional_files::OptionalFilesManager::resolve_selection(
            manifest,
            enabled_optional_files,
        );

        // 4. Prepare download tasks for files needing update
        let mut tasks = Vec::new();
        for sync_file in manifest {
            let dest_path = sync_file.destination_path();
            if dest_path.is_empty() || dest_path == "/" {
                continue; // Skip root folder entries (e.g. "mandatory/", "optional/")
            }

            let normalized_dest = dest_path.replace('\\', "/");
            let is_dir = normalized_dest.ends_with('/');
            let local_file_path = local_path(base_dir, &normalized_dest).await?;

            if is_dir {
                tokio::fs::create_dir_all(&local_file_path)
                    .await
                    .map_err(|e| e.to_string())?;
                continue;
            }

            let is_optional = sync_file.file_type == SyncFileType::Optional;
            let is_enabled = enabled_set.contains(&normalized_dest);

            if is_optional {
                crate::core::optional_files::OptionalFilesManager::toggle_file(
                    base_dir,
                    &normalized_dest,
                    is_enabled,
                )
                .await?;

                if !is_enabled {
                    // Do not download disabled optional files
                    continue;
                }
            }

            let expected_size = sync_file.size.parse::<u64>().ok();
            let checksum = if !sync_file.md5.is_empty() {
                Some(Checksum::Md5(sync_file.md5.clone()))
            } else {
                None
            };

            if !DownloadEngine::is_file_valid(&local_file_path, expected_size, &checksum).await {
                let file_url = download_url(manifest_url, &sync_file.name)?;
                tasks.push(DownloadTask {
                    url: file_url,
                    dest: local_file_path,
                    size: expected_size,
                    checksum,
                    is_executable: false,
                    description: Some(normalized_dest),
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
        } else {
            let auth_token = crate::auth::discord::current_auth_token(window.app_handle())?;
            let engine = DownloadEngine::new(16).with_auth_token(auth_token);
            engine
                .download_all(Some(window), tasks, "Synchronisation")
                .await?;
        }

        // Only remove obsolete versions after all replacements downloaded successfully.
        for dir_name in sync_dir_list {
            let path = local_path(base_dir, dir_name).await?;
            if path.exists() {
                self.cleanup_local_files(&path, manifest, base_dir).await?;
            }
        }
        crate::core::optional_files::OptionalFilesManager::cleanup_replaced_files(
            base_dir,
            manifest,
            enabled_optional_files.unwrap_or(&[]),
        )
        .await?;

        Ok(())
    }

    /**
     * Recursively cleans up local files that are not in the manifest.
     */
    pub(crate) async fn cleanup_local_files(
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

            if entry
                .file_type()
                .await
                .map_err(|e| e.to_string())?
                .is_symlink()
            {
                return Err(format!("Lien symbolique interdit : {}", path.display()));
            }
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
                        let mut dest = f.destination_path();
                        if !dest.ends_with('/') {
                            dest.push('/');
                        }
                        relative_path_key(&dest) == relative_path_key(&relative_path_str)
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
                    relative_path_key(&f.destination_path())
                        == relative_path_key(&relative_path_str)
                });

                // Check if file is a valid .disabled version of an optional file in manifest
                let is_valid_disabled_optional =
                    if let Some(base_rel) = relative_path_str.strip_suffix(".disabled") {
                        manifest.iter().any(|f| {
                            f.file_type == SyncFileType::Optional
                                && relative_path_key(&f.destination_path())
                                    == relative_path_key(base_rel)
                        })
                    } else {
                        false
                    };

                if !in_manifest && !is_valid_disabled_optional {
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
