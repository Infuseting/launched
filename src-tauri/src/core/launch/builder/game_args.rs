use super::rules::{apply_placeholders, argument_value_strings};
use serde_json::Value;
use std::path::Path;

/// Builder for constructing Minecraft game execution arguments.
pub struct GameArgsBuilder<'a> {
    session_dir: &'a Path,
    assets_dir: &'a Path,
    version_id: &'a str,
    minecraft_version: &'a str,
    asset_index_id: &'a str,
    auth_name: &'a str,
    auth_uuid: &'a str,
    auth_access_token: &'a str,
    game_resolution: &'a str,
    manifest_game_args: Option<&'a Vec<Value>>,
    legacy_minecraft_arguments: Option<&'a str>,
}

impl<'a> GameArgsBuilder<'a> {
    pub fn new(
        session_dir: &'a Path,
        assets_dir: &'a Path,
        version_id: &'a str,
        minecraft_version: &'a str,
        asset_index_id: &'a str,
        auth_name: &'a str,
        auth_uuid: &'a str,
        auth_access_token: &'a str,
        game_resolution: &'a str,
    ) -> Self {
        Self {
            session_dir,
            assets_dir,
            version_id,
            minecraft_version,
            asset_index_id,
            auth_name,
            auth_uuid,
            auth_access_token,
            game_resolution,
            manifest_game_args: None,
            legacy_minecraft_arguments: None,
        }
    }

    pub fn with_manifest_game_args(mut self, args: Option<&'a Vec<Value>>) -> Self {
        self.manifest_game_args = args;
        self
    }

    pub fn with_legacy_minecraft_arguments(mut self, args: Option<&'a str>) -> Self {
        self.legacy_minecraft_arguments = args;
        self
    }

