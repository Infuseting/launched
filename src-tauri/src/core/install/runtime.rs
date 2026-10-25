use crate::core::download::{Checksum, DownloadEngine, DownloadTask};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tokio::fs;

const JRE_MANIFEST_URL: &str = "https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json";

#[derive(Debug, Deserialize)]
pub struct JreManifestIndex {
    #[serde(flatten)]
    pub platforms: HashMap<String, HashMap<String, Vec<JrePlatformEntry>>>,
}

#[derive(Debug, Deserialize)]
pub struct JrePlatformEntry {
    pub manifest: JreManifestInfo,
}

#[derive(Debug, Deserialize)]
pub struct JreManifestInfo {
    pub url: String,
    pub sha1: String,
    pub size: u64,
}

#[derive(Debug, Deserialize)]
pub struct JreComponentManifest {
    pub files: HashMap<String, JreFile>,
}

#[derive(Debug, Deserialize)]
pub struct JreFile {
    pub r#type: String,
    pub downloads: Option<JreFileDownloads>,
    pub executable: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct JreFileDownloads {
    pub raw: Option<JreDownloadInfo>,
    pub lzma: Option<JreDownloadInfo>,
}

#[derive(Debug, Deserialize)]
pub struct JreDownloadInfo {
    pub url: String,
    pub sha1: String,
    pub size: u64,
}

pub fn get_jre_platform_id() -> &'static str {
    if cfg!(target_os = "windows") {
        if cfg!(target_arch = "aarch64") {
            "windows-arm64"
        } else if cfg!(target_arch = "x86_64") {
            "windows-x64"
        } else {
            "windows-x86"
        }
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "mac-os-arm64"
        } else {
            "mac-os"
        }
    } else {
        if cfg!(target_arch = "x86_64") {
            "linux"
        } else {
            "linux-i386"
        }
    }
}

pub fn get_java_binary(jre_base_path: &Path) -> PathBuf {
    if cfg!(windows) {
        jre_base_path.join("bin").join("java.exe")
    } else {
        jre_base_path.join("bin").join("java")
    }
}

