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
    Quilt,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub name: String,
    pub minecraft: String,
    pub forge: Option<String>,
    pub fabric: Option<String>,
    pub neoforge: Option<String>,
    pub quilt: Option<String>,
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
            (LoaderKind::Quilt, &self.quilt),
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
            Some((LoaderKind::Quilt, version)) => {
                format!("quilt-loader-{}-{}", version, self.minecraft)
            }
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
        } else if let Some(quilt_ver) = &self.quilt.as_deref().filter(|v| !v.trim().is_empty()) {
            components.push(ComponentSpec {
                uid: "org.quiltmc.quilt-loader".to_string(),
                version: quilt_ver.to_string(),
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
    /**
     * Fetches sessions from the remote servers.json URL.
     */
    pub async fn fetch_sessions(url: &str) -> Result<Vec<Session>, String> {
        reqwest::get(url)
            .await
            .map_err(|e| e.to_string())?
            .json::<Vec<Session>>()
            .await
            .map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
                _ => unreachable!(),
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
                    _ => unreachable!(),
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
