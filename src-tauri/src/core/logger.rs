use chrono::Local;
use log::{Level, LevelFilter, Log, Metadata, Record};
use std::fs::{self, File, OpenOptions};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

const LATEST_LOG_NAME: &str = "latest.log";
const MAX_ARCHIVED_LOGS: usize = 10;

static LATEST_LOG_PATH: OnceLock<PathBuf> = OnceLock::new();

struct LatestLogger {
    writer: Mutex<BufWriter<File>>,
}

impl LatestLogger {
    fn new(file: File) -> Self {
        Self {
            writer: Mutex::new(BufWriter::new(file)),
        }
    }

    fn should_log(metadata: &Metadata) -> bool {
        let target = metadata.target();
        let is_launcher_target = target.starts_with("app_lib")
            || target.starts_with("app")
            || target.starts_with("frontend")
            || target == "panic";

        if is_launcher_target {
            metadata.level() <= Level::Debug
        } else {
            metadata.level() <= Level::Warn
        }
    }
}

impl Log for LatestLogger {
    fn enabled(&self, metadata: &Metadata) -> bool {
        Self::should_log(metadata)
    }

    fn log(&self, record: &Record) {
        if !self.enabled(record.metadata()) {
            return;
        }

        let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
        let line = format!(
            "[{}] [{:<5}] [{}] {}",
            timestamp,
            record.level(),
            record.target(),
            record.args()
        );

        #[cfg(debug_assertions)]
        eprintln!("{}", line);

        if let Ok(mut guard) = self.writer.lock() {
            let _ = writeln!(guard, "{}", line);
            let _ = guard.flush();
        }
    }

    fn flush(&self) {
        if let Ok(mut guard) = self.writer.lock() {
            let _ = guard.flush();
        }
    }
}

/// Rotates any existing `latest.log` into a timestamped archive, prunes old archives,
/// and opens a fresh `latest.log` for the current launcher run.
pub fn prepare_latest_log_file(log_dir: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(log_dir).map_err(|e| {
        format!(
            "Failed to create log directory {}: {}",
            log_dir.display(),
            e
        )
    })?;

    let latest_path = log_dir.join(LATEST_LOG_NAME);
    if latest_path.exists() {
        let has_content = fs::metadata(&latest_path)
            .map(|m| m.len() > 0)
            .unwrap_or(false);
        if has_content {
            let stamp = Local::now().format("%Y-%m-%d_%H-%M-%S").to_string();
            let mut archive_path = log_dir.join(format!("{}.log", stamp));
            let mut counter = 1u32;
            while archive_path.exists() {
                archive_path = log_dir.join(format!("{}-{}.log", stamp, counter));
                counter += 1;
            }
            if let Err(e) = fs::rename(&latest_path, &archive_path) {
                eprintln!(
                    "[Launched] Could not archive previous latest.log to {}: {}",
                    archive_path.display(),
                    e
                );
            }
        }
    }

    prune_old_archives(log_dir, MAX_ARCHIVED_LOGS);
    Ok(latest_path)
}

fn prune_old_archives(log_dir: &Path, max_keep: usize) {
    let Ok(entries) = fs::read_dir(log_dir) else {
        return;
    };

    let mut archives: Vec<(std::time::SystemTime, PathBuf)> = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            if !path.is_file() {
                return None;
            }
            let name = path.file_name()?.to_str()?;
            if name == LATEST_LOG_NAME || !name.ends_with(".log") {
                return None;
            }
            let modified = entry
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .unwrap_or(std::time::UNIX_EPOCH);
            Some((modified, path))
        })
        .collect();

    if archives.len() <= max_keep {
        return;
    }

    archives.sort_by_key(|entry| std::cmp::Reverse(entry.0));
    for (_, path) in archives.into_iter().skip(max_keep) {
        let _ = fs::remove_file(path);
    }
}

/// Initializes the global `latest.log` logger and installs a panic hook.
pub fn init(log_dir: &Path) -> Result<PathBuf, String> {
    let latest_path = prepare_latest_log_file(log_dir)?;
    let file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&latest_path)
        .map_err(|e| format!("Failed to open {}: {}", latest_path.display(), e))?;

    let _ = LATEST_LOG_PATH.set(latest_path.clone());

    let logger = Box::new(LatestLogger::new(file));
    log::set_boxed_logger(logger)
        .map(|()| log::set_max_level(LevelFilter::Debug))
        .map_err(|e| format!("Failed to register global logger: {}", e))?;

    install_panic_hook();
    Ok(latest_path)
}

fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let thread = std::thread::current();
        let thread_name = thread.name().unwrap_or("unnamed");
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown location".to_string());
        let payload = if let Some(s) = info.payload().downcast_ref::<&str>() {
            (*s).to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "non-string panic payload".to_string()
        };
        let backtrace = std::backtrace::Backtrace::force_capture();

        log::error!(
            target: "panic",
            "Thread '{}' panicked at {}: {}\nBacktrace:\n{}",
            thread_name,
            location,
            payload,
            backtrace
        );
        log::logger().flush();

        previous(info);
    }));
}

pub fn log_frontend_message(level: &str, target: &str, message: &str) {
    let sanitized_target: String = target
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == ':' || c == '.' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let full_target = if sanitized_target.is_empty() {
        "frontend".to_string()
    } else {
        format!("frontend::{}", sanitized_target)
    };

    match level.to_ascii_lowercase().as_str() {
        "error" => log::error!(target: &full_target, "{}", message),
        "warn" | "warning" => log::warn!(target: &full_target, "{}", message),
        "debug" => log::debug!(target: &full_target, "{}", message),
        _ => log::info!(target: &full_target, "{}", message),
    }
}

#[tauri::command]
pub fn log_frontend(level: String, target: String, message: String) {
    log_frontend_message(&level, &target, &message);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn rotates_non_empty_latest_log_and_prunes_old_archives() {
        let base = std::env::temp_dir().join(format!("launched_log_test_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&base).unwrap();

        let latest = base.join(LATEST_LOG_NAME);
        fs::write(&latest, "previous run log\n").unwrap();

        // Seed 12 older archive files with distinct timestamps
        for i in 0..12 {
            let p = base.join(format!("2026-01-01_00-00-{:02}.log", i));
            fs::write(&p, format!("archive {}\n", i)).unwrap();
            std::thread::sleep(Duration::from_millis(5));
        }

        let created = prepare_latest_log_file(&base).unwrap();
        assert_eq!(created, latest);
        assert!(!latest.exists(), "old latest.log should have been rotated");

        let archived_count = fs::read_dir(&base)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|e| {
                let name = e.file_name().to_string_lossy().to_string();
                name != LATEST_LOG_NAME && name.ends_with(".log")
            })
            .count();

        assert_eq!(archived_count, MAX_ARCHIVED_LOGS);
        let _ = fs::remove_dir_all(&base);
    }
}
