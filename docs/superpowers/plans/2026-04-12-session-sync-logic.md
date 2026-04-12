# Minecraft Launcher Session & Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the logic for managing sessions and synchronizing game files based on remote MD5 manifests.

**Architecture:** 
- `SessionManager`: Fetches and persists session state.
- `SyncService`: Scans local files, compares MD5s with the server manifest, downloads missing/changed files, and cleans up unauthorized files in `syncDir`.

**Tech Stack:** Rust, `reqwest`, `md5`, `tokio`, `serde`, `tauri`.

---

### Task 1: Refine Session Model

**Files:**
- Modify: `src-tauri/src/core/session.rs`

- [ ] **Step 1: Update Session struct for reality**

The live `servers.json` is missing `htmlPath`. We should make it optional or provide a default.

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub name: String,
    pub minecraft: String,
    pub forge: Option<String>,
    pub sync_dir: String,
    pub sync_url: String,
    pub welcome: String,
    pub jvm_arg: String,
    pub credits: String,
    pub html_path: Option<String>, // Made optional
    pub is_default: bool,
}
```

- [ ] **Step 2: Add MD5 dependency**

Run: `cargo add md5` (in src-tauri)

- [ ] **Step 3: Commit**

Run: `git add src-tauri/Cargo.toml src-tauri/src/core/session.rs && git commit -m "feat: refine session model and add md5 dep"`

---

### Task 2: Implement SyncService Logic

**Files:**
- Modify: `src-tauri/src/core/sync.rs`

- [ ] **Step 1: Implement MD5 helper**

```rust
use std::fs::File;
use std::io::{Read, BufReader};

fn calculate_md5(path: &Path) -> Result<String, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut reader = BufReader::new(file);
    let mut context = md5::Context::new();
    let mut buffer = [0; 8192];
    
    loop {
        let count = reader.read(&mut buffer).map_err(|e| e.to_string())?;
        if count == 0 { break; }
        context.consume(&buffer[..count]);
    }
    
    Ok(format!("{:x}", context.compute()))
}
```

- [ ] **Step 2: Implement manifest fetching and parsing**

```rust
impl SyncService {
    pub async fn fetch_manifest(&self, url: &str) -> Result<Vec<SyncFile>, String> {
        reqwest::get(url)
            .await
            .map_err(|e| e.to_string())?
            .json::<Vec<SyncFile>>()
            .await
            .map_err(|e| e.to_string())
    }
}
```

- [ ] **Step 3: Implement directory scanning and comparison**

Implement `sync` method to:
1. Fetch remote manifest.
2. Scan local folders defined in `syncDir`.
3. Build a list of files to download and files to delete.
4. Download files (using `reqwest`).
5. Delete files not in manifest.

- [ ] **Step 4: Commit**

Run: `git add src-tauri/src/core/sync.rs && git commit -m "feat: implement core sync logic"`

---

### Task 3: Integration in Tauri Commands

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Define Tauri commands for session and sync**

```rust
#[tauri::command]
async fn get_sessions() -> Result<Vec<Session>, String> {
    SessionManager::fetch_sessions("https://galade.fr/installateur/servers.json").await
}

#[tauri::command]
async fn sync_session(session: Session, app_handle: tauri::AppHandle) -> Result<(), String> {
    let sync_service = SyncService;
    let base_dir = app_handle.path().app_data_dir().unwrap();
    sync_service.sync(&base_dir, &session.sync_url).await
}
```

- [ ] **Step 2: Register commands**

```rust
.invoke_handler(tauri::generate_handler![get_sessions, sync_session])
```

- [ ] **Step 3: Commit**

Run: `git add src-tauri/src/lib.rs && git commit -m "feat: register session and sync commands"`
