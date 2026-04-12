# Sync Progress Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement real-time progress reporting during file synchronization, showing a progress bar in the UI.

**Architecture:** 
- `SyncService`: Emits Tauri events (`sync-progress`) containing the current file name, files downloaded, total files, and total size progress.
- `main.ts`: Listens for `sync-progress` events and updates the UI (replacing the button with a progress bar).

**Tech Stack:** Rust, Tauri Events, TypeScript, Tailwind CSS.

---

### Task 1: Update SyncService to Emit Events

**Files:**
- Modify: `src-tauri/src/core/sync.rs`

- [ ] **Step 1: Define Progress Payload**

```rust
#[derive(Clone, serde::Serialize)]
struct SyncProgress {
    current_file: String,
    files_done: usize,
    total_files: usize,
    percentage: f64,
}
```

- [ ] **Step 2: Emit events during sync loop**

In `SyncService::sync`, calculate progress and call `window.emit("sync-progress", payload)`.

- [ ] **Step 3: Commit**

Run: `git add src-tauri/src/core/sync.rs && git commit -m "feat: emit sync progress events from rust"`

---

### Task 2: Implement Progress UI in Frontend

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Listen for progress events**

```typescript
import { listen } from "@tauri-apps/api/event";

// Inside syncAndLoad:
const unlisten = await listen("sync-progress", (event) => {
  const payload = event.payload as any;
  updateProgressBar(payload);
});
```

- [ ] **Step 2: Add progress bar UI**

Replace the "Sync & Play" button with a Tailwind-styled progress bar when sync starts.

- [ ] **Step 3: Commit**

Run: `git add src/main.ts && git commit -m "feat: add sync progress bar to frontend"`