/// Check the JVM itself: java.exe can exist while required runtime files are missing.
pub(crate) async fn validate_java(java_bin: &Path) -> Result<(), String> {
    let mut command = tokio::process::Command::new(java_bin);
    command.arg("-version").kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let output = tokio::time::timeout(std::time::Duration::from_secs(15), command.output())
        .await
        .map_err(|_| format!("Java validation timed out at {}", java_bin.display()))?
        .map_err(|e| format!("Cannot run Java at {}: {}", java_bin.display(), e))?;
    if !output.status.success() {
        return Err(format!(
            "Java runtime is unusable at {} ({}): {} {}",
            java_bin.display(),
            output.status,
            String::from_utf8_lossy(&output.stdout).trim(),
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(())
}

pub struct JreManager {
    engine: DownloadEngine,
    mc_path: PathBuf,
}

impl JreManager {
    pub fn new(mc_path: PathBuf) -> Self {
        Self {
            engine: DownloadEngine::new(24),
            mc_path,
        }
    }

    /// Determines the correct Mojang JRE component name for a given Minecraft version, major Java version or component name.
    pub fn resolve_component_name(
        mc_version: Option<&str>,
        major_version: Option<u8>,
        component_hint: Option<&str>,
    ) -> &'static str {
        if let Some(comp) = component_hint {
            match comp {
                "java-runtime-delta" => return "java-runtime-delta",
                "java-runtime-gamma" => return "java-runtime-gamma",
                "java-runtime-beta" => return "java-runtime-beta",
                "java-runtime-alpha" => return "java-runtime-alpha",
                "jre-legacy" => return "jre-legacy",
                _ => {}
            }
        }

        if let Some(v) = major_version {
            if v >= 21 {
                return "java-runtime-delta";
            } else if v >= 17 {
                return "java-runtime-gamma";
            } else if v >= 16 {
                return "java-runtime-alpha";
            } else {
                return "jre-legacy";
            }
        }

        if let Some(mc_ver) = mc_version {
            let parts: Vec<u32> = mc_ver
                .split('.')
                .filter_map(|s| s.parse::<u32>().ok())
                .collect();

            if parts.len() >= 2 && parts[0] == 1 {
                let minor = parts[1];
                let patch = parts.get(2).copied().unwrap_or(0);

                if minor > 20 || (minor == 20 && patch >= 5) {
                    return "java-runtime-delta"; // Java 21
                } else if minor >= 18 || (minor == 20 && patch < 5) {
                    return "java-runtime-gamma"; // Java 17
                } else if minor == 17 {
                    return "java-runtime-alpha"; // Java 16
                } else {
                    return "jre-legacy"; // Java 8
                }
            } else if parts.len() >= 2 && parts[0] > 1 {
                return "java-runtime-delta";
            }
        }

        "jre-legacy"
    }

    /// Ensures the specified Mojang JRE is downloaded and returns the java executable path.
    pub async fn ensure_jre(
        &self,
        window: Option<&tauri::Window>,
        component: &str,
    ) -> Result<PathBuf, String> {
        let platform = get_jre_platform_id();
        let jre_base_path = self
            .mc_path
            .join("runtime")
            .join(component)
            .join(platform)
            .join(component);

        let java_bin = get_java_binary(&jre_base_path);

        if validate_java(&java_bin).await.is_ok() {
            return Ok(java_bin);
        }

        // Revalidate every manifest file and repair missing/corrupt files in place.
        // The download engine checks SHA-1 and propagates failures.

        log::info!("Downloading isolated Mojang Java runtime '{}' for '{}'...", component, platform);

        // 1. Fetch JRE manifest index
        let index: JreManifestIndex = self.engine.fetch_json(JRE_MANIFEST_URL).await?;

        let platform_map = index.platforms.get(platform).ok_or_else(|| {
            format!("Platform '{}' not found in Mojang JRE manifest index", platform)
        })?;

        let component_list = platform_map.get(component).ok_or_else(|| {
            format!("Component '{}' not found for platform '{}' in JRE manifest index", component, platform)
        })?;

        let component_entry = component_list.first().ok_or_else(|| {
            format!("No entry for component '{}' on platform '{}'", component, platform)
        })?;

        // 2. Fetch component manifest
        let component_manifest: JreComponentManifest = self
            .engine
            .fetch_json(&component_entry.manifest.url)
            .await?;

        // 3. Prepare download tasks
        let mut tasks = Vec::new();

        for (rel_path, file) in component_manifest.files {
            let dest_path = jre_base_path.join(&rel_path);

            if file.r#type == "directory" {
                let _ = fs::create_dir_all(&dest_path).await;
                continue;
            }

            if file.r#type == "file" {
                if let Some(downloads) = file.downloads {
                    if let Some(raw) = downloads.raw {
                        let is_exec = file.executable.unwrap_or(false) || rel_path.contains("bin/");
                        tasks.push(DownloadTask {
                            url: raw.url,
                            dest: dest_path,
                            size: Some(raw.size),
                            checksum: Some(Checksum::Sha1(raw.sha1)),
                            is_executable: is_exec,
                            description: Some(format!("Java {}", rel_path)),
                        });
                    }
                }
            }
        }

        log::info!("Queued {} JRE files to download...", tasks.len());
        self.engine
            .download_all(window, tasks, &format!("Installing Java ({})", component))
            .await?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Ok(meta) = fs::metadata(&java_bin).await {
                let mut perms = meta.permissions();
                perms.set_mode(0o755);
                let _ = fs::set_permissions(&java_bin, perms).await;
            }
        }

        validate_java(&java_bin).await?;
        log::info!("Mojang JRE '{}' ready at {:?}", component, java_bin);
        Ok(java_bin)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn rejects_missing_java() {
        let root = std::env::temp_dir().join(format!("jre-missing-{}", uuid::Uuid::new_v4()));
        assert!(validate_java(&get_java_binary(&root)).await.is_err());
    }

    #[tokio::test]
    async fn rejects_incomplete_runtime_even_when_binary_and_modules_exist() {
        let root = std::env::temp_dir().join(format!("jre-partial-{}", uuid::Uuid::new_v4()));
        let java = get_java_binary(&root);
        fs::create_dir_all(java.parent().unwrap()).await.unwrap();
        fs::create_dir_all(root.join("lib")).await.unwrap();
        fs::write(&java, b"incomplete executable").await.unwrap();
        fs::write(root.join("lib/modules"), b"partial modules").await.unwrap();
        // Both previous presence checks accepted this installation.
        assert!(validate_java(&java).await.is_err());
        fs::remove_dir_all(root).await.unwrap();
    }
}
