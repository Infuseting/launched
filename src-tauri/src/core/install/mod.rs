pub mod assets;
pub mod fabric;
pub mod forge;
pub mod mojang;
pub mod neoforge;
pub mod runtime;

pub use assets::AssetManager;

use async_trait::async_trait;
use crate::core::session::{LoaderKind, Session};
use tauri::Emitter;

pub struct InstallService;

#[async_trait]
trait LoaderInstaller: Send + Sync {
    fn kind(&self) -> LoaderKind;
    fn loader_name(&self) -> &'static str;
    async fn install(&self, session: &Session, version: &str) -> Result<(), String>;
}

struct ForgeInstaller;

#[async_trait]
impl LoaderInstaller for ForgeInstaller {
    fn kind(&self) -> LoaderKind { LoaderKind::Forge }
    fn loader_name(&self) -> &'static str {
        "Forge"
    }

    async fn install(&self, session: &Session, version: &str) -> Result<(), String> {
        forge::install_forge(&session.minecraft, version).await
    }
}

struct FabricInstaller;

#[async_trait]
impl LoaderInstaller for FabricInstaller {
    fn kind(&self) -> LoaderKind { LoaderKind::Fabric }
    fn loader_name(&self) -> &'static str {
        "Fabric"
    }

    async fn install(&self, session: &Session, version: &str) -> Result<(), String> {
        fabric::install_fabric(&session.minecraft, version).await
    }
}

struct NeoForgeInstaller;

#[async_trait]
impl LoaderInstaller for NeoForgeInstaller {
    fn kind(&self) -> LoaderKind { LoaderKind::NeoForge }
    fn loader_name(&self) -> &'static str { "NeoForge" }
    async fn install(&self, session: &Session, version: &str) -> Result<(), String> {
        neoforge::install_neoforge(&session.minecraft, version).await
    }
}

fn loader_installers() -> Vec<Box<dyn LoaderInstaller>> {
    vec![Box::new(ForgeInstaller), Box::new(FabricInstaller), Box::new(NeoForgeInstaller)]
}

impl InstallService {
    pub async fn install_for_session(
        &self,
        window: &tauri::Window,
        session: &Session,
    ) -> Result<(), String> {
        let selected = session.selected_loader()?;
        if matches!(selected, Some((LoaderKind::Quilt, _))) {
            return Err("L’installation de Quilt n’est pas encore prise en charge.".to_string());
        }
        let official_mc_path = mojang::get_official_mc_path().await?;
        let assets_dir = crate::core::launch::args::LaunchArguments::resolve_assets_dir(session, &official_mc_path);

        // 1. Install Minecraft Base and Assets
        let _ = window.emit(
            "sync-progress",
            crate::core::sync::SyncProgress {
                current_file: format!("Installing Minecraft {}...", session.minecraft),
                files_done: 0,
                total_files: 100,
                percentage: 0.0,
            },
        );
        mojang::install_version_with_assets(&session.minecraft, Some(&assets_dir), Some(window)).await?;

        // 2. Install selected mod loaders using a strategy list.
        for installer in loader_installers() {
            if let Some((_, version)) = selected.filter(|(kind, _)| *kind == installer.kind()) {
                let _ = window.emit(
                    "sync-progress",
                    crate::core::sync::SyncProgress {
                        current_file: format!(
                            "Installing {} {}...",
                            installer.loader_name(),
                            version
                        ),
                        files_done: 0,
                        total_files: 100,
                        percentage: 0.0,
                    },
                );
                installer.install(session, version).await?;
            }
        }

        let _ = window.emit(
            "sync-progress",
            crate::core::sync::SyncProgress {
                current_file: "Installation complete".to_string(),
                files_done: 100,
                total_files: 100,
                percentage: 100.0,
            },
        );

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registers_one_installer_for_each_supported_loader() {
        let installers = loader_installers();
        for kind in [LoaderKind::Fabric, LoaderKind::Forge, LoaderKind::NeoForge] {
            assert_eq!(installers.iter().filter(|installer| installer.kind() == kind).count(), 1);
        }
    }
}
