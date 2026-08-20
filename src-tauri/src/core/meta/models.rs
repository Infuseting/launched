use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ComponentManifest {
    pub uid: Option<String>,
    pub version: Option<String>,
    pub name: Option<String>,
    #[serde(rename = "type")]
    pub r#type: Option<String>,
    pub order: Option<i32>,
    pub main_class: Option<String>,
    pub applet_class: Option<String>,
    pub asset_index: Option<AssetIndexReference>,
    pub main_jar: Option<LibraryItem>,
    pub libraries: Option<Vec<LibraryItem>>,
    pub maven_files: Option<Vec<LibraryItem>>,
    #[serde(rename = "+jvmArgs")]
    pub plus_jvm_args: Option<Vec<String>>,
    #[serde(rename = "-jvmArgs")]
    pub minus_jvm_args: Option<Vec<String>>,
    #[serde(rename = "+gameArgs")]
    pub plus_game_args: Option<Vec<String>>,
    #[serde(rename = "-gameArgs")]
    pub minus_game_args: Option<Vec<String>>,
    pub minecraft_arguments: Option<String>,
    pub arguments: Option<ComponentArguments>,
    pub traits: Option<Vec<String>>,
    pub requires: Option<Vec<ComponentRequirement>>,
    pub conflicts: Option<Vec<ComponentRequirement>>,
    #[serde(rename = "javaVersion")]
    pub java_version: Option<JavaVersionInfo>,
    pub release_time: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaVersionInfo {
    pub component: Option<String>,
    pub major_version: Option<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetIndexReference {
    pub id: String,
    pub sha1: Option<String>,
    pub size: Option<u64>,
    pub url: Option<String>,
    pub total_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentArguments {
    #[serde(default)]
    pub jvm: Vec<serde_json::Value>,
    #[serde(default)]
    pub game: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentRequirement {
    pub uid: String,
    pub equals: Option<String>,
    pub suggests: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryItem {
    pub name: String,
    pub url: Option<String>,
    pub downloads: Option<LibraryDownloads>,
    pub natives: Option<HashMap<String, String>>,
    pub rules: Option<Vec<LibraryRule>>,
    pub extract: Option<ExtractRule>,
    #[serde(rename = "MMC-hint")]
    pub mmc_hint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryDownloads {
    pub artifact: Option<LibraryArtifact>,
    pub classifiers: Option<HashMap<String, LibraryArtifact>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryArtifact {
    pub path: Option<String>,
    pub url: Option<String>,
    pub sha1: Option<String>,
    pub size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryRule {
    pub action: String,
    pub os: Option<OsCondition>,
    pub features: Option<HashMap<String, bool>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OsCondition {
    pub name: Option<String>,
    pub version: Option<String>,
    pub arch: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractRule {
    pub exclude: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetIndexManifest {
    pub objects: HashMap<String, AssetObject>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetObject {
    pub hash: String,
    pub size: u64,
}
