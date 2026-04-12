# Project Memory: Minecraft Launcher (Rust + Tauri)

## 1. Project Context
This project is a high-performance, multi-session Minecraft launcher built with Rust and Tauri. It aims to be ultra-optimized in terms of startup speed, RAM usage, and disk storage.

## 2. Architectural Decisions
- **Framework:** Tauri for a lightweight, secure WebView-based UI.
- **Styling:** Tailwind CSS for all frontend components.
- **UI Logic:** Remote HTML loading from a session-specific `htmlPath`.
- **Bridge Pattern:** A Rust-injected JavaScript bridge binds element IDs (e.g., `#playButton`) to Tauri commands.
- **Storage:** Shared `.minecraft/versions` for common JARs; modpack-specific files are stored separately.
- **Syncing:** MD5-based file synchronization for folders defined in `syncDir`.
- **Auth:** Strategy pattern to support multiple authentication methods (Microsoft, SSO, etc.).

## 3. Engineering Standards
- **Coding:** Rust for the backend, focusing on safety and performance.
- **Style:** SOLID and KISS principles; Javadoc-style documentation comments (`///` and `/** */`).
- **Maintainability:** Modular architecture with dedicated services for each core function.

## 4. Current State
- [2026-04-12] Design document finalized and approved.
- [2026-04-12] Project memory initialized.
- [2026-04-12] Project scaffolded (Tauri + Vite + Tailwind CSS v4).
- [2026-04-12] Session management implemented (fetch `servers.json`).
- [2026-04-12] Sync service implemented (MD5-based directory sync with cleanup).
- [2026-04-12] Launch engine implemented (real argument resolution and process management).
- [2026-04-12] Microsoft authentication implemented (full token exchange flow).
- [2026-04-12] UI Bridge implemented (dynamic ID-based injection for remote HTML).
- [2026-04-12] Frontend session selector implemented.
- [2026-04-12] Core launcher features completed and verified.

## 5. Known Constraints
- Remote HTML must be reachable or fallback to a local default.
- `servers.json` is the source of truth for all sessions.
- Invalid session configurations (e.g., both Forge and Fabric) must be logged and handled gracefully.
