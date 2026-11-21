use crate::core::discord_presence::DiscordPresence;
use serde::{Deserialize, Serialize};

/**
 * Represents a session configuration from servers.json.
 */
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionLink {
    pub name: String,
    pub url: String,
    pub icon: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ComponentSpec {
    pub uid: String,
    pub version: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LoaderKind {
    Forge,
    Fabric,
    NeoForge,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub name: String,
    pub slug: Option<String>,
    pub minecraft: String,
    pub forge: Option<String>,
    pub fabric: Option<String>,
    pub neoforge: Option<String>,
    pub components: Option<Vec<ComponentSpec>>,
    pub sync_dir: String,
    pub sync_url: String,
    pub welcome: String,
    pub jvm_arg: String,
    pub credits: String,
    #[serde(alias = "assets_path")]
    pub assets_path: Option<String>,
    pub hostname: Option<String>,
    #[serde(default)]
    pub is_default: bool,
    pub links: Option<Vec<SessionLink>>,
    #[serde(default)]
    pub crack: Option<bool>,
    #[serde(
        default,
        deserialize_with = "crate::core::discord_presence::deserialize_optional",
        skip_serializing_if = "Option::is_none"
    )]
    pub discord_presence: Option<DiscordPresence>,
}

impl Session {
    /// Resolve one loader consistently for installation and launch. Ambiguity must
    /// be corrected in the dashboard rather than silently launching the wrong one.
    pub fn selected_loader(&self) -> Result<Option<(LoaderKind, &str)>, String> {
        let mut selected = None;
        for (kind, version) in [
            (LoaderKind::Forge, &self.forge),
            (LoaderKind::Fabric, &self.fabric),
            (LoaderKind::NeoForge, &self.neoforge),
        ] {
            if let Some(version) = version.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
                if selected.is_some() {
                    return Err("Plusieurs modloaders sont configurés. Sélectionnez un seul loader et enregistrez la session dans le tableau de bord.".to_string());
                }
                selected = Some((kind, version));
            }
        }
        Ok(selected)
    }

    pub fn installed_version_id(&self) -> Result<String, String> {
        Ok(match self.selected_loader()? {
            Some((LoaderKind::Forge, version)) => format!("{}-forge-{}", self.minecraft, version),
            Some((LoaderKind::Fabric, version)) => {
                format!("fabric-loader-{}-{}", version, self.minecraft)
            }
            Some((LoaderKind::NeoForge, version)) => format!("neoforge-{}", version),
            None => self.minecraft.clone(),
        })
    }

    pub fn effective_components(&self) -> Vec<ComponentSpec> {
        if let Some(custom) = &self.components {
            return custom.clone();
        }

        let mut components = vec![ComponentSpec {
            uid: "net.minecraft".to_string(),
            version: self.minecraft.clone(),
        }];

        if let Some(forge_ver) = &self.forge.as_deref().filter(|v| !v.trim().is_empty()) {
            components.push(ComponentSpec {
                uid: "net.minecraftforge".to_string(),
                version: forge_ver.to_string(),
            });
        } else if let Some(neoforge_ver) =
            &self.neoforge.as_deref().filter(|v| !v.trim().is_empty())
        {
            components.push(ComponentSpec {
                uid: "net.neoforged".to_string(),
                version: neoforge_ver.to_string(),
            });
        } else if let Some(fabric_ver) = &self.fabric.as_deref().filter(|v| !v.trim().is_empty()) {
            components.push(ComponentSpec {
                uid: "net.fabricmc.fabric-loader".to_string(),
                version: fabric_ver.to_string(),
            });
        }

        components
    }
}

/**
 * Handles fetching and managing sessions.
 */
pub struct SessionManager;

