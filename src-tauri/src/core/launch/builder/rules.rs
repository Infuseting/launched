use crate::core::launch::models::LibraryRule;
use serde_json::Value;

/// Returns the current OS name as Minecraft knows it.
pub fn current_os_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    }
}

/// Evaluates library rules to check if it should be included on the current OS.
pub fn library_allowed(rules: &Option<Vec<LibraryRule>>) -> bool {
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

/// Checks whether an argument rule allows this argument.
pub fn argument_rules_allow(arg: &Value) -> bool {
    let Some(rules) = arg.get("rules").and_then(|r| r.as_array()) else {
        return true;
    };

    let os = current_os_name();
    let mut allowed = false;

    for rule in rules {
        let action = rule
            .get("action")
            .and_then(|a| a.as_str())
            .unwrap_or("disallow");

        // 1. Check OS conditions
        let matches_os = if let Some(os_obj) = rule.get("os") {
            let mut ok = true;
            if let Some(name) = os_obj.get("name").and_then(|n| n.as_str()) {
                if name != os {
                    ok = false;
                }
            }
            if let Some(arch) = os_obj.get("arch").and_then(|a| a.as_str()) {
                let current_arch = if cfg!(target_arch = "x86_64") {
                    "x64"
                } else if cfg!(target_arch = "x86") {
                    "x86"
                } else if cfg!(target_arch = "aarch64") {
                    "arm64"
                } else {
                    "unknown"
                };
                if arch != current_arch && arch != "x86" {
                    ok = false;
                }
            }
            ok
        } else {
            true
        };

        // 2. Check Features conditions (Mojang argument flags)
        let matches_features = if let Some(features) = rule.get("features").and_then(|f| f.as_object()) {
            let mut ok = true;
            for (key, val) in features {
                let required = val.as_bool().unwrap_or(false);
                let our_value = match key.as_str() {
                    "is_demo_user" => false, // Launcher never runs demo user
                    "has_custom_resolution" => true,
                    "has_quick_plays_support"
                    | "is_quick_play_singleplayer"
                    | "is_quick_play_multiplayer"
                    | "is_quick_play_realms" => false, // Quick play is not used
                    _ => false,
                };
                if required != our_value {
                    ok = false;
                    break;
                }
            }
            ok
        } else {
            true
        };

        if matches_os && matches_features {
            allowed = action == "allow";
        }
    }

    allowed
}

/// Extracts string arguments from a JSON argument value.
pub fn argument_value_strings(arg: &Value) -> Vec<String> {
    if !argument_rules_allow(arg) {
        return Vec::new();
    }

    let value = arg.get("value").unwrap_or(arg);
    if let Some(s) = value.as_str() {
        return vec![s.to_string()];
    }

    if let Some(arr) = value.as_array() {
        return arr
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect();
    }

    Vec::new()
}

/// Replaces placeholder substrings in an input string.
pub fn apply_placeholders(input: &str, replacements: &[(&str, String)]) -> String {
    let mut out = input.to_string();
    for (needle, value) in replacements {
        out = out.replace(needle, value);
    }
    out
}
