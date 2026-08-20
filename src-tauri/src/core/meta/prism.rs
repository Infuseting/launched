use crate::core::download::DownloadEngine;
use crate::core::meta::models::*;
use std::path::PathBuf;
use tokio::fs;

const PRISM_META_BASE_URL: &str = "https://meta.prismlauncher.org/v1";

pub struct PrismMetaClient {
    engine: DownloadEngine,
    mc_path: PathBuf,
}

impl PrismMetaClient {
    pub fn new(mc_path: PathBuf) -> Self {
        Self {
            engine: DownloadEngine::new(8),
            mc_path,
        }
    }

    /// Returns the official .minecraft path across platforms.
    pub fn get_official_mc_path() -> Result<PathBuf, String> {
        if cfg!(windows) {
            Ok(PathBuf::from(std::env::var("APPDATA").unwrap_or_default()).join(".minecraft"))
        } else {
            let home = std::env::var("HOME").map_err(|_| "Could not find HOME directory")?;
            Ok(PathBuf::from(home).join(".minecraft"))
        }
    }

    /// Recursively resolves all components and their dependencies (such as org.lwjgl / org.lwjgl3).
    pub async fn resolve_all_components(&self, initial: &[crate::core::session::ComponentSpec]) -> Result<Vec<ComponentManifest>, String> {
        let mut manifests: Vec<ComponentManifest> = Vec::new();
        let mut queue: Vec<crate::core::session::ComponentSpec> = initial.to_vec();
        let mut seen_uids: std::collections::HashSet<String> = std::collections::HashSet::new();

        while let Some(comp) = queue.pop() {
            if !seen_uids.insert(comp.uid.clone()) {
                continue;
            }

            let manifest = self.get_component(&comp.uid, &comp.version).await?;

            // Check if this component requires other components (e.g. org.lwjgl / org.lwjgl3)
            if let Some(requires) = &manifest.requires {
                for req in requires {
                    if !seen_uids.contains(&req.uid) {
                        let mut ver = req.equals.clone().or_else(|| req.suggests.clone()).unwrap_or_default();
                        if ver.is_empty() {
                            // Fallback to Minecraft version
                            ver = initial.iter().find(|c| c.uid == "net.minecraft")
                                .map(|c| c.version.clone())
                                .or_else(|| {
                                    manifests.iter().find(|m| m.uid.as_deref() == Some("net.minecraft"))
                                        .and_then(|m| m.version.clone())
                                })
                                .unwrap_or_default();
                        }
                        queue.push(crate::core::session::ComponentSpec {
                            uid: req.uid.clone(),
                            version: ver,
                        });
                    }
                }
            }

            manifests.push(manifest);
        }

        // Sort so org.lwjgl/org.lwjgl3 come first, then net.minecraft, then mod loaders
        manifests.sort_by_key(|m| {
            match m.uid.as_deref() {
                Some("org.lwjgl") | Some("org.lwjgl3") => 0,
                Some("net.minecraft") => 1,
                _ => 10,
            }
        });

        Ok(manifests)
    }

    /// Fetches a component manifest from cache or Prism Meta API.
    pub async fn get_component(&self, uid: &str, version: &str) -> Result<ComponentManifest, String> {
        let meta_dir = self.mc_path.join("meta").join(uid);
        let cached_file = meta_dir.join(format!("{}.json", version));

        // 1. Check local cache
        if cached_file.exists() {
            if let Ok(content) = fs::read_to_string(&cached_file).await {
                if let Ok(manifest) = serde_json::from_str::<ComponentManifest>(&content) {
                    return Ok(manifest);
                }
            }
        }

        // 2. Fetch from Prism Meta API
        let url = format!("{}/{}/{}.json", PRISM_META_BASE_URL, uid, version);
        match self.engine.fetch_json::<ComponentManifest>(&url).await {
            Ok(manifest) => {
                // Save to cache
                if let Err(e) = fs::create_dir_all(&meta_dir).await {
                    log::warn!("Failed to create meta cache dir {:?}: {}", meta_dir, e);
                } else if let Ok(json_str) = serde_json::to_string_pretty(&manifest) {
                    let _ = fs::write(&cached_file, json_str).await;
                }
                Ok(manifest)
            }
            Err(err) => {
                log::warn!("Prism Meta fetch failed for {} {}: {}. Attempting fallback...", uid, version, err);
                self.fallback_fetch_component(uid, version).await
            }
        }
    }

