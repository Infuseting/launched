//! Credentials never fall back to plaintext writes when OS protection fails.
use serde::Serialize;
use std::{io::ErrorKind, path::Path, sync::Mutex};

// Serialize migration and access from startup, commands and background requests.
static STORAGE_LOCK: Mutex<()> = Mutex::new(());

pub(super) fn load<T>(
    path: &Path,
    parse: impl Fn(&str) -> Result<T, String>,
) -> Result<Option<T>, String> {
    let _guard = STORAGE_LOCK
        .lock()
        .map_err(|_| "Credential storage lock failed")?;
    if let Some(content) = platform::read(path)? {
        let value = parse(&content)?;
        // A previous migration may have saved the keyring entry but failed to
        // remove the legacy file. Retry cleanup before returning credentials.
        platform::remove_legacy(path)?;
        return Ok(Some(value));
    }
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("Failed to read legacy credentials".into()),
    };
    let content = String::from_utf8(bytes).map_err(|_| "Invalid credential storage encoding")?;
    let value = parse(&content)?;
    // Validate before migration, and only remove plaintext after a successful,
    // verified protected write. A failure preserves the recoverable original.
    platform::write(path, &content)?;
    platform::remove_legacy(path)?;
    Ok(Some(value))
}

pub(super) fn save(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let _guard = STORAGE_LOCK
        .lock()
        .map_err(|_| "Credential storage lock failed")?;
    let content = serde_json::to_string(value).map_err(|_| "Failed to serialize credentials")?;
    platform::write(path, &content)?;
    platform::remove_legacy(path)
}

pub(super) fn clear(path: &Path) -> Result<(), String> {
    let _guard = STORAGE_LOCK
        .lock()
        .map_err(|_| "Credential storage lock failed")?;
    platform::clear(path)
}

