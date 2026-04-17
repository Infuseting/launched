import './assets/tailwind.css';
import './assets/style.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-shell";

import type { SyncProgress } from "./types";
import { state } from "./state";

import * as authService from "./services/auth";
import * as sessionService from "./services/sessions";
import * as settingsService from "./services/settings";
import * as statusService from "./services/status";
import * as updaterService from "./services/updater";

import App from './App';
import { setBasePath } from '@shoelace-style/shoelace/dist/utilities/base-path.js';
import '@shoelace-style/shoelace/dist/themes/dark.css';
import '@shoelace-style/shoelace/dist/shoelace.js';

// Initialize Shoelace
setBasePath('https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.20.1/dist/');

// ─── Sync & Launch ──────────────────────────────────────────────────────────

async function syncAndLoad() {
  if (state.isSyncing || state.globalSessions.length === 0) return;
  const session = state.globalSessions[state.activeSessionIndex];
  state.isSyncing = true;

  // Note: DOM manipulations here should eventually be moved to React state
  // For now, we keep them if they don't break things, but they might need adjustment
  // since we're removing the old DOM structure.

  try {
    if (!state.authCache) {
      let auth = await authService.getAuth();

      if (!auth) {
        const unlistenCode = await listen<any>("ms-device-code", (event) => {
          const { user_code } = event.payload;
          navigator.clipboard.writeText(user_code).catch(() => { });
        });

        try {
          auth = await authService.loginMicrosoft();
          state.authCache = auth;
        } catch (authError) {
          console.error("Auth failed:", authError);
          alert("Microsoft Authentication failed. Please try again.");
          state.isSyncing = false;
          return;
        } finally {
          unlistenCode();
        }
      } else {
        state.authCache = auth;
      }
    }

    state.syncProgress = {
      current_file: "Starting synchronization...",
      files_done: 0,
      total_files: 0,
      percentage: 0
    };

    const unlisten = await listen<SyncProgress>("sync-progress", (event) => {
      state.syncProgress = event.payload;
    });

    try {
      await sessionService.syncSession(session);
    } finally {
      unlisten();
    }

    try {
      const sessionSettings = state.currentSettings.sessions[session.name] || state.currentSettings.defaultSettings;
      await sessionService.launchGame(session, sessionSettings.showLogs);
      setTimeout(() => {
        state.isSyncing = false;
      }, 3000);
    } catch (launchError) {
      console.error("Failed to launch game:", launchError);
      alert(`Failed to launch game: ${launchError}`);
      state.isSyncing = false;
    }
  } catch (error) {
    console.error("Failed to sync or load session:", error);
    alert(`Critical Launch Error: ${error}`);
    state.isSyncing = false;
  }
}

// ─── Status Functions ───────────────────────────────────────────────────────

async function fetchPlayerCount() {
  if (state.globalSessions.length === 0) return;
  const session = state.globalSessions[state.activeSessionIndex];

  if (!session.hostname) return;

  try {
    state.serverStatus = await statusService.fetchServerStatus(session.hostname);
  } catch (err) {
    console.error("Failed to fetch player count:", err);
  }
}

async function pollMojangServices() {
  const [auth, session, api] = await Promise.all([
    statusService.pingService('https://user.auth.xboxlive.com/'),
    statusService.pingService('https://sessionserver.mojang.com/'),
    statusService.pingService('https://api.minecraftservices.com/')
  ]);

  state.mojangStatus = { auth, session, api };
}

// ─── Settings & Sessions ────────────────────────────────────────────────────

async function fetchAssetMetadata(index: number) {
  const session = state.globalSessions[index];
  if (!session || !session.assetsPath || session.assetsData) return;
  try {
    session.assetsData = await sessionService.fetchJson(session.assetsPath);
  } catch (e) {
    console.error(`Failed to fetch assets for ${session.name}:`, e);
  }
}