    pub fn build(self) -> Vec<String> {
        let is_offline = self.auth_access_token == "offline";
        let user_type = if is_offline { "mojang".to_string() } else { "msa".to_string() };
        let xuid = if is_offline { "".to_string() } else { self.auth_uuid.replace('-', "") };

        let width = self
            .game_resolution
            .split('x')
            .next()
            .unwrap_or("854")
            .to_string();
        let height = self
            .game_resolution
            .split('x')
            .nth(1)
            .unwrap_or("480")
            .to_string();

        let game_placeholders = [
            ("${auth_player_name}", self.auth_name.to_string()),
            ("${version_name}", self.version_id.to_string()),
            ("${version}", self.minecraft_version.to_string()),
            ("${minecraft_version}", self.minecraft_version.to_string()),
            (
                "${game_directory}",
                self.session_dir.to_string_lossy().to_string(),
            ),
            (
                "${assets_root}",
                self.assets_dir.to_string_lossy().to_string(),
            ),
            (
                "${game_assets}",
                self.assets_dir.to_string_lossy().to_string(),
            ),
            ("${assets_index_name}", self.asset_index_id.to_string()),
            ("${auth_uuid}", self.auth_uuid.to_string()),
            ("${auth_access_token}", self.auth_access_token.to_string()),
            ("${auth_session}", self.auth_access_token.to_string()),
            ("${user_type}", user_type.clone()),
            ("${version_type}", "release".to_string()),
            ("${clientid}", "00000000402b5328".to_string()),
            ("${auth_xuid}", xuid.clone()),
            ("${user_properties}", "{}".to_string()),
            ("${resolution_width}", width.clone()),
            ("${resolution_height}", height.clone()),
        ];

        let mut minecraft_args = Vec::new();

        // 1. Modern manifest format
        if let Some(args) = self.manifest_game_args {
            for raw in args {
                for s in argument_value_strings(raw) {
                    minecraft_args.push(apply_placeholders(&s, &game_placeholders));
                }
            }
        }

        // 2. Legacy single-string manifest format
        if minecraft_args.is_empty() {
            if let Some(arg_line) = self.legacy_minecraft_arguments {
                for raw_token in arg_line.split_whitespace() {
                    let mut token = raw_token.to_string();
                    for (placeholder, value) in &game_placeholders {
                        token = token.replace(placeholder, value);
                    }
                    if token.starts_with('"') && token.ends_with('"') && token.len() >= 2 {
                        token = token[1..token.len() - 1].to_string();
                    }
                    minecraft_args.push(token);
                }
            } else {
                // 3. Fallback arguments
                minecraft_args.push("--username".to_string());
                minecraft_args.push(self.auth_name.to_string());
                minecraft_args.push("--version".to_string());
                minecraft_args.push(self.version_id.to_string());
                minecraft_args.push("--gameDir".to_string());
                minecraft_args.push(self.session_dir.to_string_lossy().to_string());
                minecraft_args.push("--assetsDir".to_string());
                minecraft_args.push(self.assets_dir.to_string_lossy().to_string());
                minecraft_args.push("--assetIndex".to_string());
                minecraft_args.push(self.asset_index_id.to_string());
                minecraft_args.push("--uuid".to_string());
                minecraft_args.push(self.auth_uuid.to_string());
                minecraft_args.push("--accessToken".to_string());
                minecraft_args.push(self.auth_access_token.to_string());
                minecraft_args.push("--userType".to_string());
                minecraft_args.push(user_type.clone());
                minecraft_args.push("--versionType".to_string());
                minecraft_args.push("release".to_string());
                if !xuid.is_empty() {
                    minecraft_args.push("--xuid".to_string());
                    minecraft_args.push(xuid);
                    minecraft_args.push("--clientId".to_string());
                    minecraft_args.push("00000000402b5328".to_string());
                }

                if let Some((w, h)) = self.game_resolution.split_once('x') {
                    minecraft_args.push("--width".to_string());
                    minecraft_args.push(w.to_string());
                    minecraft_args.push("--height".to_string());
                    minecraft_args.push(h.to_string());
                }
            }
        }

        // 4. Guarantee mandatory arguments for incomplete loader profiles
        if !minecraft_args.iter().any(|a| a == "--username") {
            minecraft_args.push("--username".to_string());
            minecraft_args.push(self.auth_name.to_string());
        }
        if !minecraft_args.iter().any(|a| a == "--version") {
            minecraft_args.push("--version".to_string());
            minecraft_args.push(self.version_id.to_string());
        }
        if !minecraft_args.iter().any(|a| a == "--gameDir") {
            minecraft_args.push("--gameDir".to_string());
            minecraft_args.push(self.session_dir.to_string_lossy().to_string());
        }
        if !minecraft_args.iter().any(|a| a == "--assetsDir" || a.starts_with("--assetsDir=")) {
            minecraft_args.push("--assetsDir".to_string());
            minecraft_args.push(self.assets_dir.to_string_lossy().to_string());
        }
        if !minecraft_args.iter().any(|a| a == "--assetIndex" || a.starts_with("--assetIndex=")) {
            minecraft_args.push("--assetIndex".to_string());
            minecraft_args.push(self.asset_index_id.to_string());
        }
        if !minecraft_args.iter().any(|a| a == "--uuid") {
            minecraft_args.push("--uuid".to_string());
            minecraft_args.push(self.auth_uuid.to_string());
        }
        if !minecraft_args.iter().any(|a| a == "--accessToken") {
            minecraft_args.push("--accessToken".to_string());
            minecraft_args.push(self.auth_access_token.to_string());
        }
        if !minecraft_args.iter().any(|a| a == "--userType") {
            minecraft_args.push("--userType".to_string());
            minecraft_args.push(user_type);
        }
        if !minecraft_args.iter().any(|a| a == "--versionType") {
            minecraft_args.push("--versionType".to_string());
            minecraft_args.push("release".to_string());
        }

        // 5. Clean up unwanted demo/quickPlay flags
        minecraft_args.retain(|a| {
            a != "--demo"
                && !a.starts_with("--quickPlay")
                && !a.starts_with("${quickPlay")
        });

        minecraft_args
    }
}
