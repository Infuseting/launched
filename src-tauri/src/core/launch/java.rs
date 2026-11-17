use std::path::{Path, PathBuf};
use which::which;

/// Finds the best Java binary for the given required major version.
/// Prefers exact match, falls back to any available java.
pub(crate) fn find_java(
    required_major: Option<u8>,
    mc_path: &Path,
) -> Result<(u8, PathBuf, Option<PathBuf>), String> {
    let mut search_paths = Vec::new();

    // 1. Check Mojang's downloaded runtimes in .minecraft/runtime
    let runtime_base = mc_path.join("runtime");
    if runtime_base.exists() {
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
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

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
            let java_bin = if cfg!(windows) {
                path.join("bin/java.exe")
            } else {
                path.join("bin/java")
            };
            let mut cmd = std::process::Command::new(&java_bin);
            cmd.arg("-version");
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x08000000);
            }
            if let Ok(output) = cmd.output() {
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

    if let Some(required) = required_major {
        let mut filtered = candidates.clone();
        if required == 8 {
            filtered.retain(|(v, _)| *v == 8);
        } else {
            filtered.retain(|(v, _)| *v >= required);
        }

        if !filtered.is_empty() {
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
        candidates.sort_by_key(|(v, _)| std::cmp::Reverse(*v));
        if let Some((v, java_home)) = candidates.first() {
            let java_bin = if cfg!(windows) {
                java_home.join("bin/java.exe")
            } else {
                java_home.join("bin/java")
            };
            log::info!("Selected JVM (Highest): {:?} (detected major: {})", java_home, v);
            return Ok((*v, java_bin, Some(java_home.clone())));
        }
    }

    let java_bin = which("java")
        .map_err(|_| "Java binary not found in PATH. Please install Java.".to_string())?;

    let mut detected_major = 0u8;
    let mut cmd = std::process::Command::new(&java_bin);
    cmd.arg("-version");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd
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