async function loadSessions() {
  try {
    state.globalSessions = await sessionService.getSessions();
    state.currentSettings = await settingsService.getSettings();
    state.allAccounts = await authService.getAllAccounts();
    try {
      state.maxSystemRam = await settingsService.getSystemRam();
    } catch { state.maxSystemRam = 8192; }

    try {
      state.appVersion = await updaterService.appVersion();
    } catch { state.appVersion = "1.0.0"; }

    try {
      const auth = await authService.getAuth();
      if (auth) {
        state.authCache = auth;
      }
    } catch (e) {
      console.error("Failed to get auth:", e);
    }

    const lastSessionName = await sessionService.getActiveSessionName();
    if (lastSessionName) {
      const index = state.globalSessions.findIndex(s => s.name === lastSessionName);
      if (index !== -1) {
        state.activeSessionIndex = index;
      }
    }

    await fetchAssetMetadata(state.activeSessionIndex);

    // Initialize React Root
    const root = ReactDOM.createRoot(document.getElementById('app')!);
    root.render(
      <React.StrictMode>
        <App handlers={handlers} />
      </React.StrictMode>
    );

    checkForUpdates();

    fetchPlayerCount();
    pollMojangServices();

    if (state.serverStatusInterval) clearInterval(state.serverStatusInterval);
    state.serverStatusInterval = setInterval(() => {
      fetchPlayerCount();
      pollMojangServices();
    }, 30000) as unknown as number;

  } catch (error) {
    console.error("Failed to load sessions:", error);
    document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
      <div style="min-height:100vh;background:#111;display:flex;align-items:center;justify-content:center;padding:2rem;color:white;font-family:Inter,sans-serif">
        <div style="text-align:center;color:#ff4444;border:1px solid rgba(255,0,0,0.3);padding:2rem;border-radius:12px;background:rgba(255,0,0,0.05);max-width:400px">
          <h2 style="font-size:1.5rem;margin-bottom:0.5rem">Error Loading Sessions</h2>
          <p style="opacity:0.8;font-size:0.875rem">${error}</p>
        </div>
      </div>
    `;
  }
}

async function checkForUpdates() {
  state.isCheckingUpdate = true;

  try {
    const update = await updaterService.checkForAppUpdates();
    state.updateManifest = update;
  } catch (e) {
    console.error('Failed to check for updates:', e);
  } finally {
    state.isCheckingUpdate = false;
  }
}

async function performUpdate(update: any, onProgress?: (pct: number) => void) {
  try {
    let downloaded = 0;
    let contentLength = 0;
    await update.downloadAndInstall((event: any) => {
      switch (event.event) {
        case 'Started': contentLength = event.data.contentLength || 0; break;
        case 'Progress':
          downloaded += event.data.chunkLength;
          if (contentLength > 0 && onProgress) {
            onProgress((downloaded / contentLength) * 100);
          }
          break;
      }
    });
    setTimeout(async () => { await updaterService.relaunchApp(); }, 1500);
  } catch (e) {
    alert(`Update failed: ${e}`);
  }
}

const handlers = {
  syncAndLoad,
  fetchAssetMetadata,
  handleAccountSwap: async (uuid: string) => {
    await authService.setActiveAccount(uuid);
    state.authCache = state.allAccounts.find(a => a.uuid === uuid) || null;
  },
  handleAccountRemove: async (uuid: string) => {
    await authService.removeAccount(uuid);
    state.allAccounts = state.allAccounts.filter(a => a.uuid !== uuid);
    if (state.authCache?.uuid === uuid) {
      state.authCache = null;
      await authService.logout();
    }
  },
  handleLoginAdd: async () => {
    try {
      const auth = await authService.loginMicrosoft();
      state.authCache = auth;
      state.allAccounts = await authService.getAllAccounts();
    } catch { alert("Login canceled or failed."); }
  },
  saveSettings: async () => {
    try {
      // Use JSON.parse(JSON.stringify) to ensure we pass a plain object to the backend,
      // bypassing any Proxy-related serialization issues.
      const settings = JSON.parse(JSON.stringify(state.currentSettings));
      await settingsService.saveSettingsInternal(settings);
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
  },
  handleCheckUpdate: async () => {
    await checkForUpdates();
  },
  handleInstallUpdate: async () => {
    if (state.updateManifest) {
      await performUpdate(state.updateManifest);
    }
  },
  handleTabChange: (tabId: string) => {
    state.activeSettingsTab = tabId;
  },
  handleSettingsToggle: (show: boolean) => {
    state.isSettingsOpen = show;
  },
  handleServerSelectToggle: (show: boolean) => {
    state.isServerSelectOpen = show;
  },
  handleSessionSelect: async (index: number) => {
    state.activeSessionIndex = index;
    const session = state.globalSessions[index];
    if (session) {
      await sessionService.setActiveSession(session.name);
    }
    await fetchAssetMetadata(index);
    fetchPlayerCount();
  }
};

// ─── Boot ───────────────────────────────────────────────────────────────────

document.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest('.externalLink') as HTMLElement;
  if (target) {
    const url = target.getAttribute('data-url');
    if (url) open(url);
  }
});

loadSessions();

