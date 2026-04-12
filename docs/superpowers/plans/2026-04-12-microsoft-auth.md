# Microsoft Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the multi-step Microsoft authentication flow to retrieve a valid Minecraft access token and player profile.

**Architecture:** 
- `MicrosoftAuth`: Concrete implementation of `AuthStrategy`.
- Support for Device Code Flow (for simplicity in this initial implementation).
- Data models for Microsoft, Xbox Live, and Minecraft API responses.

**Tech Stack:** Rust, `reqwest`, `serde`, `tauri`.

---

### Task 1: Microsoft Auth Models

**Files:**
- Create: `src-tauri/src/auth/microsoft/models.rs`

- [ ] **Step 1: Define Microsoft & Xbox API models**

Create: `src-tauri/src/auth/microsoft/models.rs`
```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct DeviceCodeResponse {
    pub user_code: String,
    pub device_code: String,
    pub verification_uri: String,
    pub expires_in: u32,
    pub interval: u32,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MicrosoftTokenResponse {
    pub access_token: String,
    pub refresh_token: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct XboxLiveResponse {
    pub Token: String,
    pub DisplayClaims: DisplayClaims,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DisplayClaims {
    pub xui: Vec<Xui>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Xui {
    pub uhs: String,
}
```

- [ ] **Step 2: Commit**

Run: `git add src-tauri/src/auth/microsoft/models.rs && git commit -m "feat: add microsoft auth data models"`

---

### Task 2: Implement Microsoft Flow Logic

**Files:**
- Modify: `src-tauri/src/auth/microsoft.rs`

- [ ] **Step 1: Implement Token Exchange steps**

```rust
impl MicrosoftAuth {
    async fn get_device_code(&self) -> Result<DeviceCodeResponse, String> { /* ... */ }
    async fn poll_for_token(&self, device_code: &str) -> Result<MicrosoftTokenResponse, String> { /* ... */ }
    async fn get_xbl_token(&self, ms_token: &str) -> Result<XboxLiveResponse, String> { /* ... */ }
    async fn get_xsts_token(&self, xbl_token: &str) -> Result<XboxLiveResponse, String> { /* ... */ }
    async fn get_mc_token(&self, xsts_token: &str, uhs: &str) -> Result<String, String> { /* ... */ }
}
```

- [ ] **Step 2: Complete `authenticate` method**

- [ ] **Step 3: Commit**

Run: `git add src-tauri/src/auth/microsoft.rs && git commit -m "feat: implement microsoft auth flow logic"`

---

### Task 3: Tauri Integration for Auth

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Define `login_microsoft` command**

```rust
#[tauri::command]
async fn login_microsoft() -> Result<AuthResponse, String> {
    let auth = MicrosoftAuth;
    auth.authenticate().await
}
```

- [ ] **Step 2: Register command**

```rust
.invoke_handler(tauri::generate_handler![get_sessions, sync_session, launch_game, login_microsoft])
```

- [ ] **Step 3: Commit**

Run: `git add src-tauri/src/lib.rs && git commit -m "feat: register login_microsoft command"`