    /// Fallback fetcher from official Mojang / Fabric / Quilt APIs if Prism Meta is unreachable.
    async fn fallback_fetch_component(&self, uid: &str, version: &str) -> Result<ComponentManifest, String> {
        if uid == "net.minecraft" {
            self.fallback_fetch_mojang_minecraft(version).await
        } else if uid == "net.fabricmc.fabric-loader" {
            self.fallback_fetch_fabric_loader(version).await
        } else if uid == "org.quiltmc.quilt-loader" {
            self.fallback_fetch_quilt_loader(version).await
        } else {
            Err(format!("Could not fetch component {} {} from Meta API or fallback", uid, version))
        }
    }

    async fn fallback_fetch_mojang_minecraft(&self, version: &str) -> Result<ComponentManifest, String> {
        #[derive(serde::Deserialize)]
        struct VersionManifestIndex {
            versions: Vec<VersionIndexItem>,
        }
        #[derive(serde::Deserialize)]
        struct VersionIndexItem {
            id: String,
            url: String,
        }

        let manifest_index: VersionManifestIndex = self
            .engine
            .fetch_json("https://launchermeta.mojang.com/mc/game/version_manifest.json")
            .await?;

        let entry = manifest_index
            .versions
            .iter()
            .find(|v| v.id == version)
            .ok_or_else(|| format!("Minecraft version {} not found in Mojang index", version))?;

        let raw_json: serde_json::Value = self.engine.fetch_json(&entry.url).await?;
        let manifest: ComponentManifest = serde_json::from_value(raw_json)
            .map_err(|e| format!("Failed to parse Mojang version manifest for {}: {}", version, e))?;

        Ok(manifest)
    }

    async fn fallback_fetch_fabric_loader(&self, version: &str) -> Result<ComponentManifest, String> {
        // Simple generic fallback for Fabric profile
        let url = format!("https://meta.fabricmc.net/v2/versions/loader/{}/profile/json", version);
        let raw_json: serde_json::Value = self.engine.fetch_json(&url).await?;
        let manifest: ComponentManifest = serde_json::from_value(raw_json)
            .map_err(|e| format!("Failed to parse Fabric loader profile: {}", e))?;
        Ok(manifest)
    }

    async fn fallback_fetch_quilt_loader(&self, version: &str) -> Result<ComponentManifest, String> {
        let url = format!("https://meta.quiltmc.org/v3/versions/loader/{}/profile/json", version);
        let raw_json: serde_json::Value = self.engine.fetch_json(&url).await?;
        let manifest: ComponentManifest = serde_json::from_value(raw_json)
            .map_err(|e| format!("Failed to parse Quilt loader profile: {}", e))?;
        Ok(manifest)
    }

    /// Converts Maven coordinates (e.g. `group:artifact:version[:classifier][@ext]`) into relative path.
    pub fn maven_coordinate_to_path(name: &str) -> Option<String> {
        let parts: Vec<&str> = name.split(':').collect();
        if parts.len() < 3 {
            return None;
        }

        let group = parts[0].replace('.', "/");
        let artifact = parts[1];

        let (version, explicit_ext) = if let Some((v, ext)) = parts[2].split_once('@') {
            (v, Some(ext))
        } else {
            (parts[2], None)
        };

        let classifier = if parts.len() >= 4 {
            let raw = parts[3];
            if let Some((c, _)) = raw.split_once('@') {
                Some(c)
            } else {
                Some(raw)
            }
        } else {
            None
        };

        let extension = if parts.len() >= 4 {
            if let Some((_, ext)) = parts[3].split_once('@') {
                ext
            } else {
                explicit_ext.unwrap_or("jar")
            }
        } else {
            explicit_ext.unwrap_or("jar")
        };

        let filename = if let Some(classifier) = classifier {
            format!("{}-{}-{}.{}", artifact, version, classifier, extension)
        } else {
            format!("{}-{}.{}", artifact, version, extension)
        };

        Some(format!("{}/{}/{}/{}", group, artifact, version, filename))
    }

