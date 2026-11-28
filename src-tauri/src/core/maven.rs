use std::path::{Component, Path, PathBuf};

/// Validates a relative path from manifests or archives to prevent path traversal (`..`, roots, prefixes).
pub fn validate_relative_path(raw: &str) -> Option<PathBuf> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.contains('\0') || trimmed.contains('\\') {
        return None;
    }

    let mut clean = PathBuf::new();
    for component in Path::new(trimmed).components() {
        match component {
            Component::Normal(part) => clean.push(part),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return None,
        }
    }

    if clean.as_os_str().is_empty() {
        None
    } else {
        Some(clean)
    }
}

/// Validates a Minecraft or modloader version string used in paths and Maven coordinates.
pub fn is_safe_version_segment(value: &str) -> bool {
    let trimmed = value.trim();
    !trimmed.is_empty()
        && trimmed == value
        && !value.contains(['/', '\\', '\0'])
        && !value.contains("..")
        && value != "."
        && !value.chars().any(char::is_whitespace)
}

/// Parses a Maven coordinate (`group:artifact:version[:classifier][@ext]`) into a normalized relative path.
pub fn maven_coordinate_to_path(coord: &str) -> Option<String> {
    let parts: Vec<&str> = coord.split(':').collect();
    if parts.len() < 3 {
        return None;
    }

    let group_raw = parts[0].trim();
    let artifact = parts[1].trim();
    if !is_safe_version_segment(group_raw) || !is_safe_version_segment(artifact) {
        return None;
    }
    let group = group_raw.replace('.', "/");

    let (version, explicit_ext) = if let Some((v, ext)) = parts[2].split_once('@') {
        (v, Some(ext))
    } else {
        (parts[2], None)
    };
    if !is_safe_version_segment(version) {
        return None;
    }

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

    if let Some(c) = classifier {
        if !is_safe_version_segment(c) {
            return None;
        }
    }

    let extension = if parts.len() >= 4 {
        if let Some((_, ext)) = parts[3].split_once('@') {
            ext
        } else {
            explicit_ext.unwrap_or("jar")
        }
    } else {
        explicit_ext.unwrap_or("jar")
    };
    if !is_safe_version_segment(extension) {
        return None;
    }

    let filename = if let Some(classifier) = classifier {
        format!("{}-{}-{}.{}", artifact, version, classifier, extension)
    } else {
        format!("{}-{}.{}", artifact, version, extension)
    };

    let rel = format!("{}/{}/{}/{}", group, artifact, version, filename);
    validate_relative_path(&rel)?;
    Some(rel)
}

pub fn join_maven_url(base: &str, path: &str) -> String {
    if base.ends_with('/') {
        format!("{}{}", base, path)
    } else {
        format!("{}/{}", base, path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_path_traversal_in_maven_coordinates_and_relative_paths() {
        assert_eq!(maven_coordinate_to_path("org.evil:../pwn:1.0"), None);
        assert_eq!(maven_coordinate_to_path("org..evil:art:1.0"), None);
        assert_eq!(validate_relative_path("../secret.jar"), None);
        assert_eq!(validate_relative_path("a/b\\c.jar"), None);
        assert!(validate_relative_path("org/ow2/asm/asm/9.5/asm-9.5.jar").is_some());
    }
}
