# Minecraft Launcher (Rust + Tauri) Design Document

**Date:** 2026-04-12  
**Status:** Approved  
**Tech Stack:** Rust, Tauri, Tailwind CSS

## 1. Overview
A high-performance, ultra-optimized Minecraft launcher capable of managing multiple "sessions" (modpacks) with completely dynamic UIs loaded from remote HTML paths.

## 2. Core Features
- **Multi-Session:** Loads session data from `servers.json`. Each session can have a unique UI/UX.
- **Dynamic UI Bridge:** Remote HTML is loaded; the launcher binds core functionality to element IDs (e.g., `#playButton`).
- **Storage Optimization:** Shared `.minecraft/versions` for base JARs; isolated directories for modpacks.
- **MD5 Syncing:** Full synchronization of `syncDir` folders based on server-provided MD5 manifests.
- **Auth Strategy Pattern:** Pluggable authentication (Microsoft, SSO, etc.).
- **Auto-Update:** Self-updating launcher binary.

## 3. Architecture & Standards
- **Pattern:** Strategy pattern for authentication; Service-oriented architecture for core logic (Sync, Launch, Session).
- **Styling:** Tailwind CSS for all UI components.
- **Documentation:** JavaDoc-style comments (using Rust's `///` and `/** */` doc comments) for all public and internal APIs.
- **Principles:** Strict adherence to SOLID and KISS principles.

## 4. UI/UX Strategy
- **Remote Loading:** Launcher loads `htmlPath` from the session JSON.
- **Injection:** A Rust-provided JavaScript bridge is injected into the WebView.
- **Extensibility:** Remote HTML can define new menus or extra features; the launcher provides a flexible API for these via the bridge.
- **Fallback:** A local `index.html` is used if the remote path is unreachable or if no session is active.

## 5. Persistence & Memory
- **`memory.md`:** A dedicated file in the project root to document the current state, architectural decisions, and operational details for future reference and collaborator onboarding.

## 6. Success Criteria
- Startup time < 1 second.
- RAM usage < 100MB (idle).
- 100% accurate file synchronization.
- Seamless session switching without launcher restart.
