# Minecraft & Mod Loader Installation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically download and install Minecraft versions and Mod Loaders (Forge, Fabric, NeoForge) if missing from the official folder.

**Architecture:** 
- `InstallService`: Coordinates downloads of version JSONs, client JARs, and mod loader libraries.
- `AssetResolver`: Logic to download Minecraft assets (sounds, textures) from Mojang.
- Integration with `LaunchService` to trigger installation before launch.

**Tech Stack:** Rust, `reqwest`, `tokio`, `tauri`.

---

### Task 1: Minecraft Base Installation [COMPLETED]

**Files:**
- Create: `src-tauri/src/core/install/mod.rs`
- Create: `src-tauri/src/core/install/mojang.rs`

- [x] **Step 1: Implement Mojang Version Downloader**

Fetch version manifest from `https://launchermeta.mojang.com/mc/game/version_manifest.json` to find the download URL for a specific version.

- [x] **Step 2: Implement Client JAR & JSON Download**

- [x] **Step 3: Commit**

Run: `git add src-tauri/src/core/install && git commit -m "feat: add basic mojang version installation"`

---

### Task 2: Mod Loader Installation (Forge/Fabric)

**Files:**
- Create: `src-tauri/src/core/install/forge.rs`
- Create: `src-tauri/src/core/install/fabric.rs`

- [ ] **Step 1: Implement Forge Library Downloader**

Forge is complex. We'll start with downloading the libraries required by the Forge version specified in `servers.json`.

- [ ] **Step 2: Implement Fabric Metadata Resolver**

- [ ] **Step 3: Commit**

Run: `git add src-tauri/src/core/install && git commit -m "feat: add mod loader installation support"`

---

### Task 3: Integration & UI Feedback

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/core/sync.rs`

- [ ] **Step 1: Trigger installation in `sync_session` command**

Before syncing mods, ensure the base Minecraft version is installed. Emit progress events for "Installing Minecraft...".

- [ ] **Step 2: Commit**

Run: `git add . && git commit -m "feat: integrate installation into sync flow"`
