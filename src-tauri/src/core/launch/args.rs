use std::path::{Path, PathBuf};
use std::fs;
use crate::core::session::Session;
use crate::core::launch::models::VersionManifest;

pub struct LaunchArguments {
    pub java_path: PathBuf,
    pub jvm_args: Vec<String>,
    pub classpath: Vec<PathBuf>,
    pub main_class: String,
    pub minecraft_args: Vec<String>,
}

impl LaunchArguments {
    pub fn from_session(session: &Session, _base_dir: &Path) -> Result<Self, String> {
        let minecraft_path = if cfg!(windows) {
            PathBuf::from(std::env::var("APPDATA").map_err(|_| "APPDATA environment variable not set")?)
                .join(".minecraft")
        } else {
            let home = std::env::var("HOME").map_err(|_| "HOME environment variable not set")?;
            PathBuf::from(home).join(".minecraft")
        };

        let version_id = &session.minecraft;
        let version_json_path = minecraft_path
            .join("versions")
            .join(version_id)
            .join(format!("{}.json", version_id));

        if !version_json_path.exists() {
            return Err(format!("Version JSON not found at {:?}", version_json_path));
        }

        let content = fs::read_to_string(&version_json_path)
            .map_err(|e| format!("Failed to read version JSON: {}", e))?;
        
        let manifest: VersionManifest = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse version JSON: {}", e))?;

        let mut classpath = Vec::new();

        // 1. Add libraries
        for lib in manifest.libraries {
            let lib_path = if let Some(downloads) = lib.downloads {
                if let Some(artifact) = downloads.artifact {
                    Some(minecraft_path.join("libraries").join(artifact.path))
                } else {
                    None
                }
            } else {
                // Fallback: build path from name if artifact path is missing
                // name format: group:artifact:version
                let parts: Vec<&str> = lib.name.split(':').collect();
                if parts.len() >= 3 {
                    let group = parts[0].replace('.', "/");
                    let artifact = parts[1];
                    let version = parts[2];
                    let jar_name = format!("{}-{}.jar", artifact, version);
                    Some(minecraft_path.join("libraries").join(group).join(artifact).join(version).join(jar_name))
                } else {
                    None
                }
            };

            if let Some(p) = lib_path {
                if p.exists() {
                    classpath.push(p);
                }
            }
        }

        // 2. Add client JAR
        let client_jar_path = minecraft_path
            .join("versions")
            .join(version_id)
            .join(format!("{}.jar", version_id));
        
        if client_jar_path.exists() {
            classpath.push(client_jar_path);
        }

        // JVM args
        let mut jvm_args = Vec::new();
        if !session.jvm_arg.is_empty() {
            jvm_args.push(session.jvm_arg.clone());
        } else {
            jvm_args.push("-Xmx2G".to_string());
        }

        // Minecraft args
        let mut minecraft_args = Vec::new();
        minecraft_args.push("--username".to_string());
        minecraft_args.push("Player".to_string()); // Placeholder
        minecraft_args.push("--version".to_string());
        minecraft_args.push(version_id.clone());
        minecraft_args.push("--gameDir".to_string());
        minecraft_args.push(minecraft_path.to_string_lossy().to_string());
        minecraft_args.push("--assetsDir".to_string());
        minecraft_args.push(minecraft_path.join("assets").to_string_lossy().to_string());
        minecraft_args.push("--assetIndex".to_string());
        minecraft_args.push(manifest.asset_index.id.clone());
        minecraft_args.push("--uuid".to_string());
        minecraft_args.push("0".to_string()); // Placeholder
        minecraft_args.push("--accessToken".to_string());
        minecraft_args.push("0".to_string()); // Placeholder
        minecraft_args.push("--userType".to_string());
        minecraft_args.push("msa".to_string());
        minecraft_args.push("--versionType".to_string());
        minecraft_args.push("release".to_string());

        Ok(LaunchArguments {
            java_path: PathBuf::from("java"),
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
        let cp = self.classpath.iter()
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
