pub use super::builder;
pub(crate) use super::java::find_java;

use crate::auth::AuthResponse;
use crate::core::launch::builder::{ClasspathBuilder, GameArgsBuilder, JvmArgsBuilder};
use crate::core::launch::models::VersionManifest;
use crate::core::session::{LoaderKind, Session};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

pub struct LaunchArguments {
    pub java_path: PathBuf,
    pub java_home: Option<PathBuf>,
    pub game_dir: PathBuf,
    pub jvm_args: Vec<String>,
    pub classpath: Vec<PathBuf>,
    pub main_class: String,
    pub minecraft_args: Vec<String>,
    pub wrapper_command: String,
    pub manifest_asset_index_id: Option<String>,
    pub manifest_asset_index_url: Option<String>,
}

impl LaunchArguments {
    pub fn resolve_assets_dir(session: &Session, official_mc_path: &Path) -> PathBuf {
        if let Some(p) = &session.assets_path {
            let clean = p.trim().trim_matches(['"', '\'']);
            if !clean.is_empty()
                && !clean.starts_with("http://")
                && !clean.starts_with("https://")
                && !clean.contains("://")
                && !clean.ends_with(".json")
            {
                return PathBuf::from(clean);
            }
        }
        official_mc_path.join("assets")
    }

    pub fn guarantee_assets_dir_and_subdirs(assets_dir: &Path) -> Result<(), String> {
        let clean = assets_dir.to_string_lossy();
        let clean_trimmed = clean.trim().trim_matches(['"', '\'']);
        if clean_trimmed.is_empty() {
            return Err("Assets directory cannot be empty".to_string());
        }
        if clean_trimmed.starts_with("http://")
            || clean_trimmed.starts_with("https://")
            || clean_trimmed.contains("://")
            || clean_trimmed.ends_with(".json")
        {
            return Ok(());
        }
        let target = Path::new(clean_trimmed);
        fs::create_dir_all(target)
            .map_err(|e| format!("Failed to create assets directory {:?}: {}", target, e))?;
        let _ = fs::create_dir_all(target.join("indexes"));
        let _ = fs::create_dir_all(target.join("objects"));
        Ok(())
    }

    pub fn ensure_assets_dir_exists(assets_dir: &Path) -> Result<(), String> {
        Self::guarantee_assets_dir_and_subdirs(assets_dir)
    }

    pub fn extract_assets_dir(minecraft_args: &[String]) -> Option<PathBuf> {
        let mut result = None;
        for (pos, a) in minecraft_args.iter().enumerate() {
            if a == "--assetsDir" {
                if let Some(p) = minecraft_args.get(pos + 1) {
                    let clean = p.trim().trim_matches(['"', '\'']);
                    if !clean.is_empty()
                        && !clean.starts_with("--")
                        && !clean.starts_with("http://")
                        && !clean.starts_with("https://")
                        && !clean.contains("://")
                        && !clean.ends_with(".json")
                    {
                        result = Some(PathBuf::from(clean));
                    }
                }
            } else if let Some(stripped) = a.strip_prefix("--assetsDir=") {
                let clean = stripped.trim().trim_matches(['"', '\'']);
                if !clean.is_empty()
                    && !clean.starts_with("http://")
                    && !clean.starts_with("https://")
                    && !clean.contains("://")
                    && !clean.ends_with(".json")
                {
                    result = Some(PathBuf::from(clean));
                }
            }
        }
        result
    }

    pub fn extract_asset_index_id(minecraft_args: &[String]) -> Option<String> {
        let mut result = None;
        for (pos, a) in minecraft_args.iter().enumerate() {
            if a == "--assetIndex" {
                if let Some(id) = minecraft_args.get(pos + 1) {
                    let clean = id.trim().trim_matches(['"', '\'']);
                    if !clean.starts_with("--") && !clean.is_empty() {
                        result = Some(clean.to_string());
                    }
                }
            } else if let Some(stripped) = a.strip_prefix("--assetIndex=") {
                let clean = stripped.trim().trim_matches(['"', '\'']);
                if !clean.is_empty() {
                    result = Some(clean.to_string());
                }
            }
        }
        result
    }

