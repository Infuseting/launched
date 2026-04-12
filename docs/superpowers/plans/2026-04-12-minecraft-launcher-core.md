# Minecraft Launcher Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a lightweight, high-performance Minecraft launcher using Rust, Tauri, and Tailwind CSS, featuring a dynamic UI bridge and multi-session support.

**Architecture:** A thin Tauri shell that loads remote HTML based on session data. A modular Rust backend handles authentication (Strategy Pattern), file synchronization (MD5-based), and game launching (JVM argument building).

**Tech Stack:** Rust, Tauri v2, Tailwind CSS v4, TypeScript, Vite.

---

### Task 1: Scaffolding (Tauri + Vite + Tailwind)

**Files:**
- Create: `package.json`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`
- Create: `src/index.html`
- Create: `src/main.ts`
- Create: `src/style.css`
- Create: `tailwind.config.js`

- [ ] **Step 1: Scaffold Vite with Vanilla TS**

Run: `npm create vite@latest . -- --template vanilla-ts --yes`
Expected: Success.

- [ ] **Step 2: Add Tailwind CSS**

Run: `npm install -D tailwindcss @tailwindcss/vite`
Create: `src/style.css`
```css
@import "tailwindcss";
```
Create: `vite.config.ts`
```typescript
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
});
```

- [ ] **Step 3: Initialize Tauri**

Run: `npm install @tauri-apps/api @tauri-apps/cli`
Run: `npx tauri init --app-name "launched" --window-title "Launched" --dist-dir "../dist" --dev-path "http://localhost:5173" --before-dev-command "npm run dev" --before-build-command "npm run build"`
Expected: Success.

- [ ] **Step 4: Commit**

Run: `git add . && git commit -m "chore: scaffold tauri + vite + tailwind"`

---

### Task 2: Session & Config Management

**Files:**
- Create: `src-tauri/src/core/session.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Define Session Data Models**

Create: `src-tauri/src/core/session.rs`
```rust
use serde::{Deserialize, Serialize};

/**
 * Represents a session configuration from servers.json.
 */
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
    pub html_path: String,
    pub is_default: bool,
}

/**
 * Handles fetching and managing sessions.
 */
pub struct SessionManager;

impl SessionManager {
    /**
     * Fetches sessions from the remote servers.json URL.
     */
    pub async fn fetch_sessions(url: &str) -> Result<Vec<Session>, String> {
        reqwest::get(url)
            .await
            .map_err(|e| e.to_string())?
            .json::<Vec<Session>>()
            .await
            .map_err(|e| e.to_string())
    }
}
```

- [ ] **Step 2: Add reqwest to Cargo.toml**

Run: `cargo add reqwest --features json,tokio-rustls` (in src-tauri)
Expected: Success.

- [ ] **Step 3: Commit**

Run: `git add src-tauri/src/core/session.rs src-tauri/Cargo.toml && git commit -m "feat: add session data models"`

---

### Task 3: Auth Strategy Pattern

**Files:**
- Create: `src-tauri/src/auth/mod.rs`
- Create: `src-tauri/src/auth/microsoft.rs`

- [ ] **Step 1: Define Auth Strategy Trait**

Create: `src-tauri/src/auth/mod.rs`
```rust
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthResponse {
    pub uuid: String,
    pub name: String,
    pub access_token: String,
}

/**
 * Strategy pattern for authentication.
 */
#[async_trait]
pub trait AuthStrategy {
    /**
     * Performs authentication.
     */
    async fn authenticate(&self) -> Result<AuthResponse, String>;
}
```

- [ ] **Step 2: Add async-trait to Cargo.toml**

Run: `cargo add async-trait` (in src-tauri)

- [ ] **Step 3: Commit**

Run: `git add src-tauri/src/auth/mod.rs src-tauri/Cargo.toml && git commit -m "feat: add auth strategy trait"`

---

### Task 4: Storage & Sync (MD5 & syncDir)

**Files:**
- Create: `src-tauri/src/core/sync.rs`

- [ ] **Step 1: Define Sync Logic**

Create: `src-tauri/src/core/sync.rs`
```rust
use std::path::{Path, PathBuf};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct SyncFile {
    pub path: String,
    pub size: u64,
    pub md5: String,
}

/**
 * Service for synchronizing session files.
 */
pub struct SyncService;

impl SyncService {
    /**
     * Synchronizes a directory based on server manifest.
     */
    pub async fn sync(&self, base_dir: &Path, manifest_url: &str) -> Result<(), String> {
        // Fetch manifest, compare MD5s, download missing/changed, delete extra.
        Ok(())
    }
}
```

- [ ] **Step 2: Commit**

Run: `git add src-tauri/src/core/sync.rs && git commit -m "feat: add sync service skeleton"`

---

### Task 5: Launch Engine (JVM Args)

**Files:**
- Create: `src-tauri/src/core/launch.rs`

- [ ] **Step 1: Define Launch Logic**

Create: `src-tauri/src/core/launch.rs`
```rust
use std::process::Command;

/**
 * Handles building JVM arguments and launching the game.
 */
pub struct LaunchService;

impl LaunchService {
    /**
     * Launches the game process.
     */
    pub fn launch(&self, jvm_args: Vec<String>, show_logs: bool) -> Result<(), String> {
        // Build Command and spawn.
        Ok(())
    }
}
```

- [ ] **Step 2: Commit**

Run: `git add src-tauri/src/core/launch.rs && git commit -m "feat: add launch service skeleton"`

---

### Task 6: UI Bridge (JS Injection)

**Files:**
- Create: `src-tauri/src/ui/bridge.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Define Bridge Logic**

Create: `src-tauri/src/ui/bridge.rs`
```rust
/**
 * Injects a JS bridge into the loaded WebView.
 */
pub fn inject_bridge(window: &tauri::Window) -> Result<(), String> {
    let script = r#"
        document.addEventListener('click', (e) => {
            if (e.target.id === 'playButton') {
                window.__TAURI__.invoke('launch_game');
            }
        });
    "#;
    window.eval(script).map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Commit**

Run: `git add src-tauri/src/ui/bridge.rs && git commit -m "feat: add ui bridge logic"`
