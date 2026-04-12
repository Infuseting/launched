# Minecraft Launch Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the logic for building JVM arguments and launching the Minecraft game process, supporting Forge, Fabric, and Vanilla.

**Architecture:** 
- `LaunchService`: The main engine that constructs the Java command.
- `ArgumentBuilder`: Logic for assembling classpath, native paths, and Minecraft-specific arguments (version, assets, auth).
- Process management to handle "with/without logs" mode.

**Tech Stack:** Rust, `std::process::Command`, `tauri`.

---

### Task 1: Argument Builder Skeleton

**Files:**
- Create: `src-tauri/src/core/launch/args.rs`
- Modify: `src-tauri/src/core/launch.rs`

- [ ] **Step 1: Define Argument Structure**

Create: `src-tauri/src/core/launch/args.rs`
```rust
use std::path::PathBuf;

pub struct LaunchArguments {
    pub java_path: PathBuf,
    pub jvm_args: Vec<String>,
    pub classpath: Vec<PathBuf>,
    pub main_class: String,
    pub minecraft_args: Vec<String>,
}

impl LaunchArguments {
    pub fn build(&self) -> Vec<String> {
        let mut args = self.jvm_args.clone();
        
        // Add classpath
        args.push("-cp".to_string());
        let cp = self.classpath.iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect::<Vec<String>>()
            .join(if cfg!(windows) { ";" } else { ":" });
        args.push(cp);
        
        // Add main class
        args.push(self.main_class.clone());
        
        // Add Minecraft args
        args.extend(self.minecraft_args.clone());
        
        args
    }
}
```

- [ ] **Step 2: Commit**

Run: `git add src-tauri/src/core/launch/args.rs && git commit -m "feat: add launch argument builder skeleton"`

---

### Task 2: Implement LaunchService Process Management

**Files:**
- Modify: `src-tauri/src/core/launch.rs`

- [ ] **Step 1: Implement `launch` with process control**

```rust
use std::process::{Command, Stdio};
use std::path::PathBuf;
use crate::core::launch::args::LaunchArguments;

impl LaunchService {
    pub fn launch(&self, args: LaunchArguments, show_logs: bool) -> Result<(), String> {
        let mut cmd = Command::new(&args.java_path);
        cmd.args(args.build());
        
        if show_logs {
            cmd.stdout(Stdio::inherit())
               .stderr(Stdio::inherit());
            let mut child = cmd.spawn().map_err(|e| e.to_string())?;
            // Optional: wait for it in a separate thread if we want to catch exit code.
        } else {
            cmd.stdout(Stdio::null())
               .stderr(Stdio::null());
            cmd.spawn().map_err(|e| e.to_string())?;
        }
        
        Ok(())
    }
}
```

- [ ] **Step 2: Commit**

Run: `git add src-tauri/src/core/launch.rs && git commit -m "feat: implement launch service process management"`

---

### Task 3: Tauri Command for Launching

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Define `launch_game` command**

```rust
#[tauri::command]
async fn launch_game(session: Session, show_logs: bool) -> Result<(), String> {
    let launch_service = LaunchService;
    // Logic to find Java, build args based on session.minecraft and session.forge.
    // This is where we'd call the ArgBuilder.
    Ok(())
}
```

- [ ] **Step 2: Register command**

```rust
.invoke_handler(tauri::generate_handler![get_sessions, sync_session, launch_game])
```

- [ ] **Step 3: Commit**

Run: `git add src-tauri/src/lib.rs && git commit -m "feat: register launch_game command"`
