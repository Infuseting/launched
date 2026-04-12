# UI Bridge & Frontend Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the frontend shell and implement the dynamic UI bridge to load remote session UIs.

**Architecture:** 
- `main.ts`: Frontend entry point that fetches sessions and manages the current view.
- `bridge.rs`: Rust service to inject event listeners into the WebView.
- `index.html`: The local fallback and initial session selector.

**Tech Stack:** TypeScript, Tauri, Tailwind CSS v4.

---

### Task 1: Frontend Session Selector

**Files:**
- Modify: `src/main.ts`
- Modify: `index.html`

- [x] **Step 1: Implement session fetching and display**

```typescript
import { invoke } from "@tauri-apps/api/core";

async function loadSessions() {
  const sessions = await invoke("get_sessions");
  // Render session list in Tailwind-styled UI.
}
```

- [x] **Step 2: Implement session loading**

When a session is selected:
1. Call `invoke("sync_session", { session })`.
2. Update the window location or load the session's `html_path` into the main WebView.

- [x] **Step 3: Commit**

Run: `git add . && git commit -m "feat: implement frontend session selector"`

---

### Task 2: Advanced UI Bridge

**Files:**
- Modify: `src-tauri/src/ui/bridge.rs`

- [ ] **Step 1: Implement full event bridge**

```rust
pub fn inject_bridge(window: &tauri::WebviewWindow) -> Result<(), String> {
    let script = r#"
        // Map common IDs to Tauri commands
        const idToCommand = {
            'playButton': 'launch_game',
            'sessionSwitcher': 'open_session_switcher',
            'loginButton': 'login_microsoft'
        };
        
        document.addEventListener('click', (e) => {
            const command = idToCommand[e.target.id];
            if (command) {
                window.__TAURI__.invoke(command, { show_logs: true });
            }
        });
    "#;
    window.eval(script).map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Hook into WebView navigation**

In `lib.rs`, listen for `tauri::WindowEvent::Focused` or similar to re-inject the bridge on navigation. Or use `on_navigation`.

- [ ] **Step 3: Commit**

Run: `git add src-tauri/src/ui/bridge.rs && git commit -m "feat: implement advanced ui bridge"`

---

### Task 3: Final Integration & Styling

**Files:**
- Modify: `src/style.css`
- Modify: `index.html`

- [ ] **Step 1: Add Tailwind CSS styling to the fallback UI**

- [ ] **Step 2: Final verification of the full flow**

- [ ] **Step 3: Commit**

Run: `git add . && git commit -m "feat: finalize ui bridge and frontend styling"`