    pub fn from_session(
        session: &Session,
        session_dir: &Path,
        auth: &AuthResponse,
        settings: &crate::core::settings::AppSettings,
    ) -> Result<Self, String> {
        let version_id_owned = session.installed_version_id()?;

        let official_mc_path = crate::core::install::official_mc_path()?;

        // Guarantee assets directory
        let assets_dir = Self::resolve_assets_dir(session, &official_mc_path);
        Self::ensure_assets_dir_exists(&assets_dir)?;
        let _ = fs::create_dir_all(assets_dir.join("indexes"));
        let _ = fs::create_dir_all(assets_dir.join("objects"));

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

        if let Some((LoaderKind::Forge, forge_version)) = session.selected_loader()? {
            if !crate::core::install::forge::is_legacy_forge_layout(&session.minecraft) {
                let forge_client_jar = official_mc_path
                    .join("libraries")
                    .join("net")
                    .join("minecraftforge")
                    .join("forge")
                    .join(format!("{}-{}", session.minecraft, forge_version))
                    .join(format!(
                        "forge-{}-{}-client.jar",
                        session.minecraft, forge_version
                    ));

                if !forge_client_jar.exists() {
                    return Err(format!(
                        "Modern Forge client JAR missing at {:?}. Please re-sync the session to complete Forge installation.",
                        forge_client_jar
                    ));
                }
            }
        }

        let content = fs::read_to_string(&version_json_path)
            .map_err(|e| format!("Failed to read version JSON: {}", e))?;

        let mut manifest: VersionManifest = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse version JSON: {}", e))?;

        // Inherit from parent manifest if needed
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
                        let child_needs_asset_index = manifest
                            .asset_index
                            .as_ref()
                            .map_or(true, |a| a.url.as_deref().unwrap_or("").trim().is_empty());
                        if child_needs_asset_index && parent_manifest.asset_index.is_some() {
                            manifest.asset_index = parent_manifest.asset_index;
                        }
                        if manifest.java_version.is_none() {
                            manifest.java_version = parent_manifest.java_version;
                        }
                        if manifest.minecraft_arguments.is_none() {
                            manifest.minecraft_arguments = parent_manifest.minecraft_arguments;
                        }

                        if let Some(parent_args) = parent_manifest.arguments {
                            if let Some(ref mut child_args) = manifest.arguments {
                                let mut merged_game = parent_args.game;
                                merged_game.extend(child_args.game.clone());
                                child_args.game = merged_game;

                                let mut merged_jvm = parent_args.jvm;
                                merged_jvm.extend(child_args.jvm.clone());
                                child_args.jvm = merged_jvm;
                            } else {
                                manifest.arguments = Some(parent_args);
                            }
                        }

                        let mut merged_from_parent = 0usize;
                        for parent_lib in parent_manifest.libraries {
                            if !manifest.libraries.iter().any(|l| l.name == parent_lib.name) {
                                manifest.libraries.push(parent_lib);
                                merged_from_parent += 1;
                            }
                        }
                        log::info!(
                            "Merged {} libraries and arguments from parent {}",
                            merged_from_parent,
                            parent_id
                        );
                    }
                }
            }
        }

        // 1. Build Classpath & extract natives
        let classpath_builder = ClasspathBuilder::new(
            &official_mc_path,
            version_id,
            &manifest,
            session.selected_loader()?,
        );
        let classpath_result = classpath_builder.build()?;
        let classpath = classpath_result.classpath;
        let natives_dir = classpath_result.natives_dir;

        // 2. Resolve JVM and build JVM arguments
        let required_java = manifest
            .java_version
            .as_ref()
            .map(|j| j.major_version)
            .or(Some(8));
        let (java_major, java_path, java_home) = find_java(required_java, &official_mc_path)?;
        log::info!("Using java: {:?}, home: {:?}", java_path, java_home);

        let session_settings = settings
            .sessions
            .get(&session.name)
            .unwrap_or(&settings.default_settings);

        let is_forge_or_neoforge = matches!(
            session.selected_loader()?,
            Some((LoaderKind::Forge | LoaderKind::NeoForge, _))
        );

        let manifest_jvm = manifest.arguments.as_ref().map(|a| a.jvm.clone());
        let jvm_builder = JvmArgsBuilder::new(natives_dir, official_mc_path.join("libraries"))
            .with_manifest_args(manifest_jvm)
            .with_ram(session_settings.min_ram, session_settings.max_ram);
        let jvm_builder = if !session_settings.jvm_args.trim().is_empty() {
            jvm_builder.with_custom_args(&session_settings.jvm_args)
        } else {
            jvm_builder.with_remote_args(&session.jvm_arg)
        };
        let jvm_args = jvm_builder
            .with_java_major(java_major)
            .with_forge_loader(is_forge_or_neoforge)
            .build();

        // 3. Resolve Asset Index and build Minecraft arguments
        let default_index_fallback = if !session.minecraft.is_empty() {
            session.minecraft.clone()
        } else {
            "1.12".to_string()
        };
        let asset_index_id = manifest
            .asset_index
            .as_ref()
            .map(|a| a.id.clone())
            .unwrap_or(default_index_fallback);

        let manifest_game = manifest.arguments.as_ref().map(|a| &a.game);
        let legacy_args = manifest.minecraft_arguments.as_deref();

        let minecraft_args = GameArgsBuilder::new(
            session_dir,
            &assets_dir,
            version_id,
            &session.minecraft,
            &asset_index_id,
            auth,
            &settings.game_resolution,
        )
        .with_manifest_game_args(manifest_game)
        .with_legacy_minecraft_arguments(legacy_args)
        .build();

        // Guarantee effective assets directory existence
        let effective_assets_dir =
            Self::extract_assets_dir(&minecraft_args).unwrap_or_else(|| assets_dir.clone());
        Self::guarantee_assets_dir_and_subdirs(&effective_assets_dir)?;

        // Ensure asset index file on disk exists as valid JSON (online repair runs async in launch_game)
        let resolved_index_id = Self::extract_asset_index_id(&minecraft_args)
            .or_else(|| manifest.asset_index.as_ref().map(|a| a.id.clone()))
            .unwrap_or_else(|| {
                if !session.minecraft.is_empty() {
                    session.minecraft.clone()
                } else {
                    "1.12".to_string()
                }
            });

        let index_path = effective_assets_dir
            .join("indexes")
            .join(format!("{}.json", resolved_index_id));
        let index_invalid = fs::read_to_string(&index_path)
            .map(|s| s.trim().is_empty() || serde_json::from_str::<Value>(&s).is_err())
            .unwrap_or(true);
        if index_invalid {
            if let Some(parent) = index_path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::write(&index_path, r#"{"objects":{}}"#);
        }

        Ok(LaunchArguments {
            java_path,
            java_home,
            game_dir: session_dir.to_path_buf(),
            jvm_args,
            classpath,
            main_class: manifest.main_class,
            minecraft_args,
            wrapper_command: session_settings.wrapper_command.clone(),
            manifest_asset_index_id: manifest.asset_index.as_ref().map(|a| a.id.clone()),
            manifest_asset_index_url: manifest.asset_index.and_then(|a| a.url),
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
