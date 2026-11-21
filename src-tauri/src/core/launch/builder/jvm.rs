use super::rules::{apply_placeholders, argument_value_strings};
use serde_json::Value;
use std::path::PathBuf;

/// Builder for constructing JVM execution arguments.
pub struct JvmArgsBuilder {
    natives_dir: PathBuf,
    libraries_dir: PathBuf,
    manifest_jvm_args: Vec<Value>,
    min_ram_mb: u64,
    max_ram_mb: u64,
    custom_args: Vec<String>,
    java_major: u8,
    is_forge_or_neoforge: bool,
}

impl JvmArgsBuilder {
    pub fn new(natives_dir: PathBuf, libraries_dir: PathBuf) -> Self {
        Self {
            natives_dir,
            libraries_dir,
            manifest_jvm_args: Vec::new(),
            min_ram_mb: 2048,
            max_ram_mb: 4096,
            custom_args: Vec::new(),
            java_major: 0,
            is_forge_or_neoforge: false,
        }
    }

    pub fn with_manifest_args(mut self, args: Option<Vec<Value>>) -> Self {
        if let Some(a) = args {
            self.manifest_jvm_args = a;
        }
        self
    }

    pub fn with_ram(mut self, min_ram: u32, max_ram: u32) -> Self {
        let min = min_ram as u64;
        let max = max_ram as u64;
        self.min_ram_mb = if min < 64 { min * 1024 } else { min };
        self.max_ram_mb = if max < 64 { max * 1024 } else { max };
        self
    }

    pub fn with_custom_args(mut self, custom: &str) -> Self {
        if !custom.trim().is_empty() {
            self.custom_args = custom
                .split_whitespace()
                .filter(|arg| !arg.starts_with("-Xmx") && !arg.starts_with("-Xms"))
                .map(|s| s.to_string())
                .collect();
        }
        self
    }

    pub fn with_java_major(mut self, major: u8) -> Self {
        self.java_major = major;
        self
    }

    pub fn with_forge_loader(mut self, is_forge: bool) -> Self {
        self.is_forge_or_neoforge = is_forge;
        self
    }

    pub fn build(self) -> Vec<String> {
        let mut jvm_args = Vec::new();

        // 1. Tell JVM where to find native .so/.dll/.dylib files
        jvm_args.push(format!(
            "-Djava.library.path={}",
            self.natives_dir.display()
        ));

        // 2. Include launcher-provided JVM args from manifest with placeholder substitutions
        let cp_sep = if cfg!(windows) { ";" } else { ":" };
        let jvm_placeholders = [
            (
                "${natives_directory}",
                self.natives_dir.to_string_lossy().to_string(),
            ),
            (
                "${library_directory}",
                self.libraries_dir.to_string_lossy().to_string(),
            ),
            ("${classpath_separator}", cp_sep.to_string()),
            ("${launcher_name}", "launched".to_string()),
            ("${launcher_version}", env!("CARGO_PKG_VERSION").to_string()),
        ];

        for raw in &self.manifest_jvm_args {
            for s in argument_value_strings(raw) {
                let resolved = apply_placeholders(&s, &jvm_placeholders);

                // Keep control of classpath and memory flags in the launcher
                if resolved == "-cp"
                    || resolved == "--class-path"
                    || resolved.contains("${classpath}")
                    || resolved.starts_with("-Xmx")
                    || resolved.starts_with("-Xms")
                {
                    continue;
                }

                jvm_args.push(resolved);
            }
        }

        // 3. Memory arguments
        jvm_args.push(format!("-Xms{}M", self.min_ram_mb));
        jvm_args.push(format!("-Xmx{}M", self.max_ram_mb));

        // 4. Custom arguments from settings / session
        jvm_args.extend(self.custom_args);

        // 5. Allow native access & reflection for modern Java runtimes (Java 17+)
        if self.java_major >= 17 {
            jvm_args.push("--enable-native-access=ALL-UNNAMED".to_string());

            if self.is_forge_or_neoforge {
                jvm_args.push("--add-opens=java.base/java.lang.invoke=ALL-UNNAMED".to_string());
                jvm_args.push("--add-opens=java.base/java.util.jar=ALL-UNNAMED".to_string());
            }
        }

        jvm_args
    }
}
