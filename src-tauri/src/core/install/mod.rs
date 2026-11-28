pub mod assets;
pub mod fabric;
pub mod forge;
pub mod mojang;
pub mod neoforge;
pub mod runtime;

pub use assets::AssetManager;

use crate::core::session::{LoaderKind, Session};
use async_trait::async_trait;
use std::path::{Path, PathBuf};
use tauri::Emitter;
use tokio::fs;

pub fn official_mc_path() -> Result<PathBuf, String> {
    if cfg!(windows) {
        let appdata =
            std::env::var("APPDATA").map_err(|_| "Could not find APPDATA directory".to_string())?;
        Ok(PathBuf::from(appdata).join(".minecraft"))
    } else {
        let home =
            std::env::var("HOME").map_err(|_| "Could not find HOME directory".to_string())?;
        Ok(PathBuf::from(home).join(".minecraft"))
    }
}

pub(crate) async fn resolve_installer_java(
    mc_path: &Path,
    mc_version: Option<&str>,
    major_version: Option<u8>,
    component_hint: Option<&str>,
) -> Result<PathBuf, String> {
    let component =
        runtime::JreManager::resolve_component_name(mc_version, major_version, component_hint);

    match mojang::download_jre(component).await {
        Ok(path) => Ok(runtime::get_java_binary(&path)),
        Err(runtime_error) => {
            let fallback = crate::core::launch::args::find_java(major_version, mc_path)
                .map_err(|e| format!("Failed to prepare Java: {}. Fallback: {}", runtime_error, e))?
                .1;
            runtime::validate_java(&fallback).await.map_err(|e| {
                format!("Failed to prepare Java: {}. Fallback: {}", runtime_error, e)
            })?;
            Ok(fallback)
        }
    }
}

pub(crate) async fn run_java_installer(
    installer_jar: &Path,
    mc_path: &Path,
    java_bin: &Path,
    loader_name: &str,
) -> Result<(), String> {
    let profiles_path = mc_path.join("launcher_profiles.json");
    let needs_profile = match fs::read_to_string(&profiles_path).await {
        Ok(c) => c.trim().is_empty() || serde_json::from_str::<serde_json::Value>(&c).is_err(),
        Err(_) => true,
    };
    if needs_profile {
        fs::write(&profiles_path, "{\n  \"profiles\": {}\n}\n")
            .await
            .map_err(|e| format!("Failed to initialize launcher_profiles.json: {}", e))?;
    }

    let mut command = tokio::process::Command::new(java_bin);
    command
        .current_dir(mc_path)
        .arg("-Djava.awt.headless=true")
        .arg("-jar")
        .arg(installer_jar)
        .arg("--installClient")
        .arg(mc_path);
    #[cfg(windows)]
    command.creation_flags(0x08000000);

    let output = command
        .output()
        .await
        .map_err(|e| format!("Failed to run {} installer: {}", loader_name, e))?;

    if !output.status.success() {
        return Err(format!(
            "{} installer failed:\nSTDOUT: {}\nSTDERR: {}",
            loader_name,
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(())
}

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
    fn kind(&self) -> LoaderKind {
        LoaderKind::Forge
    }
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
    fn kind(&self) -> LoaderKind {
        LoaderKind::Fabric
    }
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
    fn kind(&self) -> LoaderKind {
        LoaderKind::NeoForge
    }
    fn loader_name(&self) -> &'static str {
        "NeoForge"
    }
    async fn install(&self, session: &Session, version: &str) -> Result<(), String> {
        neoforge::install_neoforge(&session.minecraft, version).await
    }
}

fn loader_installers() -> Vec<Box<dyn LoaderInstaller>> {
    vec![
        Box::new(ForgeInstaller),
        Box::new(FabricInstaller),
        Box::new(NeoForgeInstaller),
    ]
}

impl InstallService {
    pub async fn install_for_session(
        &self,
        window: &tauri::Window,
        session: &Session,
    ) -> Result<(), String> {
        let selected = session.selected_loader()?;
        let official_mc_path = mojang::get_official_mc_path().await?;
        let assets_dir = crate::core::launch::args::LaunchArguments::resolve_assets_dir(
            session,
            &official_mc_path,
        );
        log::info!(
            "install_for_session '{}' (mc={}, loader={:?}, official_mc_path={}, assets_dir={})",
            session.name,
            session.minecraft,
            selected,
            official_mc_path.display(),
            assets_dir.display()
        );

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
        mojang::install_version_with_assets(&session.minecraft, Some(&assets_dir), Some(window))
            .await
            .map_err(|e| {
                log::error!(
                    "Mojang install_version_with_assets failed for '{}': {}",
                    session.minecraft,
                    e
                );
                e
            })?;
        log::info!("Minecraft {} base & assets ready", session.minecraft);

        // 2. Install selected mod loaders using a strategy list.
        for installer in loader_installers() {
            if let Some((_, version)) = selected.filter(|(kind, _)| *kind == installer.kind()) {
                log::info!("Installing {} {}", installer.loader_name(), version);
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
                installer.install(session, version).await.map_err(|e| {
                    log::error!(
                        "{} {} installation failed: {}",
                        installer.loader_name(),
                        version,
                        e
                    );
                    e
                })?;
                log::info!(
                    "{} {} installed successfully",
                    installer.loader_name(),
                    version
                );
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
            assert_eq!(
                installers
                    .iter()
                    .filter(|installer| installer.kind() == kind)
                    .count(),
                1
            );
        }
    }
}