#[cfg(windows)]
mod platform {
    use super::*;
    use std::io::Write;
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::Cryptography::{
            CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
        },
    };

    const HEADER: &[u8] = b"LAUNCHED-DPAPI-V1\0";

    fn crypt(bytes: &[u8], protect: bool) -> Result<Vec<u8>, String> {
        let input = CRYPT_INTEGER_BLOB {
            cbData: bytes
                .len()
                .try_into()
                .map_err(|_| "Credential data too large")?,
            pbData: bytes.as_ptr().cast_mut(),
        };
        let mut output = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: std::ptr::null_mut(),
        };
        // SAFETY: input remains alive for the call; optional pointers are null.
        // DPAPI allocates output, which must be released with LocalFree.
        let success = unsafe {
            if protect {
                CryptProtectData(
                    &input,
                    std::ptr::null(),
                    std::ptr::null(),
                    std::ptr::null(),
                    std::ptr::null(),
                    CRYPTPROTECT_UI_FORBIDDEN,
                    &mut output,
                )
            } else {
                CryptUnprotectData(
                    &input,
                    std::ptr::null_mut(),
                    std::ptr::null(),
                    std::ptr::null(),
                    std::ptr::null(),
                    CRYPTPROTECT_UI_FORBIDDEN,
                    &mut output,
                )
            }
        };
        if success == 0 {
            return Err("Windows could not protect or unlock credentials for this user".into());
        }
        // SAFETY: a successful DPAPI call returns cbData initialized bytes.
        let result = unsafe {
            let result = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
            // Clear the decrypted native buffer before releasing it.
            for index in 0..output.cbData as usize {
                std::ptr::write_volatile(output.pbData.add(index), 0);
            }
            LocalFree(output.pbData.cast());
            result
        };
        Ok(result)
    }

    pub(super) fn read(path: &Path) -> Result<Option<String>, String> {
        let bytes = match std::fs::read(path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err("Failed to read protected credentials".into()),
        };
        let Some(encrypted) = bytes.strip_prefix(HEADER) else {
            return Ok(None);
        };
        String::from_utf8(crypt(encrypted, false)?)
            .map(Some)
            .map_err(|_| "Invalid protected credential encoding".into())
    }

    pub(super) fn write(path: &Path, content: &str) -> Result<(), String> {
        let encrypted = crypt(content.as_bytes(), true)?;
        if crypt(&encrypted, false)? != content.as_bytes() {
            return Err("Protected credential verification failed".into());
        }
        let parent = path.parent().ok_or("Invalid credential storage path")?;
        std::fs::create_dir_all(parent).map_err(|_| "Failed to create credential directory")?;
        // Only ciphertext ever reaches the temporary file. Atomic replacement
        // leaves the previous session intact if writing or encryption fails.
        let mut temporary = tempfile::NamedTempFile::new_in(parent)
            .map_err(|_| "Failed to create protected credential file")?;
        temporary
            .write_all(HEADER)
            .and_then(|_| temporary.write_all(&encrypted))
            .and_then(|_| temporary.as_file().sync_all())
            .map_err(|_| "Failed to write protected credentials")?;
        temporary
            .persist(path)
            .map_err(|_| "Failed to replace protected credentials")?;
        Ok(())
    }

    pub(super) fn remove_legacy(_path: &Path) -> Result<(), String> {
        Ok(())
    }

    pub(super) fn clear(path: &Path) -> Result<(), String> {
        match std::fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
            Err(_) => Err("Failed to remove protected credentials".into()),
        }
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    fn parse(content: &str) -> Result<serde_json::Value, String> {
        serde_json::from_str(content).map_err(|_| "Invalid credentials".into())
    }

    #[test]
    fn protects_tokens_and_can_reload_replace_and_clear_the_session() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("accounts.json");
        assert!(load(&path, parse).unwrap().is_none());
        assert!(!path.exists());
        for token in ["first-access-secret", "replacement-access-secret"] {
            let value =
                serde_json::json!({"access_token": token, "refresh_token": "refresh-secret"});
            save(&path, &value).unwrap();
            let stored = std::fs::read(&path).unwrap();
            for secret in [token, "refresh-secret"] {
                assert!(!stored
                    .windows(secret.len())
                    .any(|part| part == secret.as_bytes()));
            }
            assert_eq!(load(&path, parse).unwrap(), Some(value));
        }
        assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 1);
        clear(&path).unwrap();
        clear(&path).unwrap();
        assert!(load(&path, parse).unwrap().is_none());
    }

    #[test]
    fn migrates_plaintext_in_place_before_returning_credentials() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("discord-auth.json");
        let original = r#"{"token":"legacy-discord-secret","user":{"username":"Player"}}"#;
        std::fs::write(&path, original).unwrap();
        let expected = parse(original).unwrap();
        assert_eq!(load(&path, parse).unwrap(), Some(expected.clone()));
        assert_ne!(std::fs::read(&path).unwrap(), original.as_bytes());
        assert_eq!(load(&path, parse).unwrap(), Some(expected));
    }

    #[test]
    fn preserves_invalid_legacy_data_and_keeps_credentials_out_of_errors() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("accounts.json");
        let original = b"{invalid-secret";
        std::fs::write(&path, original).unwrap();
        let error = load(&path, parse).unwrap_err();
        assert!(!error.contains("invalid-secret"));
        assert_eq!(std::fs::read(&path).unwrap(), original);
    }

    #[test]
    fn rejects_tampered_or_truncated_ciphertext_without_replacing_it() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("accounts.json");
        save(&path, &serde_json::json!({"token":"secret"})).unwrap();
        let original = std::fs::read(&path).unwrap();
        let mut tampered = original.clone();
        *tampered.last_mut().unwrap() ^= 1;
        for bytes in [tampered, original[..20].to_vec()] {
            std::fs::write(&path, &bytes).unwrap();
            assert!(load(&path, parse).is_err());
            assert_eq!(std::fs::read(&path).unwrap(), bytes);
        }
    }

    #[test]
    fn failed_replacement_leaves_no_plaintext_or_temporary_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("accounts.json");
        std::fs::create_dir(&path).unwrap();
        assert!(save(&path, &serde_json::json!({"token":"secret"})).is_err());
        assert!(path.is_dir());
        assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 1);
    }
}

#[cfg(not(windows))]
mod platform {
    use super::*;

    fn entry(path: &Path) -> Result<keyring::Entry, String> {
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or("Invalid credential path")?;
        keyring::Entry::new("com.infuseting.launched", name)
            .map_err(|_| "System keyring unavailable".into())
    }

    pub(super) fn read(path: &Path) -> Result<Option<String>, String> {
        match entry(path)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err("Could not unlock credentials in the system keyring".into()),
        }
    }

    pub(super) fn write(path: &Path, content: &str) -> Result<(), String> {
        let entry = entry(path)?;
        entry
            .set_password(content)
            .map_err(|_| "Could not save credentials in the system keyring")?;
        let saved = entry
            .get_password()
            .map_err(|_| "Could not verify protected credentials")?;
        if saved != content {
            return Err("Protected credential verification failed".into());
        }
        Ok(())
    }

    pub(super) fn remove_legacy(path: &Path) -> Result<(), String> {
        match std::fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
            Err(_) => Err("Failed to remove legacy plaintext credentials".into()),
        }
    }

    pub(super) fn clear(path: &Path) -> Result<(), String> {
        // Remove legacy data first so it cannot be imported again after logout.
        remove_legacy(path)?;
        match entry(path)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("Could not remove credentials from the system keyring".into()),
        }
    }
}
