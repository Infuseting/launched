use super::rules::{current_os_name, library_allowed};
use crate::core::launch::models::VersionManifest;
use crate::core::session::LoaderKind;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

pub struct ClasspathResult {
    pub classpath: Vec<PathBuf>,
    pub natives_dir: PathBuf,
    pub missing_libraries: Vec<String>,
}

/// Extracts a native JAR's .so/.dll/.dylib files into `natives_dir`.
pub fn extract_natives(jar_path: &Path, natives_dir: &Path) -> Result<(), String> {
    let file = fs::File::open(jar_path)
        .map_err(|e| format!("Failed to open native JAR {:?}: {}", jar_path, e))?;

    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Failed to read ZIP {:?}: {}", jar_path, e))?;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("ZIP entry error: {}", e))?;

        let name = entry.name().to_string();

        let is_native = name.ends_with(".so")
            || name.ends_with(".dll")
            || name.ends_with(".dylib")
            || name.ends_with(".jnilib");

        if !is_native || name.contains("META-INF") {
            continue;
        }

        let filename = Path::new(&name)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let dest = natives_dir.join(&filename);

        if !dest.exists() {
            let mut out = fs::File::create(&dest)
                .map_err(|e| format!("Failed to create native file {:?}: {}", dest, e))?;
            std::io::copy(&mut entry, &mut out)
                .map_err(|e| format!("Failed to extract native {}: {}", name, e))?;
            log::info!("Extracted native: {}", filename);
        }
    }

    Ok(())
}

/// Builder for resolving classpaths and extracting native libraries.
pub struct ClasspathBuilder<'a> {
    official_mc_path: &'a Path,
    version_id: &'a str,
    manifest: &'a VersionManifest,
    selected_loader: Option<(LoaderKind, &'a str)>,
}

impl<'a> ClasspathBuilder<'a> {
    pub fn new(
        official_mc_path: &'a Path,
        version_id: &'a str,
        manifest: &'a VersionManifest,
        selected_loader: Option<(LoaderKind, &'a str)>,
    ) -> Self {
        Self {
            official_mc_path,
            version_id,
            manifest,
            selected_loader,
        }
    }

    pub fn build(self) -> Result<ClasspathResult, String> {
        let os = current_os_name();
        let lib_base = self.official_mc_path.join("libraries");

        // Create natives extraction directory
        let natives_dir = self
            .official_mc_path
            .join("versions")
            .join(self.version_id)
            .join(format!("{}-natives", self.version_id));
        fs::create_dir_all(&natives_dir)
            .map_err(|e| format!("Failed to create natives dir: {}", e))?;

        let mut classpath = Vec::new();
        let mut classpath_seen: HashSet<PathBuf> = HashSet::new();
        let mut missing_libraries = Vec::new();

        // 1. Process manifest libraries
        for lib in &self.manifest.libraries {
            if !library_allowed(&lib.rules) {
                continue;
            }

            if let Some(downloads) = &lib.downloads {
                // Main artifact → classpath
                if let Some(artifact) = &downloads.artifact {
                    let p = lib_base.join(&artifact.path);
                    if p.exists() {
                        if classpath_seen.insert(p.clone()) {
                            classpath.push(p);
                        }
                    } else {
                        missing_libraries.push(artifact.path.clone());
                    }
                }

                // Natives → extract to natives_dir (do NOT add to classpath)
                if let (Some(natives_map), Some(classifiers)) =
                    (&lib.natives, &downloads.classifiers)
                {
                    if let Some(native_key) = natives_map.get(os) {
                        if let Some(native_art) = classifiers.get(native_key) {
                            let native_jar = lib_base.join(&native_art.path);
                            if native_jar.exists() {
                                if let Err(e) = extract_natives(&native_jar, &natives_dir) {
                                    log::warn!(
                                        "Failed to extract natives from {:?}: {}",
                                        native_jar,
                                        e
                                    );
                                }
                            } else {
                                missing_libraries.push(native_art.path.clone());
                            }
                        }
                    }
                }
            } else {
                // Fallback: reconstruct path from maven coordinates
                let parts: Vec<&str> = lib.name.split(':').collect();
                if parts.len() >= 3 {
                    let group = parts[0].replace('.', "/");
                    let artifact_name = parts[1];
                    let ver = parts[2];
                    let jar_name = format!("{}-{}.jar", artifact_name, ver);
                    let p = lib_base
                        .join(&group)
                        .join(artifact_name)
                        .join(ver)
                        .join(&jar_name);
                    if p.exists() && classpath_seen.insert(p.clone()) {
                        classpath.push(p);
                    }
                }
            }
        }

        if !missing_libraries.is_empty() {
            log::warn!(
                "{} libraries missing from disk (re-sync to download): {:?}",
                missing_libraries.len(),
                &missing_libraries[..missing_libraries.len().min(3)]
            );
        }
        log::info!(
            "Classpath: {} libraries. Natives dir: {:?}",
            classpath.len(),
            natives_dir
        );

        // 2. Add vanilla client JAR only when it is truly needed.
        let is_modern_forge_bootstrap = matches!(
            self.selected_loader,
            Some((LoaderKind::Forge | LoaderKind::NeoForge, _))
        ) && self
            .manifest
            .main_class
            .contains("cpw.mods.bootstraplauncher.BootstrapLauncher");

        let has_forge_minecraft_client = self
            .manifest
            .libraries
            .iter()
            .any(|lib| lib.name.starts_with("net.minecraft:client:"));

        if !has_forge_minecraft_client && !is_modern_forge_bootstrap {
            let root_jar_id = self
                .manifest
                .jar
                .as_deref()
                .or(self.manifest.inherits_from.as_deref())
                .unwrap_or(self.version_id);
            let client_jar_path = self
                .official_mc_path
                .join("versions")
                .join(root_jar_id)
                .join(format!("{}.jar", root_jar_id));

            if client_jar_path.exists() {
                if classpath_seen.insert(client_jar_path.clone()) {
                    classpath.push(client_jar_path);
                }
            } else {
                return Err(format!("Client JAR not found at {:?}", client_jar_path));
            }
        } else {
            log::info!(
                "Skipping root client JAR for {}: handled by Forge/module bootstrap or forge client libraries",
                self.version_id
            );
        }

        Ok(ClasspathResult {
            classpath,
            natives_dir,
            missing_libraries,
        })
    }
}
