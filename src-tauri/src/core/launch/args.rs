use crate::auth::AuthResponse;
use crate::core::launch::models::{LibraryRule, VersionManifest};
use crate::core::session::Session;
use std::fs;
use std::path::{Path, PathBuf};
use which::which;

pub struct LaunchArguments {
    pub java_path: PathBuf,
    pub java_home: Option<PathBuf>,
    pub game_dir: PathBuf,
    pub jvm_args: Vec<String>,
    pub classpath: Vec<PathBuf>,
    pub main_class: String,
    pub minecraft_args: Vec<String>,
}

/// Returns the current OS name as Minecraft knows it.
fn current_os_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    }
}

/// Evaluates library rules to check if it should be included on the current OS.
fn library_allowed(rules: &Option<Vec<LibraryRule>>) -> bool {
    let rules = match rules {
        Some(r) if !r.is_empty() => r,
        _ => return true,
    };

    let os = current_os_name();
    let mut allowed = false;

    for rule in rules {
        let matches_os = match &rule.os {
            Some(cond) => cond.name.as_deref() == Some(os),
            None => true,
        };
        if matches_os {
            allowed = rule.action == "allow";
        }
    }
    allowed
}

/// Extracts a native JAR's .so/.dll/.dylib files into `natives_dir`.
fn extract_natives(jar_path: &Path, natives_dir: &Path) -> Result<(), String> {
    let file = fs::File::open(jar_path)
        .map_err(|e| format!("Failed to open native JAR {:?}: {}", jar_path, e))?;

    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Failed to read ZIP {:?}: {}", jar_path, e))?;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("ZIP entry error: {}", e))?;

        let name = entry.name().to_string();

        // Only extract native library files, skip META-INF
        let is_native = name.ends_with(".so")
            || name.ends_with(".dll")
            || name.ends_with(".dylib")
            || name.ends_with(".jnilib");

        if !is_native || name.contains("META-INF") {
            continue;
        }

        // Use only the filename (strip any path inside the JAR)
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

/// Finds the best Java binary for the given required major version.
/// Prefers exact match, falls back to any available java.
fn find_java(
    required_major: Option<u8>,
    mc_path: &Path,
) -> Result<(u8, PathBuf, Option<PathBuf>), String> {
    let mut search_paths = Vec::new();

    // 1. Check Mojang's downloaded runtimes in .minecraft/runtime
    let runtime_base = mc_path.join("runtime");
    if runtime_base.exists() {
        // Walk the runtime directory to find bin/java
        // Structure: runtime/<component>/<platform>/<component>/bin/java
        if let Ok(components) = std::fs::read_dir(&runtime_base) {
            for component in components.flatten() {
                if let Ok(platforms) = std::fs::read_dir(component.path()) {
                    for platform in platforms.flatten() {
                        if let Ok(variants) = std::fs::read_dir(platform.path()) {
                            for variant in variants.flatten() {
                                let java_home = variant.path();
                                let java_bin = if cfg!(windows) {
                                    java_home.join("bin/java.exe")
                                } else {
                                    java_home.join("bin/java")
                                };
                                if java_bin.exists() {
                                    search_paths.push(java_home);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Check system JVM locations
    #[cfg(unix)]
    {
        let jvm_base = PathBuf::from("/usr/lib/jvm");
        if let Ok(entries) = std::fs::read_dir(&jvm_base) {
            for entry in entries.flatten() {
                let path = entry.path();
                let java_bin = path.join("bin/java");
                if java_bin.exists() {
                    search_paths.push(path);
                }
            }
        }
    }

    let mut candidates: Vec<(u8, PathBuf)> = Vec::new();
    for path in search_paths {
        // Try to parse major version from directory name or binary
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        // Common patterns: java-8-openjdk, java-1.8.0-openjdk, jre-legacy, java-runtime-alpha
        let major = if name.contains("-1.8")
            || name.contains("-8-")
            || name.ends_with("-8")
            || name.contains(".1.8")
            || name.contains("jre-legacy")
        {
            8u8
        } else if name.contains("java-runtime-alpha") {
            16u8
        } else if name.contains("java-runtime-beta") || name.contains("java-runtime-gamma") {
            17u8
        } else if let Some(n) = name.split('-').nth(1).and_then(|s| s.parse::<u8>().ok()) {
            n
        } else {
            // Fallback: try to run java -version
            let java_bin = if cfg!(windows) {
                path.join("bin/java.exe")
            } else {
                path.join("bin/java")
            };
            if let Ok(output) = std::process::Command::new(&java_bin)
                .arg("-version")
                .output()
            {
                let stderr = String::from_utf8_lossy(&output.stderr);
                if stderr.contains("1.8.0") || stderr.contains("\"1.8") {
                    8u8
                } else if stderr.contains("version \"21") {
                    21u8
                } else if stderr.contains("version \"17") {
                    17u8
                } else if stderr.contains("version \"25") {
                    25u8
                } else {
                    0
                }
            } else {
                0
            }
        };
        candidates.push((major, path));
    }

    // If we have a required version, filter and sort
    if let Some(required) = required_major {
        let mut filtered = candidates.clone();
        if required == 8 {
            // Forge 1.12.2 and older *strictly* require Java 8
            filtered.retain(|(v, _)| *v == 8);
        } else {
            // Modern Minecraft (1.17+) is generally compatible with newer versions than requested
            filtered.retain(|(v, _)| *v >= required);
        }

        if !filtered.is_empty() {
            // Sort by closeness to required version
            filtered.sort_by_key(|(v, _)| (*v as i16 - required as i16).abs());
            if let Some((v, java_home)) = filtered.first() {
                let java_bin = if cfg!(windows) {
                    java_home.join("bin/java.exe")
                } else {
                    java_home.join("bin/java")
                };
                log::info!("Selected JVM: {:?} (detected major: {})", java_home, v);
                return Ok((*v, java_bin, Some(java_home.clone())));
            }
        }

        if required == 8 {
            return Err("Java 8 (1.8) is required but not found on your system. The launcher should have downloaded it automatically, please try re-syncing.".to_string());
        }
    } else {
        // No required version, just pick highest
        candidates.sort_by_key(|(v, _)| std::cmp::Reverse(*v));
        if let Some((v, java_home)) = candidates.first() {
            let java_bin = if cfg!(windows) {
                java_home.join("bin/java.exe")
            } else {
                java_home.join("bin/java")
            };
            log::info!(
                "Selected JVM (Highest): {:?} (detected major: {})",
                java_home,
                v
            );
            return Ok((*v, java_bin, Some(java_home.clone())));
        }
    }

    // Fallback to system java only if no version is required or if we're desperate
    let java_bin = which("java")
        .map_err(|_| "Java binary not found in PATH. Please install Java.".to_string())?;

    // Check if the system default java matches requirements
    let mut detected_major = 0u8;
    let output = std::process::Command::new(&java_bin)
        .arg("-version")
        .output()
        .map_err(|e| format!("Failed to check java version: {}", e))?;
    let stderr = String::from_utf8_lossy(&output.stderr);

    if stderr.contains("1.8.0") || stderr.contains("\"1.8") {
        detected_major = 8;
    } else if stderr.contains("version \"17") {
        detected_major = 17;
    } else if stderr.contains("version \"21") {
        detected_major = 21;
    } else if stderr.contains("version \"25") {
        detected_major = 25;
    }

    if let Some(required) = required_major {
        if required == 8 && detected_major != 8 {
            return Err("Java 8 (1.8) is required but your system 'java' is a different version. Please install Java 8.".to_string());
        }
    }

    let java_home = java_bin
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.to_path_buf());
    Ok((detected_major, java_bin, java_home))
}

impl LaunchArguments {
    pub fn from_session(
        session: &Session,
        session_dir: &Path,
        auth: &AuthResponse,
    ) -> Result<Self, String> {
        // Resolve the official .minecraft path
        let official_mc_path = if cfg!(windows) {
            PathBuf::from(std::env::var("APPDATA").unwrap_or_default()).join(".minecraft")
        } else {
            let home = std::env::var("HOME").map_err(|_| "Could not find HOME directory")?;
            PathBuf::from(home).join(".minecraft")
        };

        let version_id_owned = if let Some(forge_version) = &session.forge {
            format!("{}-forge-{}", session.minecraft, forge_version)
        } else {
            session.minecraft.clone()
        };
        let version_id = &version_id_owned;

        let version_json_path = official_mc_path
            .join("versions")
            .join(version_id)
            .join(format!("{}.json", version_id));

        if !version_json_path.exists() {
            return Err(format!(
                "Version JSON not found at {:?}. Please ensure the version is installed.",
                version_json_path
            ));
        }

        let content = fs::read_to_string(&version_json_path)
            .map_err(|e| format!("Failed to read version JSON: {}", e))?;

        let mut manifest: VersionManifest = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse version JSON: {}", e))?;

        if let Some(parent_id) = &manifest.inherits_from {
            let parent_json_path = official_mc_path
                .join("versions")
                .join(parent_id)
                .join(format!("{}.json", parent_id));
            if parent_json_path.exists() {
                if let Ok(parent_content) = fs::read_to_string(&parent_json_path) {
                    if let Ok(parent_manifest) =
                        serde_json::from_str::<VersionManifest>(&parent_content)
                    {
                        if manifest.asset_index.is_none() {
                            manifest.asset_index = parent_manifest.asset_index;
                        }
                        if manifest.java_version.is_none() {
                            manifest.java_version = parent_manifest.java_version;
                        }
                        let parent_libs_len = parent_manifest.libraries.len();
                        manifest.libraries.extend(parent_manifest.libraries);
                        log::info!(
                            "Merged {} libraries from parent {}",
                            parent_libs_len,
                            parent_id
                        );
                    }
                }
            }
        }

        let os = current_os_name();
        let lib_base = official_mc_path.join("libraries");

        // Create natives extraction directory
        let natives_dir = official_mc_path
            .join("versions")
            .join(version_id)
            .join(format!("{}-natives", version_id));
        fs::create_dir_all(&natives_dir)
            .map_err(|e| format!("Failed to create natives dir: {}", e))?;

        let mut classpath = Vec::new();
        let mut missing_libs = Vec::new();

        // 1. Process libraries
        for lib in &manifest.libraries {
            if !library_allowed(&lib.rules) {
                continue;
            }

            if let Some(downloads) = &lib.downloads {
                // Main artifact → classpath
                if let Some(artifact) = &downloads.artifact {
                    let p = lib_base.join(&artifact.path);
                    if p.exists() {
                        classpath.push(p);
                    } else {
                        missing_libs.push(artifact.path.clone());
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
                                missing_libs.push(native_art.path.clone());
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
                    if p.exists() {
                        classpath.push(p);
                    }
                }
            }
        }

        if !missing_libs.is_empty() {
            log::warn!(
                "{} libraries missing from disk (re-sync to download): {:?}",
                missing_libs.len(),
                &missing_libs[..missing_libs.len().min(3)]
            );
        }
        log::info!(
            "Classpath: {} libraries. Natives dir: {:?}",
            classpath.len(),
            natives_dir
        );

        // 2. Add client JAR last
        let root_jar_id = manifest.jar.as_deref().unwrap_or(version_id);
        let client_jar_path = official_mc_path
            .join("versions")
            .join(root_jar_id)
            .join(format!("{}.jar", root_jar_id));

        if client_jar_path.exists() {
            classpath.push(client_jar_path);
        } else {
            return Err(format!("Client JAR not found at {:?}", client_jar_path));
        }

        // JVM args
        let mut jvm_args = Vec::new();

        // CRITICAL: tell JVM where to find native .so/.dll files
        jvm_args.push(format!("-Djava.library.path={}", natives_dir.display()));

        // Memory args from session
        if !session.jvm_arg.is_empty() {
            for arg in session.jvm_arg.split_whitespace() {
                jvm_args.push(arg.to_string());
            }
        } else {
            jvm_args.push("-Xmx2G".to_string());
        }

        // Minecraft game args
        let mut minecraft_args = Vec::new();

        if let Some(arg_line) = manifest.minecraft_arguments {
            // Old format: single string with placeholders
            let map = [
                ("${auth_player_name}", auth.name.clone()),
                ("${version_name}", version_id.clone()),
                (
                    "${game_directory}",
                    session_dir.to_string_lossy().to_string(),
                ),
                (
                    "${assets_root}",
                    official_mc_path
                        .join("assets")
                        .to_string_lossy()
                        .to_string(),
                ),
                (
                    "${assets_index_name}",
                    manifest
                        .asset_index
                        .as_ref()
                        .map(|a| a.id.clone())
                        .unwrap_or_else(|| "1.12".to_string()),
                ),
                ("${auth_uuid}", auth.uuid.clone()),
                ("${auth_access_token}", auth.access_token.clone()),
                ("${user_type}", "msa".to_string()),
                ("${version_type}", "release".to_string()),
            ];

            let mut result_line = arg_line;
            for (placeholder, value) in map {
                result_line = result_line.replace(placeholder, &value);
            }

            for arg in result_line.split_whitespace() {
                minecraft_args.push(arg.to_string());
            }
        } else {
            // Modern format or fallback
            minecraft_args.push("--username".to_string());
            minecraft_args.push(auth.name.clone());
            minecraft_args.push("--version".to_string());
            minecraft_args.push(version_id.clone());
            minecraft_args.push("--gameDir".to_string());
            minecraft_args.push(session_dir.to_string_lossy().to_string());
            minecraft_args.push("--assetsDir".to_string());
            minecraft_args.push(
                official_mc_path
                    .join("assets")
                    .to_string_lossy()
                    .to_string(),
            );
            minecraft_args.push("--assetIndex".to_string());
            minecraft_args.push(
                manifest
                    .asset_index
                    .as_ref()
                    .map(|a| a.id.clone())
                    .unwrap_or_else(|| "1.12".to_string()),
            );
            minecraft_args.push("--uuid".to_string());
            minecraft_args.push(auth.uuid.clone());
            minecraft_args.push("--accessToken".to_string());
            minecraft_args.push(auth.access_token.clone());
            minecraft_args.push("--userType".to_string());
            minecraft_args.push("msa".to_string());
            minecraft_args.push("--versionType".to_string());
            minecraft_args.push("release".to_string());
        }

        // Find correct Java version (MC 1.12.2 needs Java 8)
        let required_java = manifest
            .java_version
            .as_ref()
            .map(|j| j.major_version)
            .or(Some(8));
        let (java_major, java_path, java_home) = find_java(required_java, &official_mc_path)?;
        log::info!("Using java: {:?}, home: {:?}", java_path, java_home);

        // Allow native access (suppresses LWJGL warning on Java 17+)
        if java_major >= 17 {
            jvm_args.push("--enable-native-access=ALL-UNNAMED".to_string());
        }

        Ok(LaunchArguments {
            java_path,
            java_home,
            game_dir: session_dir.to_path_buf(),
            jvm_args,
            classpath,
            main_class: manifest.main_class,
            minecraft_args,
        })
    }

    pub fn build(&self) -> Vec<String> {
        let mut args = self.jvm_args.clone();

        // Add classpath
        args.push("-cp".to_string());
        let cp = self
            .classpath
            .iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect::<Vec<String>>()
            .join(if cfg!(windows) { ";" } else { ":" });
        args.push(cp);

        // Add main class
        args.push(self.main_class.clone());

        // Add Minecraft args
        args.extend(self.minecraft_args.clone());

        args
    }
}