impl SessionManager {
    /// Report only sessions containing local files, including partial downloads.
    /// Merely choosing optional files can create metadata and empty directories.
    pub(crate) async fn local_session_names(
        sessions_root: &std::path::Path,
        session_names: &[String],
    ) -> Result<Vec<String>, String> {
        match tokio::fs::symlink_metadata(sessions_root).await {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err("Le dossier des sessions ne peut pas être un lien symbolique.".into());
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
            Err(error) => return Err(error.to_string()),
        }
        let mut names = Vec::new();
        // Resolve the requested spelling through the filesystem itself. This
        // respects case-insensitive volumes without conflating distinct Linux
        // directories or case-sensitive Windows/macOS volumes.
        for name in session_names {
            let Ok(directory) = Self::local_directory(sessions_root, name).await else {
                continue;
            };
            if !matches!(
                tokio::fs::symlink_metadata(&directory).await,
                Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink()
            ) {
                continue;
            }
            if Self::contains_local_files(&directory).await? {
                names.push(name.clone());
            }
        }
        names.sort();
        Ok(names)
    }

    async fn contains_local_files(base: &std::path::Path) -> Result<bool, String> {
        let mut pending = vec![base.to_path_buf()];
        while let Some(directory) = pending.pop() {
            let mut entries = match tokio::fs::read_dir(&directory).await {
                Ok(entries) => entries,
                // A session may be removed while the hub refreshes its status.
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
                Err(error) => return Err(error.to_string()),
            };
            while let Some(entry) = entries
                .next_entry()
                .await
                .map_err(|error| error.to_string())?
            {
                let kind = entry.file_type().await.map_err(|error| error.to_string())?;
                if kind.is_file() {
                    if directory == base
                        && entry.file_name().to_str().is_some_and(|name| {
                            name.eq_ignore_ascii_case(
                                crate::core::optional_files::MANAGED_FILES_NAME,
                            )
                        })
                    {
                        continue;
                    }
                    return Ok(true);
                }
                if kind.is_dir() {
                    pending.push(entry.path());
                }
                // Do not follow symlinks or junctions outside the session.
            }
        }
        Ok(false)
    }

    pub(crate) async fn local_directory(
        sessions_root: &std::path::Path,
        name: &str,
    ) -> Result<std::path::PathBuf, String> {
        crate::core::sync::validate_relative_path(name)?;
        if name.contains(['/', '\\']) {
            return Err("Nom de session invalide".into());
        }
        crate::core::sync::local_path(sessions_root, name).await
    }

