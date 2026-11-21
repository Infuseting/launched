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
