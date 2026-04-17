# Material UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the "Launched" launcher from Vanilla TS string templates to a modern React + Shoelace + Framer Motion UI following Material Design 3 principles.

**Architecture:** Use React for UI orchestration, Shoelace for core Material components, and Framer Motion for smooth transitions. A custom React hook will bridge the existing service layer and global state.

**Tech Stack:** React 18+, Shoelace, Framer Motion, Tailwind CSS v4, TypeScript.

---

### Task 1: Environment Setup & Dependencies

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `tsconfig.json`

- [ ] **Step 1: Install React and UI dependencies**
- [ ] **Step 2: Install React dev dependencies**
- [ ] **Step 3: Update Vite configuration**
- [ ] **Step 4: Update TS configuration**
- [ ] **Step 5: Commit environment changes**

### Task 2: State Bridge Hook

**Files:**
- Create: `src/hooks/useLauncherState.ts`
- Modify: `src/state.ts`

- [ ] **Step 1: Update `state.ts` to support change notifications**
- [ ] **Step 2: Create the `useLauncherState` hook**
- [ ] **Step 3: Commit state bridge**

### Task 3: React Entry Point & App Scaffold

**Files:**
- Modify: `src/main.ts`
- Create: `src/App.tsx`
- Create: `src/components/Layout.tsx`

- [ ] **Step 1: Initialize React Root in `main.ts`**
- [ ] **Step 2: Create Main `App` component**
- [ ] **Step 3: Commit scaffold**

### Task 4: Immersive Main Screen (Ultra Clean)

**Files:**
- Create: `src/screens/MainScreen.tsx`
- Create: `src/components/TopBar.tsx`
- Create: `src/components/BottomBar.tsx`

- [ ] **Step 1: Implement `MainScreen` with background handling**
- [ ] **Step 2: Implement `BottomBar` with Play button**
- [ ] **Step 3: Commit Main Screen**

### Task 5: Feature Porting (Settings & Accounts)

**Files:**
- Create: `src/components/SettingsModal.tsx`
- Create: `src/components/AccountSwitcher.tsx`

- [ ] **Step 1: Create `SettingsModal` using Shoelace `<sl-dialog>`**
- [ ] **Step 2: Create `AccountSwitcher` with Framer Motion transitions**
- [ ] **Step 3: Link buttons to existing services (`authService`, `sessionService`)**
- [ ] **Step 4: Commit all ported features**