    pub(crate) fn remove_local_files(directory: &std::path::Path) -> Result<(), String> {
        match std::fs::remove_dir_all(directory) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!(
                "Impossible de supprimer les fichiers locaux : {error}"
            )),
        }
    }

    /**
     * Fetches sessions from the remote servers.json URL.
     */
    pub async fn fetch_sessions(app: &tauri::AppHandle, url: &str) -> Result<Vec<Session>, String> {
        crate::auth::discord::site_get(app, url)
            .await?
            .json::<Vec<Session>>()
            .await
            .map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn local_presence_does_not_create_a_missing_sessions_directory() {
        let root = std::env::temp_dir().join(format!("launched-presence-{}", uuid::Uuid::new_v4()));
        assert!(
            SessionManager::local_session_names(&root, &["Missing".into()])
                .await
                .unwrap()
                .is_empty()
        );
        assert!(!root.exists());
    }

    #[tokio::test]
    async fn local_presence_requires_files_and_updates_after_deletion() {
        let root = std::env::temp_dir().join(format!("launched-presence-{}", uuid::Uuid::new_v4()));
        for directory in [
            "Empty",
            "MetadataOnly/mods",
            "Downloaded/mods",
            "Partial",
            "DisabledOnly/mods",
        ] {
            std::fs::create_dir_all(root.join(directory)).unwrap();
        }
        std::fs::write(
            root.join("MetadataOnly")
                .join(crate::core::optional_files::MANAGED_FILES_NAME),
            b"[]",
        )
        .unwrap();
        std::fs::write(root.join("Downloaded/mods/mod.jar"), b"downloaded").unwrap();
        std::fs::write(root.join("Partial/mod.jar.tmp"), b"partial").unwrap();
        std::fs::write(root.join("DisabledOnly/mods/mod.jar.disabled"), b"disabled").unwrap();
        std::fs::write(root.join("not-a-session.json"), b"{}").unwrap();
        let names = [
            "Empty",
            "MetadataOnly",
            "Downloaded",
            "Partial",
            "DisabledOnly",
            "Missing",
            "not-a-session.json",
        ]
        .map(str::to_owned);
        assert_eq!(
            SessionManager::local_session_names(&root, &names)
                .await
                .unwrap(),
            ["DisabledOnly", "Downloaded", "Partial"]
        );

        SessionManager::remove_local_files(&root.join("Downloaded")).unwrap();
        assert_eq!(
            SessionManager::local_session_names(&root, &names)
                .await
                .unwrap(),
            ["DisabledOnly", "Partial"]
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn local_presence_does_not_follow_symbolic_links() {
        let root = std::env::temp_dir().join(format!("launched-presence-{}", uuid::Uuid::new_v4()));
        let sessions = root.join("sessions");
        std::fs::create_dir_all(sessions.join("Empty")).unwrap();
        std::fs::create_dir_all(root.join("outside")).unwrap();
        std::fs::write(root.join("outside/mod.jar"), b"outside").unwrap();
        let links = [sessions.join("Linked"), sessions.join("Empty").join("mods")];
        for link in &links {
            #[cfg(unix)]
            std::os::unix::fs::symlink(root.join("outside"), link).unwrap();
            #[cfg(windows)]
            {
                let result = std::process::Command::new("cmd")
                    .args(["/C", "mklink", "/J"])
                    .arg(link)
                    .arg(root.join("outside"))
                    .output()
                    .unwrap();
                assert!(
                    result.status.success(),
                    "Failed to create test junction: {}",
                    String::from_utf8_lossy(&result.stderr)
                );
            }
        }
        let names = ["Linked".into(), "Empty".into()];
        assert!(SessionManager::local_session_names(&sessions, &names)
            .await
            .unwrap()
            .is_empty());
        assert!(
            SessionManager::local_session_names(&sessions.join("Linked"), &names)
                .await
                .is_err()
        );
        // Remove each link itself before cleaning up the temporary fixture.
        for link in links {
            #[cfg(unix)]
            std::fs::remove_file(link).unwrap();
            #[cfg(windows)]
            std::fs::remove_dir(link).unwrap();
        }
        std::fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn local_presence_preserves_requested_spelling_using_filesystem_case_rules() {
        let root = std::env::temp_dir().join(format!("launched-presence-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("Survival")).unwrap();
        std::fs::write(root.join("Survival/mod.jar"), b"downloaded").unwrap();
        let names =
            ["survival", "SURVIVAL", "Survival", "Missing", "../outside"].map(str::to_owned);
        let expected = if root.join("survival").is_dir() {
            vec!["SURVIVAL", "Survival", "survival"]
        } else {
            vec!["Survival"]
        };
        assert_eq!(
            SessionManager::local_session_names(&root, &names)
                .await
                .unwrap(),
            expected
        );
        assert!(root.join("Survival/mod.jar").is_file());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn local_deletion_removes_only_the_selected_session_and_can_be_repeated() {
        let root = std::env::temp_dir().join(format!("launched-delete-{}", uuid::Uuid::new_v4()));
        let sessions = root.join("sessions");
        let selected = sessions.join("Selected");
        let other = sessions.join("Other");
        std::fs::create_dir_all(selected.join("saves/world")).unwrap();
        std::fs::create_dir_all(&other).unwrap();
        std::fs::write(selected.join("saves/world/level.dat"), b"save").unwrap();
        std::fs::write(other.join("options.txt"), b"keep").unwrap();
        std::fs::write(root.join("settings.json"), b"keep").unwrap();

        let directory = SessionManager::local_directory(&sessions, "Selected")
            .await
            .unwrap();
        SessionManager::remove_local_files(&directory).unwrap();
        SessionManager::remove_local_files(&directory).unwrap();
        assert!(!selected.exists());
        assert_eq!(std::fs::read(other.join("options.txt")).unwrap(), b"keep");
        assert!(root.join("settings.json").is_file());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn local_deletion_rejects_names_outside_a_single_session_directory() {
        let root = std::env::temp_dir().join("launched-delete-validation/sessions");
        for name in [
            "",
            ".",
            "..",
            "../other",
            "nested/session",
            "nested\\session",
            "C:\\",
            "/root",
            "CON",
            "name.",
        ] {
            assert!(
                SessionManager::local_directory(&root, name).await.is_err(),
                "{name}"
            );
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn local_deletion_rejects_session_symlinks() {
        let root =
            std::env::temp_dir().join(format!("launched-delete-link-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("sessions")).unwrap();
        std::fs::create_dir_all(root.join("outside")).unwrap();
        std::os::unix::fs::symlink(root.join("outside"), root.join("sessions/Linked")).unwrap();
        assert!(
            SessionManager::local_directory(&root.join("sessions"), "Linked")
                .await
                .is_err()
        );
        assert!(root.join("outside").exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    fn session() -> Session {
        serde_json::from_value(serde_json::json!({
            "name": "Loader test", "minecraft": "1.21.1", "syncDir": "mods",
            "syncUrl": "https://example.com/sync", "welcome": "", "jvmArg": "", "credits": ""
        }))
        .unwrap()
    }

    #[test]
    fn installation_and_launch_select_each_loader_consistently() {
        for (kind, version, id, uid) in [
            (
                LoaderKind::Forge,
                "52.0.28",
                "1.21.1-forge-52.0.28",
                "net.minecraftforge",
            ),
            (
                LoaderKind::Fabric,
                "0.16.9",
                "fabric-loader-0.16.9-1.21.1",
                "net.fabricmc.fabric-loader",
            ),
            (
                LoaderKind::NeoForge,
                "21.1.80",
                "neoforge-21.1.80",
                "net.neoforged",
            ),
        ] {
            let mut session = session();
            match kind {
                LoaderKind::Forge => session.forge = Some(version.to_string()),
                LoaderKind::Fabric => session.fabric = Some(version.to_string()),
                LoaderKind::NeoForge => session.neoforge = Some(version.to_string()),
            }
            assert_eq!(session.selected_loader().unwrap(), Some((kind, version)));
            assert_eq!(session.installed_version_id().unwrap(), id);
            assert_eq!(session.effective_components()[1].uid, uid);
        }
    }

    #[test]
    fn conflicting_loaders_fail_before_installation_or_launch() {
        for (first, second) in [
            (LoaderKind::Forge, LoaderKind::Fabric),
            (LoaderKind::Forge, LoaderKind::NeoForge),
            (LoaderKind::Fabric, LoaderKind::NeoForge),
        ] {
            let mut session = session();
            for kind in [first, second] {
                match kind {
                    LoaderKind::Forge => session.forge = Some("52.0.28".to_string()),
                    LoaderKind::Fabric => session.fabric = Some("0.16.9".to_string()),
                    LoaderKind::NeoForge => session.neoforge = Some("21.1.80".to_string()),
                }
            }
            assert!(session.selected_loader().is_err());
            assert!(session.installed_version_id().is_err());
        }
    }

    #[test]
    fn blank_loaders_are_vanilla_and_versions_are_trimmed() {
        let mut session = session();
        session.forge = Some("  ".to_string());
        assert_eq!(session.selected_loader().unwrap(), None);
        assert_eq!(session.installed_version_id().unwrap(), "1.21.1");
        session.fabric = Some(" 0.16.9 ".to_string());
        assert_eq!(
            session.installed_version_id().unwrap(),
            "fabric-loader-0.16.9-1.21.1"
        );
    }
}
