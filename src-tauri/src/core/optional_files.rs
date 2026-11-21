use crate::core::download::{Checksum, DownloadEngine};
use crate::core::session::Session;
use crate::core::settings::SettingsManager;
use crate::core::sync::{
    local_path, relative_path_key, validate_relative_path, SyncFile, SyncFileType, SyncService,
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OptionalFileDto {
    pub dest_path: String,
    pub name: String,
    pub folder: String,
    pub size: String,
    pub md5: String,
    pub is_enabled: bool,
    pub is_downloaded: bool,
    pub has_update: bool,
    pub old_version_path: Option<String>,
}

pub struct OptionalFilesManager;

pub(crate) const MANAGED_FILES_NAME: &str = ".launched-optional-files.json";
pub(crate) const CONFLICTS_DIR_NAME: &str = ".launched-sync-conflicts";

pub(crate) fn is_launcher_metadata(path: &str) -> bool {
    let normalized = path.replace('\\', "/").to_lowercase();
    let first = normalized.split('/').next().unwrap_or("");
    first == MANAGED_FILES_NAME || first == CONFLICTS_DIR_NAME
}

impl OptionalFilesManager {
    /// Keep provenance separately from user preferences, including disabled and
    /// pending replacements. A settings save must not erase this history.
    pub(crate) async fn managed_files(
        base: &Path,
        saved: &[String],
    ) -> Result<HashSet<String>, String> {
        let record = local_path(base, MANAGED_FILES_NAME).await?;
        let mut managed: HashSet<String> = match tokio::fs::read(record).await {
            Ok(bytes) => serde_json::from_slice(&bytes)
                .map_err(|e| format!("Historique des fichiers optionnels illisible : {e}"))?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => HashSet::new(),
            Err(e) => return Err(e.to_string()),
        };
        // Migrate explicit selections made before provenance tracking existed.
        managed.extend(saved.iter().map(|p| p.replace('\\', "/")));
        for path in &managed {
            validate_relative_path(path)?;
            if path.ends_with('/') || is_launcher_metadata(path) {
                return Err("Historique des fichiers optionnels invalide".into());
            }
        }
        Ok(managed)
    }

    pub(crate) async fn store_managed_files(
        base: &Path,
        managed: &HashSet<String>,
    ) -> Result<(), String> {
        let target = local_path(base, MANAGED_FILES_NAME).await?;
        let temporary = local_path(
            base,
            &format!(".launched-optional-{}.tmp", uuid::Uuid::new_v4()),
        )
        .await?;
        let mut paths: Vec<_> = managed.iter().cloned().collect();
        paths.sort();
        let bytes = serde_json::to_vec_pretty(&paths).map_err(|e| e.to_string())?;
        tokio::fs::create_dir_all(base)
            .await
            .map_err(|e| e.to_string())?;
        tokio::fs::write(&temporary, bytes)
            .await
            .map_err(|e| e.to_string())?;
        if let Err(e) = tokio::fs::rename(&temporary, target).await {
            let _ = tokio::fs::remove_file(temporary).await;
            return Err(e.to_string());
        }
        Ok(())
    }

    pub(crate) async fn record_manifest(
        base: &Path,
        manifest: &[SyncFile],
        saved: &[String],
    ) -> Result<(), String> {
        let mut managed = Self::managed_files(base, saved).await?;
        managed.extend(Self::optional_paths(manifest));
        Self::store_managed_files(base, &managed).await
    }
    pub fn extract_folder(dest_path: &str) -> String {
        dest_path
            .replace('\\', "/")
            .rsplit_once('/')
            .map(|(folder, _)| folder.to_string())
            .unwrap_or_default()
    }

    pub fn extract_filename(dest_path: &str) -> String {
        dest_path
            .replace('\\', "/")
            .rsplit('/')
            .next()
            .unwrap_or("")
            .to_string()
    }

    /// Match versioned names only within the same folder and extension.
    pub fn extract_base_name(filename: &str) -> String {
        let clean = filename.strip_suffix(".disabled").unwrap_or(filename);
        let stem = clean
            .rsplit_once('.')
            .map(|(stem, _)| stem)
            .unwrap_or(clean);
        let bytes = stem.as_bytes();
        for i in 0..bytes.len() {
            if (bytes[i] == b'-' || bytes[i] == b'_') && i + 1 < bytes.len() {
                let next = bytes[i + 1];
                if next.is_ascii_digit()
                    || ((next == b'v' || next == b'V')
                        && i + 2 < bytes.len()
                        && bytes[i + 2].is_ascii_digit())
                {
                    return stem[..i].to_lowercase();
                }
            }
        }
        stem.to_lowercase()
    }

    fn same_item(left: &str, right: &str) -> bool {
        let left_name = Self::extract_filename(left);
        let right_name = Self::extract_filename(right);
        Self::extract_folder(left) == Self::extract_folder(right)
            && Path::new(&left_name).extension() == Path::new(&right_name).extension()
            && Self::extract_base_name(&left_name) == Self::extract_base_name(&right_name)
    }

    pub(crate) fn optional_paths(manifest: &[SyncFile]) -> HashSet<String> {
        manifest
            .iter()
            .filter(|f| f.file_type == SyncFileType::Optional)
            .map(SyncFile::destination_path)
            .filter(|p| !p.is_empty() && !p.ends_with('/'))
            .collect()
    }

    /// Preserve selection across versioned filenames, even when the old file is missing.
    pub(crate) fn resolve_selection(
        manifest: &[SyncFile],
        saved: Option<&[String]>,
    ) -> HashSet<String> {
        let optional = Self::optional_paths(manifest);
        let Some(saved) = saved else {
            return optional;
        };
        let all_paths: HashSet<_> = manifest.iter().map(SyncFile::destination_path).collect();
        let mut selected = HashSet::new();
        for old in saved {
            let old = old.replace('\\', "/");
            if let Some(current) = optional
                .iter()
                .find(|path| relative_path_key(path) == relative_path_key(&old))
            {
                selected.insert(current.clone());
            } else if !all_paths.contains(&old) && validate_relative_path(&old).is_ok() {
                let mut candidates = optional.iter().filter(|path| Self::same_item(&old, path));
                if let Some(candidate) = candidates.next() {
                    if candidates.next().is_none() {
                        selected.insert(candidate.clone());
                    }
                }
            }
        }
        selected
    }

    /// Listing is read-only: canceling must never remove mods or settings.
    pub async fn get_optional_files(
        app: &tauri::AppHandle,
        session: &Session,
    ) -> Result<Vec<OptionalFileDto>, String> {
        let manifest = SyncService.fetch_manifest(app, &session.sync_url).await?;
        let settings = SettingsManager::load(app);
        let session_settings = settings
            .sessions
            .get(&session.name)
            .unwrap_or(&settings.default_settings);
        let base_dir = Self::session_dir(app, &session.name).await?;
        Self::inspect_files(
            &base_dir,
            &manifest,
            session_settings.enabled_optional_files.as_deref(),
        )
        .await
    }

    pub(crate) async fn session_dir(
        app: &tauri::AppHandle,
        name: &str,
    ) -> Result<std::path::PathBuf, String> {
        let root = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("sessions");
        crate::core::session::SessionManager::local_directory(&root, name).await
    }

    pub(crate) async fn inspect_files(
        base_dir: &Path,
        manifest: &[SyncFile],
        saved: Option<&[String]>,
    ) -> Result<Vec<OptionalFileDto>, String> {
        let selected = Self::resolve_selection(manifest, saved);
        let managed = Self::managed_files(base_dir, saved.unwrap_or(&[])).await?;
        let all_paths: HashSet<_> = manifest.iter().map(SyncFile::destination_path).collect();
        let optional = Self::optional_paths(manifest);
        let mut results = Vec::new();
        for file in manifest {
            let dest = file.destination_path();
            if !optional.contains(&dest) {
                continue;
            }
            let active = local_path(base_dir, &dest).await?;
            let disabled = local_path(base_dir, &format!("{dest}.disabled")).await?;
            let mut is_downloaded = active.is_file() || disabled.is_file();
            let has_update;
            let mut old_version_path = None;
            if is_downloaded {
                let checksum = (!file.md5.is_empty()).then(|| Checksum::Md5(file.md5.clone()));
                has_update = !DownloadEngine::is_file_valid(
                    if active.is_file() { &active } else { &disabled },
                    file.size.parse().ok(),
                    &checksum,
                )
                .await;
            } else {
                let folder = Self::extract_folder(&dest);
                let folder_dir = if folder.is_empty() {
                    base_dir.to_path_buf()
                } else {
                    local_path(base_dir, &folder).await?
                };
                match tokio::fs::read_dir(&folder_dir).await {
                    Ok(mut entries) => {
                        let mut candidates = Vec::new();
                        while let Some(entry) =
                            entries.next_entry().await.map_err(|e| e.to_string())?
                        {
                            if !entry
                                .file_type()
                                .await
                                .map_err(|e| e.to_string())?
                                .is_file()
                            {
                                continue;
                            }
                            let name = entry.file_name().to_string_lossy().to_string();
                            let clean = name.strip_suffix(".disabled").unwrap_or(&name);
                            let candidate = if folder.is_empty() {
                                clean.to_string()
                            } else {
                                format!("{folder}/{clean}")
                            };
                            if managed.contains(&candidate)
                                && !all_paths.contains(&candidate)
                                && Self::same_item(&candidate, &dest)
                                && optional
                                    .iter()
                                    .filter(|p| Self::same_item(&candidate, p))
                                    .count()
                                    == 1
                            {
                                candidates.push(candidate);
                            }
                        }
                        candidates.sort();
                        old_version_path = candidates.into_iter().next();
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                    Err(_) if folder_dir.ancestors().any(Path::is_file) => {}
                    Err(e) => return Err(e.to_string()),
                }
                has_update = old_version_path.is_some()
                    || saved.is_some_and(|paths| {
                        paths.iter().any(|old| {
                            !all_paths.contains(old)
                                && Self::same_item(old, &dest)
                                && selected.contains(&dest)
                        })
                    });
                is_downloaded = old_version_path.is_some();
            }
            results.push(OptionalFileDto {
                folder: Self::extract_folder(&dest),
                name: Self::extract_filename(&dest),
                is_enabled: selected.contains(&dest),
                dest_path: dest,
                size: file.size.clone(),
                md5: file.md5.clone(),
                is_downloaded,
                has_update,
                old_version_path,
            });
        }
        results.sort_by(|a, b| a.folder.cmp(&b.folder).then_with(|| a.name.cmp(&b.name)));
        Ok(results)
    }

    /// Keep the active copy when enabling; it may be newer than a leftover disabled copy.
    pub async fn toggle_file(base_dir: &Path, dest: &str, enable: bool) -> Result<(), String> {
        let active = local_path(base_dir, dest).await?;
        let disabled = local_path(base_dir, &format!("{dest}.disabled")).await?;
        let (source, target) = if enable {
            (&disabled, &active)
        } else {
            (&active, &disabled)
        };
        // Directories are handled by the sync conflict transaction, never by a
        // file toggle (which must not move an arbitrary personal directory).
        if source.is_dir() {
            return Ok(());
        }
        if source.exists() {
            if target.exists() {
                if !target.is_file() {
                    return Err(format!("Conflit de type pour {dest}"));
                }
                tokio::fs::remove_file(if enable { source } else { target })
                    .await
                    .map_err(|e| e.to_string())?;
                if enable {
                    return Ok(());
                }
            }
            tokio::fs::rename(source, target)
                .await
                .map_err(|e| format!("Impossible de modifier {dest} : {e}"))?;
        }
        Ok(())
    }

    pub(crate) fn validate_selection(
        manifest: &[SyncFile],
        enabled: &[String],
        displayed: &[String],
    ) -> Result<(), String> {
        let optional = Self::optional_paths(manifest);
        let displayed: HashSet<_> = displayed.iter().cloned().collect();
        if displayed != optional || enabled.iter().any(|path| !optional.contains(path)) {
            return Err(
                "La liste des fichiers optionnels a changé. Fermez puis rouvrez cette fenêtre."
                    .into(),
            );
        }
        Ok(())
    }

    pub async fn save_optional_files(
        app: &tauri::AppHandle,
        session: &Session,
        enabled: Vec<String>,
        displayed: Vec<String>,
    ) -> Result<(), String> {
        let manifest = SyncService.fetch_manifest(app, &session.sync_url).await?;
        Self::validate_selection(&manifest, &enabled, &displayed)?;
        let base = Self::session_dir(app, &session.name).await?;
        let mut settings = SettingsManager::load(app);
        let mut session_settings = settings
            .sessions
            .get(&session.name)
            .cloned()
            .unwrap_or_else(|| settings.default_settings.clone());
        let selected: HashSet<_> = enabled.iter().cloned().collect();
        Self::reconcile_selection(
            &base,
            &manifest,
            &selected,
            session_settings
                .enabled_optional_files
                .as_deref()
                .unwrap_or(&[]),
        )
        .await?;
        session_settings.enabled_optional_files = Some(enabled);
        session_settings.optional_files_configured = Some(true);
        settings
            .sessions
            .insert(session.name.clone(), session_settings);
        SettingsManager::save(app, &settings)
    }

    pub(crate) async fn reconcile_selection(
        base: &Path,
        manifest: &[SyncFile],
        selected: &HashSet<String>,
        saved: &[String],
    ) -> Result<(), String> {
        let obsolete = Self::obsolete_files(base, manifest, saved).await?;
        Self::record_manifest(base, manifest, saved).await?;
        for dest in Self::optional_paths(manifest) {
            Self::toggle_file(base, &dest, selected.contains(&dest)).await?;
        }
        // Preserve replacements until sync succeeds; disable old versions deselected now.
        for old in obsolete {
            let inherited = Self::resolve_selection(manifest, Some(std::slice::from_ref(&old)));
            if inherited.is_disjoint(selected) {
                Self::toggle_file(base, &old, false).await?;
            }
        }
        Ok(())
    }

    async fn obsolete_files(
        base: &Path,
        manifest: &[SyncFile],
        saved: &[String],
    ) -> Result<HashSet<String>, String> {
        let mut all_paths: HashSet<_> = manifest
            .iter()
            .map(|f| relative_path_key(f.destination_path().trim_end_matches('/')))
            .collect();
        // File-only manifests still reserve all their implicit parent folders.
        for file in manifest {
            let destination = file.destination_path();
            let mut parent = Path::new(destination.trim_end_matches('/')).parent();
            while let Some(path) = parent.filter(|p| !p.as_os_str().is_empty()) {
                all_paths.insert(relative_path_key(&path.to_string_lossy()));
                parent = path.parent();
            }
        }
        Ok(Self::managed_files(base, saved)
            .await?
            .into_iter()
            .filter(|path| !all_paths.contains(&relative_path_key(path)))
            .collect())
    }

    pub(crate) async fn cleanup_replaced_files(
        base: &Path,
        manifest: &[SyncFile],
        saved: &[String],
    ) -> Result<(), String> {
        for old in Self::obsolete_files(base, manifest, saved).await? {
            for relative in [old.clone(), format!("{old}.disabled")] {
                let path = local_path(base, &relative).await?;
                match tokio::fs::remove_file(path).await {
                    Ok(()) => {}
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                    Err(e) => return Err(e.to_string()),
                }
            }
        }
        Self::store_managed_files(base, &Self::optional_paths(manifest)).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::sync::{download_url, validate_manifest};

    struct Fixture(std::path::PathBuf);
    impl Fixture {
        fn new() -> Self {
            let path =
                std::env::temp_dir().join(format!("launched-optional-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir_all(&path).unwrap();
            Self(path)
        }
        async fn write(&self, path: &str, content: &[u8]) {
            let path = self.0.join(path);
            tokio::fs::create_dir_all(path.parent().unwrap())
                .await
                .unwrap();
            tokio::fs::write(path, content).await.unwrap();
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
    fn file(name: &str, optional: bool) -> SyncFile {
        SyncFile {
            name: name.into(),
            size: "4".into(),
            md5: format!("{:x}", md5::compute(b"test")),
            file_type: if optional {
                SyncFileType::Optional
            } else {
                SyncFileType::Mandatory
            },
        }
    }
    fn strings(paths: &[&str]) -> Vec<String> {
        paths.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn legacy_manifests_default_to_mandatory_and_prefixes_are_stripped() {
        let legacy: SyncFile =
            serde_json::from_str(r#"{"name":"mods/api.jar","size":"4","md5":""}"#).unwrap();
        assert_eq!(legacy.file_type, SyncFileType::Mandatory);
        assert_eq!(
            file("mandatory/mods/api.jar", false).destination_path(),
            "mods/api.jar"
        );
        assert_eq!(
            file(r"optional\mods\iris.jar", true).destination_path(),
            "mods/iris.jar"
        );
        validate_manifest(&[file("mandatory/", false), file("optional/", true), legacy]).unwrap();
    }

    #[test]
    fn selection_defaults_and_explicit_deselection_are_distinct() {
        let manifest = [
            file("optional/mods/iris.jar", true),
            file("mandatory/mods/api.jar", false),
        ];
        assert_eq!(
            OptionalFilesManager::resolve_selection(&manifest, None),
            HashSet::from(["mods/iris.jar".into()])
        );
        assert!(OptionalFilesManager::resolve_selection(&manifest, Some(&[])).is_empty());
    }

    #[test]
    fn renamed_updates_preserve_selection_without_needing_local_files() {
        let manifest = [file("optional/mods/iris-shaders-1.7.1.jar", true)];
        let saved = strings(&["mods/iris-shaders-1.7.0.jar"]);
        assert_eq!(
            OptionalFilesManager::resolve_selection(&manifest, Some(&saved)),
            HashSet::from(["mods/iris-shaders-1.7.1.jar".into()])
        );
        assert!(OptionalFilesManager::resolve_selection(&manifest, Some(&[])).is_empty());
    }

    #[test]
    fn version_matching_does_not_cross_folders_extensions_or_ambiguous_variants() {
        let saved = strings(&["mods/iris-1.jar"]);
        for manifest in [
            vec![file("optional/shaderpacks/iris-2.jar", true)],
            vec![file("optional/mods/iris-2.zip", true)],
            vec![
                file("optional/mods/iris-2-fabric.jar", true),
                file("optional/mods/iris-2-forge.jar", true),
            ],
            vec![
                file("mandatory/mods/iris-1.jar", false),
                file("optional/mods/iris-2.jar", true),
            ],
        ] {
            assert!(OptionalFilesManager::resolve_selection(&manifest, Some(&saved)).is_empty());
        }
    }

    #[tokio::test]
    async fn inspecting_an_update_preserves_old_files_and_selection() {
        let fixture = Fixture::new();
        fixture.write("mods/iris-1.jar", b"old!").await;
        let manifest = [file("optional/mods/iris-2.jar", true)];
        let saved = strings(&["mods/iris-1.jar"]);
        let items = OptionalFilesManager::inspect_files(&fixture.0, &manifest, Some(&saved))
            .await
            .unwrap();
        assert!(items[0].has_update && items[0].is_enabled && items[0].is_downloaded);
        assert_eq!(
            items[0].old_version_path.as_deref(),
            Some("mods/iris-1.jar")
        );
        assert!(fixture.0.join("mods/iris-1.jar").exists());
        assert_eq!(saved, strings(&["mods/iris-1.jar"]));
    }

    #[tokio::test]
    async fn root_and_nested_files_report_the_correct_previous_version() {
        let fixture = Fixture::new();
        fixture.write("pack_v1.zip.disabled", b"old!").await;
        fixture
            .write("mods/client/iris-1.jar.disabled", b"old!")
            .await;
        let manifest = [
            file("optional/pack_v2.zip", true),
            file("optional/mods/client/iris-2.jar", true),
        ];
        OptionalFilesManager::record_manifest(
            &fixture.0,
            &[
                file("optional/pack_v1.zip", true),
                file("optional/mods/client/iris-1.jar", true),
            ],
            &[],
        )
        .await
        .unwrap();
        let items = OptionalFilesManager::inspect_files(&fixture.0, &manifest, Some(&[]))
            .await
            .unwrap();
        assert_eq!(items[0].folder, "");
        assert_eq!(items[0].old_version_path.as_deref(), Some("pack_v1.zip"));
        assert_eq!(items[1].folder, "mods/client");
        assert!(items.iter().all(|f| f.has_update && !f.is_enabled));
    }

    #[tokio::test]
    async fn exact_files_use_the_real_checksum_for_update_detection() {
        let fixture = Fixture::new();
        fixture.write("mods/iris.jar.disabled", b"test").await;
        let manifest = [file("optional/mods/iris.jar", true)];
        let items = OptionalFilesManager::inspect_files(&fixture.0, &manifest, Some(&[]))
            .await
            .unwrap();
        assert!(!items[0].has_update && items[0].is_downloaded && !items[0].is_enabled);
        fixture.write("mods/iris.jar.disabled", b"evil").await;
        assert!(
            OptionalFilesManager::inspect_files(&fixture.0, &manifest, Some(&[]))
                .await
                .unwrap()[0]
                .has_update
        );
    }

    #[tokio::test]
    async fn enable_disable_round_trip_preserves_bytes_without_a_download() {
        let fixture = Fixture::new();
        fixture.write("mods/iris.jar", b"test").await;
        OptionalFilesManager::toggle_file(&fixture.0, "mods/iris.jar", false)
            .await
            .unwrap();
        assert!(!fixture.0.join("mods/iris.jar").exists());
        OptionalFilesManager::toggle_file(&fixture.0, "mods/iris.jar", true)
            .await
            .unwrap();
        assert_eq!(
            tokio::fs::read(fixture.0.join("mods/iris.jar"))
                .await
                .unwrap(),
            b"test"
        );
        assert!(!fixture.0.join("mods/iris.jar.disabled").exists());
    }

    #[tokio::test]
    async fn duplicate_disabled_copy_never_overwrites_the_active_copy() {
        let fixture = Fixture::new();
        fixture.write("mods/iris.jar", b"test").await;
        fixture.write("mods/iris.jar.disabled", b"old!").await;
        OptionalFilesManager::toggle_file(&fixture.0, "mods/iris.jar", true)
            .await
            .unwrap();
        assert_eq!(
            tokio::fs::read(fixture.0.join("mods/iris.jar"))
                .await
                .unwrap(),
            b"test"
        );
        fixture.write("mods/iris.jar.disabled", b"old!").await;
        OptionalFilesManager::toggle_file(&fixture.0, "mods/iris.jar", false)
            .await
            .unwrap();
        assert_eq!(
            tokio::fs::read(fixture.0.join("mods/iris.jar.disabled"))
                .await
                .unwrap(),
            b"test"
        );
    }

    #[tokio::test]
    async fn rename_failures_are_reported() {
        let fixture = Fixture::new();
        fixture.write("mods/iris.jar", b"test").await;
        tokio::fs::create_dir(fixture.0.join("mods/iris.jar.disabled"))
            .await
            .unwrap();
        assert!(
            OptionalFilesManager::toggle_file(&fixture.0, "mods/iris.jar", false)
                .await
                .is_err()
        );
        assert!(fixture.0.join("mods/iris.jar").is_file());
    }

    #[tokio::test]
    async fn cleanup_preserves_current_disabled_mandatory_and_exempt_files() {
        let fixture = Fixture::new();
        for path in [
            "mods/api.jar",
            "mods/iris.jar.disabled",
            "mods/obsolete.jar",
            "mods/!custom.jar",
        ] {
            fixture.write(path, b"test").await;
        }
        let manifest = [
            file("mandatory/mods/api.jar", false),
            file("optional/mods/iris.jar", true),
        ];
        SyncService
            .cleanup_local_files(&fixture.0.join("mods"), &manifest, &fixture.0)
            .await
            .unwrap();
        assert!(fixture.0.join("mods/api.jar").exists());
        assert!(fixture.0.join("mods/iris.jar.disabled").exists());
        assert!(fixture.0.join("mods/!custom.jar").exists());
        assert!(!fixture.0.join("mods/obsolete.jar").exists());
    }

    #[tokio::test]
    async fn replaced_file_cleanup_protects_other_manifest_entries() {
        let fixture = Fixture::new();
        for path in [
            "mods/iris-1.jar",
            "mods/iris-1.jar.disabled",
            "mods/iris-2.jar",
            "mods/iris-3.jar",
            "mods/iris-0.zip",
        ] {
            fixture.write(path, b"test").await;
        }
        let manifest = [
            file("optional/mods/iris-2.jar", true),
            file("mandatory/mods/iris-3.jar", false),
        ];
        OptionalFilesManager::cleanup_replaced_files(
            &fixture.0,
            &manifest,
            &strings(&["mods/iris-1.jar"]),
        )
        .await
        .unwrap();
        assert!(!fixture.0.join("mods/iris-1.jar").exists());
        assert!(!fixture.0.join("mods/iris-1.jar.disabled").exists());
        for path in ["mods/iris-2.jar", "mods/iris-3.jar", "mods/iris-0.zip"] {
            assert!(fixture.0.join(path).exists());
        }
    }

    #[tokio::test]
    async fn saving_deselection_disables_old_versions_without_deleting_them() {
        let fixture = Fixture::new();
        fixture.write("mods/iris-1.jar", b"old!").await;
        fixture.write("mods/iris-3.jar", b"test").await;
        let manifest = [
            file("optional/mods/iris-2.jar", true),
            file("mandatory/mods/iris-3.jar", false),
        ];
        OptionalFilesManager::reconcile_selection(
            &fixture.0,
            &manifest,
            &HashSet::new(),
            &strings(&["mods/iris-1.jar"]),
        )
        .await
        .unwrap();
        assert!(!fixture.0.join("mods/iris-1.jar").exists());
        assert!(fixture.0.join("mods/iris-1.jar.disabled").exists());
        assert!(fixture.0.join("mods/iris-3.jar").exists());
    }

    #[tokio::test]
    async fn saving_an_update_keeps_old_version_until_replacement_is_downloaded() {
        let fixture = Fixture::new();
        fixture.write("mods/iris-1.jar", b"old!").await;
        let manifest = [file("optional/mods/iris-2.jar", true)];
        let selected = HashSet::from(["mods/iris-2.jar".into()]);
        OptionalFilesManager::reconcile_selection(
            &fixture.0,
            &manifest,
            &selected,
            &strings(&["mods/iris-1.jar"]),
        )
        .await
        .unwrap();
        assert!(fixture.0.join("mods/iris-1.jar").exists());
        assert!(!fixture.0.join("mods/iris-2.jar").exists());
        fixture.write("mods/iris-2.jar", b"test").await;
        OptionalFilesManager::cleanup_replaced_files(&fixture.0, &manifest, &[])
            .await
            .unwrap();
        assert!(!fixture.0.join("mods/iris-1.jar").exists());
        assert!(fixture.0.join("mods/iris-2.jar").exists());
    }

    #[tokio::test]
    async fn untracked_numbered_files_are_never_renamed_or_deleted() {
        let fixture = Fixture::new();
        fixture.write("config/server-1.toml", b"mine").await;
        fixture
            .write("config/server-1.toml.disabled", b"also mine")
            .await;
        let manifest = [file("optional/config/server-2.toml", true)];
        let items = OptionalFilesManager::inspect_files(&fixture.0, &manifest, None)
            .await
            .unwrap();
        assert_eq!(items[0].old_version_path, None);
        OptionalFilesManager::reconcile_selection(&fixture.0, &manifest, &HashSet::new(), &[])
            .await
            .unwrap();
        OptionalFilesManager::cleanup_replaced_files(&fixture.0, &manifest, &[])
            .await
            .unwrap();
        assert_eq!(
            tokio::fs::read(fixture.0.join("config/server-1.toml"))
                .await
                .unwrap(),
            b"mine"
        );
        assert_eq!(
            tokio::fs::read(fixture.0.join("config/server-1.toml.disabled"))
                .await
                .unwrap(),
            b"also mine"
        );
    }

    #[tokio::test]
    async fn removed_disabled_files_remain_tracked_until_cleanup_succeeds() {
        let fixture = Fixture::new();
        fixture.write("resourcepacks/pack-1.zip", b"test").await;
        let manifest = [file("optional/resourcepacks/pack-1.zip", true)];
        OptionalFilesManager::reconcile_selection(&fixture.0, &manifest, &HashSet::new(), &[])
            .await
            .unwrap();
        assert!(fixture.0.join("resourcepacks/pack-1.zip.disabled").exists());
        OptionalFilesManager::cleanup_replaced_files(&fixture.0, &[], &[])
            .await
            .unwrap();
        assert!(!fixture.0.join("resourcepacks/pack-1.zip.disabled").exists());
        assert!(OptionalFilesManager::managed_files(&fixture.0, &[])
            .await
            .unwrap()
            .is_empty());
    }

    #[tokio::test]
    async fn file_to_directory_conflicts_commit_or_restore_original_bytes() {
        use crate::core::sync_conflicts::SyncConflicts;
        for succeeds in [false, true] {
            let fixture = Fixture::new();
            fixture.write("config/foo", b"original").await;
            let manifest = [file("mandatory/config/foo/bar.toml", false)];
            let mut conflicts =
                SyncConflicts::prepare(&fixture.0, &manifest, &["config"], &HashSet::new())
                    .await
                    .unwrap();
            fixture.write("config/foo/bar.toml", b"new!").await;
            if succeeds {
                OptionalFilesManager::cleanup_replaced_files(
                    &fixture.0,
                    &manifest,
                    &strings(&["config/foo"]),
                )
                .await
                .unwrap();
                conflicts.commit().await.unwrap();
                assert!(fixture.0.join("config/foo/bar.toml").is_file());
            } else {
                conflicts.rollback().await.unwrap();
                assert_eq!(
                    tokio::fs::read(fixture.0.join("config/foo")).await.unwrap(),
                    b"original"
                );
            }
        }
    }

    #[tokio::test]
    async fn directory_to_file_conflicts_commit_or_restore_original_tree() {
        use crate::core::sync_conflicts::SyncConflicts;
        for succeeds in [false, true] {
            let fixture = Fixture::new();
            fixture.write("config/foo/old.toml", b"original").await;
            let manifest = [file("mandatory/config/foo", false)];
            let mut conflicts =
                SyncConflicts::prepare(&fixture.0, &manifest, &["config"], &HashSet::new())
                    .await
                    .unwrap();
            fixture.write("config/foo", b"new!").await;
            if succeeds {
                conflicts.commit().await.unwrap();
                assert!(fixture.0.join("config/foo").is_file());
            } else {
                conflicts.rollback().await.unwrap();
                assert_eq!(
                    tokio::fs::read(fixture.0.join("config/foo/old.toml"))
                        .await
                        .unwrap(),
                    b"original"
                );
            }
        }
    }

    #[tokio::test]
    async fn conflicting_personal_and_exempt_paths_are_preserved() {
        use crate::core::sync_conflicts::SyncConflicts;
        let fixture = Fixture::new();
        fixture.write("personal/foo", b"mine").await;
        let manifest = [file("optional/personal/foo/bar.toml", true)];
        assert!(
            SyncConflicts::prepare(&fixture.0, &manifest, &["mods"], &HashSet::new())
                .await
                .is_err()
        );
        assert_eq!(
            tokio::fs::read(fixture.0.join("personal/foo"))
                .await
                .unwrap(),
            b"mine"
        );
        fixture.write("config/foo/!keep", b"mine").await;
        let manifest = [file("mandatory/config/foo", false)];
        assert!(
            SyncConflicts::prepare(&fixture.0, &manifest, &["config"], &HashSet::new())
                .await
                .is_err()
        );
        assert!(fixture.0.join("config/foo/!keep").exists());
    }

    #[tokio::test]
    async fn launcher_metadata_cannot_be_overwritten_by_a_server_manifest() {
        for name in [MANAGED_FILES_NAME, ".launched-sync-conflicts/user.jar"] {
            assert!(validate_manifest(&[file(name, true)]).is_err());
        }
    }

    #[tokio::test]
    async fn file_toggles_never_rename_personal_directories_or_destroy_a_disabled_copy() {
        let fixture = Fixture::new();
        fixture.write("config/choice.cfg/note.txt", b"mine").await;
        OptionalFilesManager::toggle_file(&fixture.0, "config/choice.cfg", false)
            .await
            .unwrap();
        assert!(fixture.0.join("config/choice.cfg/note.txt").is_file());
        assert!(!fixture.0.join("config/choice.cfg.disabled").exists());
        fixture.write("config/choice.cfg.disabled", b"test").await;
        assert!(
            OptionalFilesManager::toggle_file(&fixture.0, "config/choice.cfg", true)
                .await
                .is_err()
        );
        assert!(fixture.0.join("config/choice.cfg.disabled").is_file());
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn case_only_manifest_renames_never_delete_the_current_file() {
        let fixture = Fixture::new();
        fixture.write("mods/Iris.jar", b"test").await;
        let manifest = [file("optional/mods/iris.jar", true)];
        let saved = strings(&["mods/Iris.jar"]);
        assert!(
            OptionalFilesManager::resolve_selection(&manifest, Some(&saved))
                .contains("mods/iris.jar")
        );
        SyncService
            .cleanup_local_files(&fixture.0.join("mods"), &manifest, &fixture.0)
            .await
            .unwrap();
        OptionalFilesManager::cleanup_replaced_files(&fixture.0, &manifest, &saved)
            .await
            .unwrap();
        assert!(fixture.0.join("mods/iris.jar").is_file());
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn junctions_cannot_redirect_optional_file_operations() {
        let fixture = Fixture::new();
        let outside = Fixture::new();
        outside.write("iris.jar", b"test").await;
        let result = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(fixture.0.join("mods"))
            .arg(&outside.0)
            .output()
            .unwrap();
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
        assert!(
            OptionalFilesManager::toggle_file(&fixture.0, "mods/iris.jar", false)
                .await
                .is_err()
        );
        assert!(outside.0.join("iris.jar").exists());
        // Remove only the junction, never its target.
        std::fs::remove_dir(fixture.0.join("mods")).unwrap();
    }

    #[test]
    fn selection_validation_rejects_mandatory_arbitrary_and_stale_paths() {
        let manifest = [
            file("optional/mods/iris.jar", true),
            file("mandatory/mods/api.jar", false),
        ];
        let displayed = strings(&["mods/iris.jar"]);
        OptionalFilesManager::validate_selection(&manifest, &[], &displayed).unwrap();
        for selected in ["../outside", "C:/outside", "mods/api.jar"] {
            assert!(OptionalFilesManager::validate_selection(
                &manifest,
                &strings(&[selected]),
                &displayed
            )
            .is_err());
        }
        assert!(OptionalFilesManager::validate_selection(&manifest, &[], &[]).is_err());
    }

    #[test]
    fn manifest_validation_rejects_escapes_windows_aliases_and_collisions() {
        for path in [
            "../outside",
            "/absolute",
            "C:/outside",
            "C:outside",
            r"\\server\file",
            "mods/../file",
            "mods/a:stream",
            "mods/a.",
            "mods/NUL.jar",
            "mods//a.jar",
        ] {
            assert!(validate_manifest(&[file(path, true)]).is_err(), "{path}");
        }
        for manifest in [
            vec![
                file("mandatory/mods/a.jar", false),
                file("optional/mods/a.jar", true),
            ],
            vec![file("mods/A.jar", false), file("mods/a.jar", true)],
            vec![file("mods/a.jar", true), file("mods/a.jar.disabled", true)],
            vec![file("mods/file", false), file("mods/file/child.jar", true)],
        ] {
            assert!(validate_manifest(&manifest).is_err());
        }
    }

    #[tokio::test]
    async fn toggle_rejects_escape_paths_without_touching_files() {
        let fixture = Fixture::new();
        for path in [
            "../outside",
            "/absolute",
            "C:/outside",
            r"C:\outside",
            "mods/a:stream",
        ] {
            assert!(OptionalFilesManager::toggle_file(&fixture.0, path, false)
                .await
                .is_err());
        }
    }

    #[test]
    fn download_urls_encode_names_and_remove_manifest_queries() {
        assert_eq!(
            download_url(
                "https://example.test/sync?v1=false",
                "optional/mods/a #1+é.jar"
            )
            .unwrap(),
            "https://example.test/sync/optional/mods/a%20%231+%C3%A9.jar"
        );
        assert_eq!(
            download_url("https://example.test/sync/", "mods/a.jar").unwrap(),
            "https://example.test/sync/mods/a.jar"
        );
        assert_eq!(
            download_url("https://example.test/sync/index.json", "mods/a.jar").unwrap(),
            "https://example.test/sync/mods/a.jar"
        );
    }
}