    /// Resolves the absolute download URL and local relative path for a LibraryItem.
    pub fn resolve_library_urls(lib: &LibraryItem) -> Vec<(String, String, Option<String>, Option<u64>)> {
        // Returns list of tuples: (download_url, relative_path, sha1, size)
        let mut results = Vec::new();
        let os = current_os_name();
        let default_base = get_default_maven_base(&lib.name);

        if let Some(downloads) = &lib.downloads {
            // Main artifact
            if let Some(artifact) = &downloads.artifact {
                let path = artifact
                    .path
                    .clone()
                    .or_else(|| Self::maven_coordinate_to_path(&lib.name));

                if let Some(rel_path) = path {
                    let url = artifact.url.clone().unwrap_or_else(|| {
                        let base = lib.url.as_deref().unwrap_or(default_base);
                        join_maven_url(base, &rel_path)
                    });
                    results.push((url, rel_path, artifact.sha1.clone(), artifact.size));
                }
            }

            // Native classifier for current OS
            if let (Some(natives_map), Some(classifiers)) = (&lib.natives, &downloads.classifiers) {
                if let Some(native_key) = natives_map.get(os) {
                    if let Some(native_art) = classifiers.get(native_key) {
                        let path = native_art
                            .path
                            .clone()
                            .or_else(|| {
                                let coord_with_classifier = format!("{}:{}", lib.name, native_key);
                                Self::maven_coordinate_to_path(&coord_with_classifier)
                            });

                        if let Some(rel_path) = path {
                            let url = native_art.url.clone().unwrap_or_else(|| {
                                let base = lib.url.as_deref().unwrap_or(default_base);
                                join_maven_url(base, &rel_path)
                            });
                            results.push((url, rel_path, native_art.sha1.clone(), native_art.size));
                        }
                    }
                }
            }
        }

        // If downloads was empty, fallback to maven coordinate reconstruction
        if results.is_empty() {
            if let Some(rel_path) = Self::maven_coordinate_to_path(&lib.name) {
                let base = lib.url.as_deref().unwrap_or(default_base);
                let url = join_maven_url(base, &rel_path);
                results.push((url, rel_path, None, None));
            }
        }

        results
    }

    /// Evaluates if a library is allowed on current OS based on rules.
    pub fn is_library_allowed(rules: &Option<Vec<LibraryRule>>) -> bool {
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
}

pub fn current_os_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    }
}

pub fn join_maven_url(base: &str, path: &str) -> String {
    if base.ends_with('/') {
        format!("{}{}", base, path)
    } else {
        format!("{}/{}", base, path)
    }
}

pub fn get_default_maven_base(lib_name: &str) -> &'static str {
    if lib_name.starts_with("net.minecraftforge:") {
        "https://maven.minecraftforge.net/"
    } else if lib_name.starts_with("net.neoforged:") {
        "https://maven.neoforged.net/releases/"
    } else if lib_name.starts_with("net.fabricmc:") {
        "https://maven.fabricmc.net/"
    } else if lib_name.starts_with("org.quiltmc:") {
        "https://maven.quiltmc.org/repository/release/"
    } else if lib_name.starts_with("org.spongepowered:") {
        "https://repo.spongepowered.org/maven/"
    } else {
        "https://libraries.minecraft.net/"
    }
}

