import './style.css';
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-shell";

import type { SyncProgress } from "./types";
import { state } from "./state";

import * as authService from "./services/auth";
import * as sessionService from "./services/sessions";
import * as settingsService from "./services/settings";
import * as statusService from "./services/status";
import * as updaterService from "./services/updater";

import { renderApp } from "./render/app";
import { 
  updateUserDisplay, 
  updateMicrosoftStatus, 
  resetLaunchArea
} from "./render/ui";

// ─── Sync & Launch ──────────────────────────────────────────────────────────

async function syncAndLoad() {
  if (state.isSyncing || state.globalSessions.length === 0) return;
  const session = state.globalSessions[state.activeSessionIndex];
  state.isSyncing = true;

  const launchContent = document.getElementById('launch_content')!;
  const launchDetails = document.getElementById('launch_details')!;
  launchContent.style.display = 'none';
  launchDetails.style.display = 'flex';

  const statusEl = document.getElementById('launch_details_text')!;
  const percentEl = document.getElementById('launch_progress_label')!;
  const barEl = document.getElementById('launch_progress') as HTMLProgressElement;

  statusEl.textContent = 'Initializing...';
  percentEl.textContent = '0%';
  barEl.value = 0;

  try {
    if (!state.authCache) {
      statusEl.textContent = 'Looking up Microsoft Login...';
      let auth = await authService.getAuth();

      if (!auth) {
        statusEl.textContent = 'Waiting for Microsoft Login...';
        const unlistenCode = await listen<any>("ms-device-code", (event) => {
          const { user_code, verification_uri } = event.payload;
          statusEl.innerHTML = `Login at <b>${verification_uri}</b> — Code: <b>${user_code}</b>`;
          navigator.clipboard.writeText(user_code).catch(() => { });
        });

        try {
          auth = await authService.loginMicrosoft();
          state.authCache = auth;
          statusEl.textContent = `Welcome, ${auth.name}!`;
          updateUserDisplay();
          updateMicrosoftStatus(true);
          await new Promise(r => setTimeout(r, 1000));
        } catch (authError) {
          console.error("Auth failed:", authError);
          updateMicrosoftStatus(false);
          alert("Microsoft Authentication failed. Please try again.");
          state.isSyncing = false;
          resetLaunchArea();
          return;
        } finally {
          unlistenCode();
        }
      } else {
        state.authCache = auth;
        updateUserDisplay();
        updateMicrosoftStatus(true);
      }
    }

    statusEl.textContent = 'Starting sync...';
    const unlisten = await listen<SyncProgress>("sync-progress", (event) => {
      const { current_file, percentage } = event.payload;
      statusEl.textContent = current_file;
      percentEl.textContent = `${Math.round(percentage)}%`;
      barEl.value = percentage;
    });

    try {
      await sessionService.syncSession(session);
    } finally {
      unlisten();
    }

    percentEl.textContent = '100%';
    barEl.value = 100;
    statusEl.textContent = 'Sync Complete';

    statusEl.textContent = 'Launching game...';
    try {
      await sessionService.launchGame(session, state.currentSettings.showLogs);
      statusEl.textContent = 'Game launched! ✓';
      setTimeout(() => {
        state.isSyncing = false;
        resetLaunchArea();
      }, 3000);
    } catch (launchError) {
      console.error("Failed to launch game:", launchError);
      alert(`Failed to launch game: ${launchError}`);
      state.isSyncing = false;
      resetLaunchArea();
    }
  } catch (error) {
    console.error("Failed to sync or load session:", error);
    alert(`Error: ${error}`);
    state.isSyncing = false;
    resetLaunchArea();
  }
}

// ─── Status Functions ───────────────────────────────────────────────────────

async function fetchPlayerCount() {
  if (state.globalSessions.length === 0) return;
  const session = state.globalSessions[state.activeSessionIndex];
  const countEl = document.getElementById('player_count');
  const tooltipTitle = document.getElementById('mojangStatusTooltipTitle');
  const wrapperEl = document.getElementById('server_status_wrapper');
  const dividerEl = document.getElementById('server_status_divider');

  if (!session.hostname) {
    if (wrapperEl) wrapperEl.style.display = 'none';
    if (dividerEl) dividerEl.style.display = 'none';
    if (countEl) countEl.innerText = '-';
    return;
  }

  if (wrapperEl) wrapperEl.style.display = 'inline-flex';
  if (dividerEl) dividerEl.style.display = 'block';

  try {
    const data = await statusService.fetchServerStatus(session.hostname);
    if (data.online) {
      if (countEl) countEl.innerText = `${data.players.online}/${data.players.max}`;
      if (tooltipTitle) {
        if (data.players.list && data.players.list.length > 0) {
          let listHtml = '<div style="text-align:left;max-height:100px;overflow-y:auto;padding:4px;">';
          data.players.list.forEach((p: any) => { listHtml += `<div>• ${p.name}</div>`; });
          listHtml += '</div>';
          tooltipTitle.innerHTML = `<strong>Online Players:</strong>${listHtml}`;
        } else {
          tooltipTitle.innerHTML = 'Server online but player list hidden';
        }
      }
    } else {
      if (countEl) countEl.innerText = 'OFFLINE';
      if (tooltipTitle) tooltipTitle.innerHTML = 'Server is currently offline.';
    }
  } catch (err) {
    if (countEl) countEl.innerText = 'OFFLINE';
  }
}

