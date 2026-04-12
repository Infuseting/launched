# Minecraft Launch Engine Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the launch engine to build real JVM arguments and classpath based on Minecraft and Forge versions, utilizing the official `.minecraft/versions` folder.

**Architecture:** 
- `VersionManifest`: Logic to parse Minecraft version JSONs.
- `LaunchService`: Logic to resolve libraries, assets, and main class from version JSONs.
- Forge/Fabric support: Handle custom main classes and extra libraries.

**Tech Stack:** Rust, `serde_json`, `tauri`.

---

### Task 1: Minecraft Version Models

**Files:**
- Create: `src-tauri/src/core/launch/models.rs`

- [ ] **Step 1: Define Minecraft Version JSON models**

Create: `src-tauri/src/core/launch/models.rs`
```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct VersionManifest {
    pub id: String,
    pub mainClass: String,
    pub minecraftArguments: Option<String>,
    pub arguments: Option<Arguments>,
    pub libraries: Vec<Library>,
    pub assetIndex: AssetIndex,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Arguments {
    pub game: Vec<serde_json::Value>,
    pub jvm: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Library {
    pub name: String,
    pub downloads: Option<LibraryDownloads>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LibraryDownloads {
    pub artifact: Option<Artifact>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Artifact {
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AssetIndex {
    pub id: String,
    pub url: String,
}
```

- [ ] **Step 2: Commit**

Run: `git add src-tauri/src/core/launch/models.rs && git commit -m "feat: add minecraft version data models"`

---

### Task 2: Implement Argument Resolution

**Files:**
- Modify: `src-tauri/src/core/launch/args.rs`

- [ ] **Step 1: Implement `from_version_json`**

```rust
impl LaunchArguments {
    pub fn from_session(session: &Session, base_dir: &Path) -> Result<Self, String> {
        // Find .minecraft/versions/<id>/<id>.json.
        // Resolve libraries to full paths in .minecraft/libraries.
        // Add session-specific mods to classpath if needed (or just ensure they're in mods/).
        // Set main class and basic game args.
        Ok(dummy)
    }
}
```

- [ ] **Step 2: Commit**

Run: `git add src-tauri/src/core/launch/args.rs && git commit -m "feat: implement argument resolution logic"`

---

### Task 3: Support Forge/Fabric Main Classes

**Files:**
- Modify: `src-tauri/src/core/launch/args.rs`

- [ ] **Step 1: Detect and handle Forge/Fabric versions**

- [ ] **Step 2: Commit**

Run: `git add src-tauri/src/core/launch/args.rs && git commit -m "feat: support forge/fabric launch arguments"`
