use crate::core::optional_files::CONFLICTS_DIR_NAME;
use crate::core::sync::{local_path, SyncFile};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

/// Stage only obsolete file/directory type conflicts. All other old files stay
/// in place until download succeeds; failed transfers restore the staged paths.
pub(crate) struct SyncConflicts {
    base: PathBuf,
    staging: PathBuf,
    moved: Vec<(String, PathBuf)>,
}

impl SyncConflicts {
    pub(crate) async fn prepare(
        base: &Path,
        manifest: &[SyncFile],
        sync_dirs: &[&str],
        managed: &HashSet<String>,
    ) -> Result<Self, String> {
        let relative_staging = format!("{CONFLICTS_DIR_NAME}/{}", uuid::Uuid::new_v4());
        let mut transaction = Self {
            base: base.to_path_buf(),
            staging: local_path(base, &relative_staging).await?,
            moved: Vec::new(),
        };
        let mut required = HashSet::new();
        for file in manifest {
            let destination = file.destination_path();
            let relative = destination.trim_end_matches('/');
            if relative.is_empty() {
                continue;
            }
            required.insert((relative.to_string(), destination.ends_with('/')));
            let mut parent = Path::new(relative).parent();
            while let Some(path) = parent.filter(|p| !p.as_os_str().is_empty()) {
                required.insert((path.to_string_lossy().replace('\\', "/"), true));
                parent = path.parent();
            }
        }
        let mut required: Vec<_> = required.into_iter().collect();
        required.sort_by_key(|(path, _)| path.matches('/').count());
        for (relative, directory) in required {
            if let Err(error) = transaction
                .stage(&relative, directory, sync_dirs, managed)
                .await
            {
                return match transaction.rollback().await {
                    Ok(()) => Err(error),
                    Err(restore) => Err(format!("{error}. Restauration incomplète : {restore}")),
                };
            }
        }
        Ok(transaction)
    }

    async fn stage(
        &mut self,
        relative: &str,
        directory: bool,
        sync_dirs: &[&str],
        managed: &HashSet<String>,
    ) -> Result<(), String> {
        let source = local_path(&self.base, relative).await?;
        let metadata = match tokio::fs::symlink_metadata(&source).await {
            Ok(metadata) => metadata,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(e) => return Err(e.to_string()),
        };
        if metadata.is_dir() == directory {
            return Ok(());
        }
        let synchronized = sync_dirs.iter().any(|dir| {
            let dir = dir.replace('\\', "/");
            let dir = dir.trim_end_matches('/');
            relative == dir || relative.starts_with(&format!("{dir}/"))
        });
        if !synchronized && !(metadata.is_file() && managed.contains(relative)) {
            return Err(format!(
                "Conflit de type pour {relative} : le fichier personnel a été conservé"
            ));
        }
        Self::check_removable_tree(&source).await?;
        tokio::fs::create_dir_all(&self.staging)
            .await
            .map_err(|e| e.to_string())?;
        let backup = self.staging.join(self.moved.len().to_string());
        tokio::fs::rename(source, &backup)
            .await
            .map_err(|e| e.to_string())?;
        self.moved.push((relative.to_string(), backup));
        // Persist the map so staged originals remain identifiable after a crash.
        let map = serde_json::to_vec_pretty(&self.moved).map_err(|e| e.to_string())?;
        tokio::fs::write(self.staging.join("paths.json"), map)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    async fn check_removable_tree(path: &Path) -> Result<(), String> {
        let metadata = tokio::fs::symlink_metadata(path)
            .await
            .map_err(|e| e.to_string())?;
        if metadata.file_type().is_symlink()
            || path
                .file_name()
                .is_some_and(|name| name.to_string_lossy().starts_with('!'))
        {
            return Err(format!("Chemin protégé conservé : {}", path.display()));
        }
        if metadata.is_dir() {
            let mut entries = tokio::fs::read_dir(path).await.map_err(|e| e.to_string())?;
            while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
                Box::pin(Self::check_removable_tree(&entry.path())).await?;
            }
        }
        Ok(())
    }

    pub(crate) async fn rollback(&mut self) -> Result<(), String> {
        while let Some((relative, backup)) = self.moved.last() {
            let target = local_path(&self.base, relative).await?;
            match tokio::fs::symlink_metadata(&target).await {
                Ok(meta) if meta.is_dir() => tokio::fs::remove_dir_all(&target)
                    .await
                    .map_err(|e| e.to_string())?,
                Ok(_) => tokio::fs::remove_file(&target)
                    .await
                    .map_err(|e| e.to_string())?,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(e.to_string()),
            }
            tokio::fs::rename(backup, target)
                .await
                .map_err(|e| format!("{} (sauvegardes : {})", e, self.staging.display()))?;
            self.moved.pop();
        }
        self.remove_staging().await
    }

    pub(crate) async fn commit(self) -> Result<(), String> {
        self.remove_staging().await
    }

    async fn remove_staging(&self) -> Result<(), String> {
        match tokio::fs::remove_dir_all(&self.staging).await {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}