async function pollMojangServices() {
  const checkService = async (url: string, dotId: string) => {
    const dot = document.getElementById(dotId);
    if (!dot) return;
    dot.className = 'ms-status-dot ms-status-checking';
    try {
      const isUp = await statusService.pingService(url);
      dot.className = isUp ? 'ms-status-dot ms-status-up' : 'ms-status-dot ms-status-down';
    } catch {
      dot.className = 'ms-status-dot ms-status-down';
    }
  };

  await Promise.all([
    checkService('https://user.auth.xboxlive.com/', 'dot-auth'),
    checkService('https://sessionserver.mojang.com/', 'dot-session'),
    checkService('https://api.minecraftservices.com/', 'dot-api')
  ]);
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
        updateMicrosoftStatus(true);
      } else {
        updateMicrosoftStatus(false);
      }
    } catch (e) {
      updateMicrosoftStatus(false);
    }

    await fetchAssetMetadata(state.activeSessionIndex);
    renderApp(handlers);
    checkForUpdates();
    updateUserDisplay();

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

async function checkForUpdates(silent: boolean = false) {
  state.isCheckingUpdate = true;
  if (!silent) renderApp(handlers);
  
  try {
    const update = await updaterService.checkForAppUpdates();
    state.updateManifest = update;
    
    if (update && !silent) {
       // Only show modal if NOT silent and we found one
       // Actually, we'll let the settings tab handle the display if possible
       // but for backwards compatibility with the existing modal:
       showUpdateModal(update);
    }
  } catch (e) { 
    console.error('Failed to check for updates:', e); 
  } finally {
    state.isCheckingUpdate = false;
    renderApp(handlers);
  }
}

function showUpdateModal(update: any) {
  const modal = document.getElementById('updateModal');
  const text = document.getElementById('updateModalText');
  const installBtn = document.getElementById('btn-update-install');
  const laterBtn = document.getElementById('btn-update-later');
  const progressContainer = document.getElementById('updateProgressContainer');
  const progressBar = document.getElementById('updateProgressBar');

  if (modal && text) {
    text.innerText = `Version ${update.version} is available. \n\n${update.body || ''}`;
    modal.style.display = 'flex';
    if (laterBtn) {
      laterBtn.onclick = () => { if (modal) modal.style.display = 'none'; };
    }
    if (installBtn) {
      installBtn.onclick = async () => {
        if (installBtn) installBtn.style.display = 'none';
        if (laterBtn) laterBtn.style.display = 'none';
        if (progressContainer) progressContainer.style.display = 'block';
        if (text) text.innerText = 'Downloading update...';

        await performUpdate(update, (pct) => {
          if (progressBar) progressBar.style.width = `${pct}%`;
          if (text) text.innerText = `Downloading... ${Math.round(pct)}%`;
        });
      };
    }
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
    renderApp(handlers);
  },
  handleAccountRemove: async (uuid: string) => {
    await authService.removeAccount(uuid);
    state.allAccounts = state.allAccounts.filter(a => a.uuid !== uuid);
    if (state.authCache?.uuid === uuid) {
      state.authCache = null;
      await authService.logout();
    }
    renderApp(handlers);
  },
  handleLoginAdd: async () => {
    const modal = document.getElementById('msLoginModal');
    const textEl = document.getElementById('msLoginModalText');
    if (modal) modal.style.display = 'flex';
    if (textEl) textEl.innerText = "Please wait, contacting Microsoft...";

    const unlisten = await listen<any>("ms-device-code", (event) => {
      const { user_code, verification_uri } = event.payload;
      if (textEl) textEl.innerHTML = `Go to <b><a href="${verification_uri}" target="_blank" style="color:#55aaff;">${verification_uri}</a></b><br><br>Code: <b style="font-size:24px; color:white; letter-spacing: 2px;">${user_code}</b>`;
      navigator.clipboard.writeText(user_code).catch(() => { });
    });

    try {
      const auth = await authService.loginMicrosoft();
      state.authCache = auth;
      state.allAccounts = await authService.getAllAccounts();
      renderApp(handlers);
      updateUserDisplay();
      updateMicrosoftStatus(true);
    } catch { alert("Login canceled or failed."); }
    finally { unlisten(); if (modal) modal.style.display = 'none'; }
  },
  saveSettings: async () => {
    await settingsService.saveSettingsInternal(state.currentSettings);
  },
  handleCheckUpdate: async () => {
    await checkForUpdates(false);
  },
  handleInstallUpdate: async () => {
    if (state.updateManifest) {
      await performUpdate(state.updateManifest);
    }
  },
  handleTabChange: (tabId: string) => {
    state.activeSettingsTab = tabId;
    renderApp(handlers);
  },
  handleSettingsToggle: (show: boolean) => {
    // Import dynamically to avoid circular dependencies if any
    import("./render/ui").then(ui => {
      ui.toggleSettings(show);
      renderApp(handlers);
    });
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
