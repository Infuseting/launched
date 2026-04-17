# Spec: Material Design UI Redesign (React + Shoelace + Framer Motion)

**Date:** 2026-04-16  
**Topic:** UI Modernization & Framework Migration  
**Status:** Draft

## Overview
Redesign the current "Launched" Minecraft launcher UI into a modern, immersive "Ultra Clean" Material Design 3 (M3) experience. The project will migrate from Vanilla TS + String Templates to a React-based architecture using Shoelace for UI components and Framer Motion for animations.

## Goals
- **Immersive Visuals:** Large server-specific background images with minimal UI overlay.
- **Material Design 3:** Adoption of M3 principles (rounded corners, expressive action buttons, clear hierarchy).
- **Modern Stack:** React 18/19, Shoelace, Framer Motion, and Tailwind CSS v4.
- **Functional Parity:** Maintain all existing features: server selection, account management (Microsoft), RAM settings, and launch progress.

## Design
### Layout: "Ultra Clean"
- **Top Bar:** Translucent overlay containing user profile (left) and settings icon (right).
- **Center:** Unobstructed view of the server's background artwork.
- **Bottom Action Area:** 
  - Centered server info (Name and Online Players).
  - Large, prominent "PLAY" button with a Material-inspired shadow and hover motion.
  - No news or Minecraft version labels to maintain focus.

### Components (Shoelace & Custom)
- **Buttons:** Shoelace `<sl-button>` or custom components with M3 styling.
- **Modals:** Shoelace `<sl-dialog>` for settings and account management.
- **Progress:** Modern Material-style progress bar for sync/launch status.
- **Theming:** Support for dynamic colors extracted from server backgrounds (future enhancement).

## Technical Architecture
### Frameworks & Libraries
- **React:** UI orchestration and component lifecycle.
- **Framer Motion:** Smooth transitions between screens (Main -> Settings) and interactive button feedback.
- **Shoelace:** Core Material components (Buttons, Modals, Inputs).
- **Tailwind CSS v4:** Layout utilities, spacing, and custom Material-themed utility classes.

### State Integration
- **Legacy Service Layer:** Maintain `src/services/*.ts` as the source of truth for Tauri `invoke` calls.
- **Launcher Hook:** Create a `useLauncherState` custom hook to bridge the existing `state.ts` (proxied or observable) with React.
- **Event Listeners:** Move Tauri event listeners (sync-progress, game-log) into React `useEffect` hooks.

### File Structure Changes
- **Deprecated:** `src/render/app.ts` and `src/render/ui.ts`.
- **New:**
  - `src/components/`: Reusable React components (Button, Progress, Avatar).
  - `src/screens/`: High-level views (MainScreen, SettingsScreen, AccountScreen).
  - `src/hooks/`: State and event bridge hooks.
  - `src/App.tsx`: Main entry component.

## Implementation Plan (Summary)
1. **Scaffolding:** Install dependencies and set up the React root in `main.ts`.
2. **Base Layout:** Implement the immersive background wrapper and top/bottom bar structure.
3. **Service Bridge:** Build the state hook to sync existing launcher logic with React.
4. **Feature Migration:**
   - Account Management (Microsoft Login & Switcher).
   - Server Selection Overlay.
   - Settings (RAM, JVM args).
   - Sync & Launch (Progress bar & Log handling).
5. **Polishing:** Add Framer Motion transitions and final M3 styling adjustments.

## Success Criteria
- [ ] No regression in core launcher functionality.
- [ ] Smooth 60fps animations for transitions.
- [ ] Visually consistent with the "Ultra Clean" M3 mockup.
- [ ] Codebase is easier to maintain and extend compared to the string template approach.
