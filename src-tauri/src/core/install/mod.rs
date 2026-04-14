pub mod fabric;
pub mod forge;
pub mod mojang;

use crate::core::session::Session;
use tauri::Emitter;

pub struct InstallService;

impl InstallService {
    pub async fn install_for_session(
        &self,
        window: &tauri::Window,
        session: &Session,
    ) -> Result<(), String> {
        // 1. Install Minecraft Base
        let _ = window.emit(
            "sync-progress",
            crate::core::sync::SyncProgress {
                current_file: format!("Installing Minecraft {}...", session.minecraft),
                files_done: 0,
                total_files: 100,
                percentage: 0.0,
            },
        );
        mojang::install_version(&session.minecraft).await?;

        // 2. Install Forge if specified
        if let Some(forge_version) = &session.forge {
            let _ = window.emit(
                "sync-progress",
                crate::core::sync::SyncProgress {
                    current_file: format!("Installing Forge {}...", forge_version),
                    files_done: 0,
                    total_files: 100,
                    percentage: 0.0,
                },
            );
            forge::install_forge(&session.minecraft, forge_version).await?;
        }

        // 3. Install Fabric if specified
        if let Some(fabric_version) = &session.fabric {
            let _ = window.emit(
                "sync-progress",
                crate::core::sync::SyncProgress {
                    current_file: format!("Installing Fabric {}...", fabric_version),
                    files_done: 0,
                    total_files: 100,
                    percentage: 0.0,
                },
            );
            fabric::install_fabric(&session.minecraft, fabric_version).await?;
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
