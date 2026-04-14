import './style.css';
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-shell";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

interface AuthResponse {
  uuid: string;
  name: string;
  access_token: string;
}

interface SyncProgress {
  current_file: string;
  files_done: number;
  total_files: number;
  percentage: number;
}

interface AssetMetadata {
  background: string;
  logo?: string;
  links: { name: string; url: string; icon: string; }[];
}

interface SessionLink {
  name: string;
  url: string;
  icon: string;
}

interface Session {
  name: string;
  minecraft: string;
  forge?: string;
  fabric?: string;
  syncDir: string;
  syncUrl: string;
  welcome: string;
  jvmArg: string;
  credits: string;
  assetsPath?: string;
  hostname?: string;
  isDefault: boolean;
  links?: SessionLink[];
  assetsData?: AssetMetadata;
}

interface AppSettings {
  minRam: number;
  maxRam: number;
  gameResolution: string;
  activeAccountUuid: string | null;
  jvmArgs: string;
  wrapperCommand: string;
  showLogs: boolean;
}

const app = document.querySelector<HTMLDivElement>('#app')!;

let globalSessions: Session[] = [];
let activeSessionIndex = 0;
let isSyncing = false;
let authCache: AuthResponse | null = null;
let currentSettings: AppSettings = {
  minRam: 1024,
  maxRam: 4096,
  gameResolution: "400x300",
  activeAccountUuid: null,
  jvmArgs: "",
  wrapperCommand: "",
  showLogs: false
};

let allAccounts: AuthResponse[] = [];
let maxSystemRam: number = 8192;

let serverStatusInterval: number | null = null;

// ─── Sync & Launch ──────────────────────────────────────────────────────────

async function syncAndLoad() {
  if (isSyncing || globalSessions.length === 0) return;
  const session = globalSessions[activeSessionIndex];
  isSyncing = true;

  // Switch from launch_content to launch_details
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
    // ── Step 1: Auth check ──────────────────────────────────────────
    if (!authCache) {
      statusEl.textContent = 'Looking up Microsoft Login...';
      let auth = await invoke<AuthResponse | null>("get_auth");

      if (!auth) {
        statusEl.textContent = 'Waiting for Microsoft Login...';

        const unlistenCode = await listen<any>("ms-device-code", (event) => {
          const { user_code, verification_uri } = event.payload;
          statusEl.innerHTML = `Login at <b>${verification_uri}</b> — Code: <b>${user_code}</b>`;
          navigator.clipboard.writeText(user_code).catch(() => { });
        });

        try {
          auth = await invoke<AuthResponse>("login_microsoft");
          authCache = auth;
          statusEl.textContent = `Welcome, ${auth.name}!`;
          updateUserDisplay();
          updateMicrosoftStatus(true);
          await new Promise(r => setTimeout(r, 1000));
        } catch (authError) {
          console.error("Auth failed:", authError);
          updateMicrosoftStatus(false);
          alert("Microsoft Authentication failed. Please try again.");
          isSyncing = false;
          resetLaunchArea();
          return;
        } finally {
          unlistenCode();
        }
      } else {
        authCache = auth;
        updateUserDisplay();
        updateMicrosoftStatus(true);
      }
    }

    // ── Step 2: Sync ────────────────────────────────────────────────
    statusEl.textContent = 'Starting sync...';

    const unlisten = await listen<SyncProgress>("sync-progress", (event) => {
      const { current_file, percentage } = event.payload;
      statusEl.textContent = current_file;
      percentEl.textContent = `${Math.round(percentage)}%`;
      barEl.value = percentage;
    });

    (window as any).__LAUNCHED_CURRENT_SESSION__ = session;

    try {
      await invoke("sync_session", { session });
    } finally {
      unlisten();
    }

    percentEl.textContent = '100%';
    barEl.value = 100;
    statusEl.textContent = 'Sync Complete';

    // ── Step 3: Launch Process ─────────────────────────────────
    statusEl.textContent = 'Launching game...';
    try {
      await invoke("launch_game", { session, showLogs: currentSettings.showLogs });
      statusEl.textContent = 'Game launched! ✓';
      setTimeout(() => {
        isSyncing = false;
        resetLaunchArea();
      }, 3000);
    } catch (launchError) {
      console.error("Failed to launch game:", launchError);
      alert(`Failed to launch game: ${launchError}`);
      isSyncing = false;
      resetLaunchArea();
    }
  } catch (error) {
    console.error("Failed to sync or load session:", error);
    alert(`Error: ${error}`);
    isSyncing = false;
    resetLaunchArea();
  }
}

function resetLaunchArea() {
  const launchContent = document.getElementById('launch_content');
  const launchDetails = document.getElementById('launch_details');
  if (launchContent) launchContent.style.display = 'inline-flex';
  if (launchDetails) launchDetails.style.display = 'none';
}

// ─── Settings & Integrations ────────────────────────────────────────────────

async function fetchPlayerCount() {
  if (globalSessions.length === 0) return;
  const session = globalSessions[activeSessionIndex];
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
    const res = await fetch(`https://api.mcsrvstat.us/3/${session.hostname}`);
    if (!res.ok) throw new Error("Status API fail");
    const data = await res.json();

    if (data.online) {
      if (countEl) countEl.innerText = `${data.players.online}/${data.players.max}`;
      if (tooltipTitle) {
        if (data.players.list && data.players.list.length > 0) {
          let listHtml = '<div style="text-align:left;max-height:100px;overflow-y:auto;padding:4px;">';
          data.players.list.forEach((p: any) => {
            listHtml += `<div>• ${p.name}</div>`;
          });
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

function updateMicrosoftStatus(isOk: boolean) {
  const icon = document.getElementById('ms_status_icon');
  if (icon) {
    icon.style.color = isOk ? '#4caf50' : '#f44336';
  }
}

async function pollMojangServices() {
  const checkService = async (url: string, dotId: string) => {
    const dot = document.getElementById(dotId);
    if (!dot) return;

    // Set checking state
    dot.className = 'ms-status-dot ms-status-checking';

    try {
      const isUp = await invoke<boolean>("ping_service", { url });
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


async function loadSettings() {
  try {
    currentSettings = await invoke<AppSettings>("get_settings");
  } catch (e) {
    console.warn("Failed to load settings from Rust", e);
  }
}

async function saveSettings(settings: AppSettings) {
  currentSettings = settings;
  try {
    await invoke("save_settings", { settings });
  } catch (e) {
    console.error("Failed to save settings", e);
  }
}

// ─── Load sessions ──────────────────────────────────────────────────────────

async function loadSessions() {
  try {
    const sessions = await invoke<Session[]>("get_sessions");
    globalSessions = sessions;
    await loadSettings();
    allAccounts = await invoke<AuthResponse[]>("get_all_accounts");
    try {
      maxSystemRam = await invoke<number>("get_system_ram");
    } catch { maxSystemRam = 8192; }

    // Check for active auth before rendering
    try {
      const auth = await invoke<AuthResponse | null>("get_auth");
      if (auth) {
        authCache = auth;
        updateMicrosoftStatus(true);
      } else {
        updateMicrosoftStatus(false);
      }
    } catch (e) {
      console.warn("Auth check failed:", e);
      updateMicrosoftStatus(false);
    }

    // Load assets for initial session if available
    await fetchAssetMetadata(activeSessionIndex);

    renderApp();
    checkForUpdates();
    updateUserDisplay();

    // Start periodic tasks
    fetchPlayerCount();
    pollMojangServices();

    if (serverStatusInterval) clearInterval(serverStatusInterval);
    serverStatusInterval = setInterval(() => {
      fetchPlayerCount();
      pollMojangServices();
    }, 30000) as unknown as number;

  } catch (error) {
    console.error("Failed to load sessions:", error);
    app.innerHTML = `
      <div style="min-height:100vh;background:#111;display:flex;align-items:center;justify-content:center;padding:2rem;color:white;font-family:Inter,sans-serif">
        <div style="text-align:center;color:#ff4444;border:1px solid rgba(255,0,0,0.3);padding:2rem;border-radius:12px;background:rgba(255,0,0,0.05);max-width:400px">
          <h2 style="font-size:1.5rem;margin-bottom:0.5rem">Error Loading Sessions</h2>
          <p style="opacity:0.8;font-size:0.875rem">${error}</p>
        </div>
      </div>
    `;
  }
}

// ─── Update user display ────────────────────────────────────────────────────

function updateUserDisplay() {
  const userText = document.getElementById('user_text');
  if (userText) {
    userText.textContent = authCache ? authCache.name : 'No Account Selected';
  }
  // Update avatar if we have uuid
  const avatarContainer = document.getElementById('avatarContainer');
  if (avatarContainer) {
    avatarContainer.style.backgroundImage = authCache ? `url('https://mc-heads.net/body/${authCache.uuid}/right')` : 'none';
  }
}

// ─── Update server selection button ─────────────────────────────────────────

function updateServerButton() {
  const btn = document.getElementById('server_selection_button');
  if (btn && globalSessions.length > 0) {
    btn.innerHTML = '&#8226; ' + globalSessions[activeSessionIndex].name;
    fetchPlayerCount();
  }
}

async function fetchAssetMetadata(index: number) {
  const session = globalSessions[index];
  if (!session || !session.assetsPath || session.assetsData) return;

  try {
    // Invoke Rust command to bypass CORS
    const data = await invoke<AssetMetadata>("fetch_json", { url: session.assetsPath });
    session.assetsData = data;
    console.log(`Assets loaded for ${session.name}`);
  } catch (e) {
    console.error(`Failed to fetch assets for ${session.name}:`, e);
  }
}

// ─── Render the main app ────────────────────────────────────────────────────

function renderApp() {
  if (globalSessions.length === 0) return;
  const activeSession = globalSessions[activeSessionIndex];

  const bgUrl = activeSession.assetsData?.background || (activeSession.assetsPath && !activeSession.assetsPath.endsWith('.json') ? `${activeSession.assetsPath}/background.png` : '');

  app.innerHTML = `
    <div id="landingContainer" style="${bgUrl ? `background-image: url('${bgUrl}'); background-size: cover; background-position: center;` : ''}">
      <!-- Upper area -->
      <div id="upper">
        <div id="left">
          <!-- Top Left Avatar Area (Removed by request) -->
        </div>
        <div id="content"></div>
        <div id="right">
          <div id="rightContainer">
            <div id="user_content">
              <span id="user_text">${authCache ? authCache.name : 'No Account Selected'}</span>
              <div id="avatarContainer" ${authCache ? `style="background-image: url('https://mc-heads.net/body/${authCache.uuid}/right')"` : ''}>
                <button id="avatarOverlay">SETTINGS</button>
              </div>
            </div>
            <div id="mediaContent">
              <div id="internalMedia">
                <div class="mediaContainer" id="settingsMediaContainer">
                  <button class="mediaButton" id="settingsMediaButton">
                    <svg id="settingsSVG" viewBox="0 0 24 24">
                      <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97s-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1s.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.58 1.69-.98l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64L19.43 12.97z"
                        stroke="white" fill="none" stroke-width="1.5"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div class="mediaDivider"></div>
              <div id="externalMedia">
                ${(activeSession.assetsData?.links || activeSession.links || []).map(link => {
                  let iconUrl = link.icon;
                  // If it's not a URL and we have assetsPath (legacy)
                  if (!iconUrl.startsWith('http') && activeSession.assetsPath && !activeSession.assetsPath.endsWith('.json')) {
                    iconUrl = `${activeSession.assetsPath}/${link.icon}`;
                  }
                  
                  return `
                    <div class="mediaContainer">
                      <button class="mediaButton externalLink" data-url="${link.url}" title="${link.name}">
                        ${iconUrl.startsWith('http') || iconUrl.startsWith('data:') ? `<img src="${iconUrl}" class="mediaSVG" style="filter: brightness(0) invert(1);" />` : `<span style="font-size:10px">${link.name}</span>`}
                      </button>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Lower bar -->
      <div id="lower">
        <div id="left">
          <div class="bot_wrapper">
            <div id="content">
              <div id="server_status_wrapper" class="tooltip-container">
                <span class="bot_label" id="landingPlayerLabel">PLAYERS</span>
                <span id="player_count">WAIT...</span>
                <div class="hover-tooltip player-tooltip">
                  <div id="mojangStatusTooltipTitle">Loading players...</div>
                </div>
              </div>
              <div class="bot_divider" id="server_status_divider"></div>
              <div id="mojangStatusWrapper" class="tooltip-container">
                <span class="bot_label">MS STATUS</span>
                <span id="ms_status_icon">&#8226;</span>
                <div class="hover-tooltip ms-status-tooltip">
                  <div class="ms-status-header">Microsoft Services</div>
                  <div class="ms-status-item">
                    <span class="ms-status-dot" id="dot-auth"></span> Authentication
                  </div>
                  <div class="ms-status-item">
                    <span class="ms-status-dot" id="dot-session"></span> Session & Skins
                  </div>
                  <div class="ms-status-item">
                    <span class="ms-status-dot" id="dot-api"></span> API Services
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div id="right">
          <div class="bot_wrapper">
            <div id="launch_content">
              <button id="launch_button">PLAY</button>
              <div class="bot_divider"></div>
              <button id="server_selection_button" class="bot_label">&#8226; ${activeSession.name}</button>
            </div>
            <div id="launch_details">
              <div id="launch_details_left">
                <span id="launch_progress_label">0%</span>
                <div class="bot_divider"></div>
              </div>
              <div id="launch_details_right">
                <progress id="launch_progress" value="0" max="100"></progress>
                <span id="launch_details_text" class="bot_label">Please wait...</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Server Selection Overlay (hidden by default) -->
    <div id="overlayContainer" style="display: none;">
      <div id="serverSelectContent">
        <span id="serverSelectHeader">Select a Server</span>
        <div id="serverSelectList">
          <div id="serverSelectListScrollable">
            ${globalSessions.map((s, i) => `
              <button
                class="serverListing"
                data-index="${i}"
                ${i === activeSessionIndex ? 'selected' : ''}
              >
                <div class="serverListingIcon">⚡</div>
                <div class="serverListingDetails">
                  <span class="serverListingName">${s.name}</span>
                  <div class="serverListingInfo">
                    <span class="serverListingVersion">${s.minecraft}</span>
                    ${s.forge ? `<span class="serverListingVersion" style="background:rgba(200,120,0,0.8);margin-left:4px">${s.forge}</span>` : ''}
                    ${s.isDefault ? '<span class="serverListingStarWrapper">★</span>' : ''}
                  </div>
                  <span class="serverListingDescription">${s.welcome ? s.welcome.substring(0, 60) + (s.welcome.length > 60 ? '...' : '') : ''}</span>
                </div>
              </button>
            `).join('')}
          </div>
        </div>
        <div id="serverSelectActions">
          <button id="serverSelectConfirm">SELECT</button>
          <div id="serverSelectCancelWrapper">
            <button id="serverSelectCancel">Cancel</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Settings Overlay -->
    <div id="settingsContainer" style="display: none;">
      <div id="settingsContainerLeft">
        <div id="settingsNavContainer">
          <div id="settingsNavHeader">
            <span id="settingsNavHeaderText">Settings</span>
          </div>
          <div id="settingsNavItemsContainer">
            <div id="settingsNavItemsContent">
              <button class="settingsNavItem" data-tab="account" selected>Account</button>
              <button class="settingsNavItem" data-tab="minecraft">Minecraft</button>
              <div class="settingsNavSpacer"></div>
              <div id="settingsNavContentBottom">
                <div class="settingsNavDivider"></div>
                <button id="settingsNavDone">DONE</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div id="settingsContainerRight">
        
        <!-- Account Tab -->
        <div id="tab-account" class="settingsTab">
          <div class="settingsTabHeader">
            <span class="settingsTabHeaderText">Account Management</span>
            <span class="settingsTabHeaderDesc">Manage your authenticated Microsoft account.</span>
          </div>
          
          <div class="settingsAuthAccountTypeContainer">
            <div class="settingsCurrentAccounts">
              ${allAccounts.map(acc => `
                <div class="settingsAuthAccount settingsAccountItem" data-uuid="${acc.uuid}" style="cursor:pointer; margin-bottom: 10px; border: ${acc.uuid === authCache?.uuid ? '2px solid #55aa55' : '1px solid #333'}; padding: 5px;">
                  <div class="settingsAuthAccountLeft">
                    <div class="settingsAuthAccountImage" style="width: 40px; height: 80px; background-color: rgba(255,255,255,0.05); background-image: url('https://mc-heads.net/body/${acc.uuid}/right'); background-size: contain; background-repeat: no-repeat; background-position: center;"></div>
                  </div>
                  <div class="settingsAuthAccountRight">
                    <div class="settingsAuthAccountDetails">
                      <div class="settingsAuthAccountDetailPane">
                        <span class="settingsAuthAccountDetailTitle">USERNAME</span>
                        <span class="settingsAuthAccountDetailValue" style="color: ${acc.uuid === authCache?.uuid ? '#55aa55' : '#fff'};">${acc.name}</span>
                      </div>
                    </div>
                    <div class="settingsAuthAccountActions">
                      <button class="settingsAccountRemove settingsAuthAccountLogOut" data-uuid="${acc.uuid}">REMOVE</button>
                    </div>
                  </div>
                </div>
              `).join('')}
              ${allAccounts.length === 0 ? `<div style="text-align:center; padding: 20px; opacity: 0.7;">No accounts found.</div>` : ''}
              
              <div style="margin-top: 20px; display: flex; justify-content: center;">
                <button class="settingsAuthAccountSelect" style="opacity:1" id="btn-login-add">ADD ACCOUNT</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Minecraft Tab -->
        <div id="tab-minecraft" class="settingsTab" style="display:none;">
          <div class="settingsTabHeader">
            <span class="settingsTabHeaderText">Minecraft Settings</span>
            <span class="settingsTabHeaderDesc">Modify game options such as memory and resolution.</span>
          </div>

          <div id="settingsMemoryContainer">
            <div id="settingsMemoryTitle">Java Memory (RAM)</div>
            <div id="settingsMemoryContent">
              <div class="settingsFieldLeft">
                <span class="settingsFieldTitle">Maximum Memory (MB)</span>
                <span class="settingsFieldDesc">Slide to allocate system memory to Minecraft. System Max: ${maxSystemRam} MB</span>
              </div>
              <div style="display:flex; align-items:center; flex-direction:column;">
                <input type="range" id="ramSlider" min="1024" max="${maxSystemRam}" step="512" value="${(() => {
      let v = currentSettings.maxRam;
      if (v === 4096 || v === 0) {
        const s = globalSessions[activeSessionIndex]?.jvmArg || "";
        const m1 = s.match(/-Xmx(\d+)[mM]/); if (m1) v = parseInt(m1[1]);
        const m2 = s.match(/-Xmx(\d+)[gG]/); if (m2) v = parseInt(m2[1]) * 1024;
      }
      return v;
    })()}" style="width:200px; margin-bottom: 8px;">
                <span id="ramDisplay" style="font-weight:bold; font-size: 14px;">...</span>
              </div>
            </div>
          </div>

          <div class="settingsNavDivider" style="margin: 20px 0;"></div>

          <div id="settingsJVMContainer">
            <div id="settingsMemoryTitle">Java Arguments</div>
            <div id="settingsMemoryContent">
              <div class="settingsFieldLeft">
                <span class="settingsFieldTitle">JVM Arguments</span>
                <span class="settingsFieldDesc">Custom parameters to pass to the Java runtime.</span>
              </div>
              <div style="display:flex; align-items:center;">
                <input type="text" id="jvmInput" value="${currentSettings.jvmArgs || ''}" style="width:300px; padding: 8px; background: rgba(0,0,0,0.5); border: 1px solid #333; color: white;">
              </div>
            </div>
          </div>

          <div class="settingsNavDivider" style="margin: 20px 0;"></div>

          <div id="settingsResContainer">
            <div id="settingsMemoryTitle">Game Resolution</div>
            <div id="settingsMemoryContent">
              <div class="settingsFieldLeft">
                <span class="settingsFieldTitle">Game Window Size</span>
                <span class="settingsFieldDesc">Set the default width and height of the Minecraft window (e.g., 1920x1080).</span>
              </div>
              <div style="display:flex; align-items:center;">
                <input type="text" id="resInput" value="${currentSettings.gameResolution || '400x300'}" style="width:150px; padding: 8px; background: rgba(0,0,0,0.5); border: 1px solid #333; color: white;">
              </div>
            </div>
          </div>

          <div class="settingsNavDivider" style="margin: 20px 0;"></div>

          <div id="settingsLogContainer" style="margin-bottom: 20px;">
            <div id="settingsMemoryTitle">Developer & Support</div>
            <div id="settingsMemoryContent">
              <div class="settingsFieldLeft">
                <span class="settingsFieldTitle">Show Game Logs</span>
                <span class="settingsFieldDesc">Display a console overlay when launching the game.</span>
              </div>
              <div style="display:flex; align-items:center;">
                <input type="checkbox" id="showLogsCheckbox" ${currentSettings.showLogs ? 'checked' : ''} style="width: 20px; height: 20px; cursor: pointer;">
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>

    <!-- Microsoft Login Modal -->
    <div id="msLoginModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 1000; align-items: center; justify-content: center; flex-direction: column;">
      <div style="background: #222; padding: 30px; border-radius: 8px; text-align: center; border: 1px solid #444; max-width: 400px; box-shadow: 0 4px 15px rgba(0,0,0,0.5);">
        <h2 style="margin-top: 0; color: white;">Microsoft Login</h2>
        <p id="msLoginModalText" style="color: white; font-size: 16px;">Please wait...</p>
        <p style="font-size: 12px; color: #4CAF50; margin-top: 20px;">Code has been copied to your clipboard. Paste it in your browser.</p>
        <button id="msLoginModalCancel" style="margin-top: 15px; padding: 8px 16px; background: #444; color: white; border: none; border-radius: 4px; cursor: pointer;">Hide Modal</button>
      </div>
    </div>

    <!-- Update Modal -->
    <div id="updateModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 2000; align-items: center; justify-content: center; flex-direction: column;">
      <div style="background: #222; padding: 30px; border-radius: 8px; text-align: center; border: 1px solid #4CAF50; max-width: 450px; box-shadow: 0 4px 25px rgba(76,175,80,0.2);">
        <h2 style="margin-top: 0; color: white;">Update Available!</h2>
        <p id="updateModalText" style="color: white; font-size: 14px; margin-bottom: 20px;">A new version of Charged is available.</p>
        <div id="updateProgressContainer" style="display: none; width: 100%; height: 6px; background: #333; border-radius: 3px; margin-bottom: 20px; overflow: hidden;">
          <div id="updateProgressBar" style="width: 0%; height: 100%; background: #4CAF50; transition: width 0.3s ease;"></div>
        </div>
        <div style="display: flex; gap: 10px; justify-content: center;">
          <button id="btn-update-install" style="padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Update Now</button>
          <button id="btn-update-later" style="padding: 10px 20px; background: #444; color: white; border: none; border-radius: 4px; cursor: pointer;">Later</button>
        </div>
      </div>
    </div>
  `;

  // Apply Background using assetsPath
  if (activeSession.assetsPath) {
    app.style.backgroundImage = `url('${activeSession.assetsPath}/background.png')`;
    app.style.backgroundSize = 'cover';
    app.style.backgroundPosition = 'center';
  } else {
    app.style.backgroundImage = 'none';
  }

  // ── Attach Event Listeners ──────────────────────────────────────

  const playBtn = document.getElementById('launch_button') as HTMLButtonElement | null;
  if (playBtn) {
    if (!authCache) {
      playBtn.style.opacity = '0.5';
      playBtn.style.cursor = 'not-allowed';
      playBtn.title = "Please select or add an account first";
    } else {
      playBtn.style.opacity = '1';
      playBtn.style.cursor = 'pointer';
      playBtn.title = "";
      playBtn.addEventListener('click', syncAndLoad);
    }
  }

  // Account Swap handling
  document.querySelectorAll('.settingsAccountItem').forEach(el => {
    el.addEventListener('click', async (e) => {
      const target = e.currentTarget as HTMLElement;
      const uuid = target.dataset.uuid;
      if (uuid && uuid !== authCache?.uuid) {
        await invoke("set_active_account", { uuid });
        authCache = allAccounts.find(a => a.uuid === uuid) || null;
        renderApp();
      }
    });
  });

  // Account Remove handling
  document.querySelectorAll('.settingsAccountRemove').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const target = e.currentTarget as HTMLElement;
      const uuid = target.dataset.uuid;
      if (uuid) {
        await invoke("remove_account", { uuid });
        allAccounts = allAccounts.filter(a => a.uuid !== uuid);
        if (authCache?.uuid === uuid) {
          authCache = null;
          await invoke("logout");
        }
        renderApp();
      }
    });
  });

  // Server selection button (bottom bar)
  const serverSelBtn = document.getElementById('server_selection_button');
  if (serverSelBtn) {
    serverSelBtn.addEventListener('click', (e) => {
      (e.target as HTMLElement).blur();
      toggleServerSelection(true);
    });
  }

  // Overlay: server listings
  document.querySelectorAll('.serverListing').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.serverListing').forEach(b => b.removeAttribute('selected'));
      btn.setAttribute('selected', '');
    });
  });

  // Overlay: confirm
  const confirmBtn = document.getElementById('serverSelectConfirm');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      const selected = document.querySelector('.serverListing[selected]') as HTMLElement;
      if (selected) {
        const idx = parseInt(selected.dataset.index!);
        activeSessionIndex = idx;
        updateServerButton();
        
        // Load assets for new session
        await fetchAssetMetadata(idx);
        renderApp();
      }
      toggleServerSelection(false);
    });
  }

  // Overlay: cancel
  const cancelBtn = document.getElementById('serverSelectCancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      toggleServerSelection(false);
    });
  }

  // Settings: open
  document.getElementById('settingsMediaButton')?.addEventListener('click', () => {
    toggleSettings(true);
  });
  document.getElementById('avatarOverlay')?.addEventListener('click', () => {
    toggleSettings(true);
  });

  // Settings: External Link Open
  document.getElementById('discordURL')?.addEventListener('click', (e) => {
    e.preventDefault();
    open('https://discord.com'); // example external link
  });

  // Settings: Tabs
  document.querySelectorAll('.settingsNavItem').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.settingsNavItem').forEach(b => b.removeAttribute('selected'));
      (e.target as HTMLElement).setAttribute('selected', '');

      const tabId = (e.target as HTMLElement).dataset.tab;
      document.querySelectorAll('.settingsTab').forEach(tab => {
        (tab as HTMLElement).style.display = 'none';
      });
      document.getElementById(`tab-${tabId}`)!.style.display = 'block';
    });
  });

  // Add a new Account
  document.getElementById('btn-login-add')?.addEventListener('click', async () => {
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
      const auth = await invoke<AuthResponse>("login_microsoft");
      authCache = auth;
      allAccounts = await invoke<AuthResponse[]>("get_all_accounts");
      renderApp();
      updateUserDisplay();
      updateMicrosoftStatus(true);
    } catch {
      alert("Login canceled or failed.");
    } finally {
      unlisten();
      if (modal) modal.style.display = 'none';
    }
  });

  document.getElementById('msLoginModalCancel')?.addEventListener('click', () => {
    const modal = document.getElementById('msLoginModal');
    if (modal) modal.style.display = 'none';
  });

  // Settings: Inputs
  const ramSlider = document.getElementById('ramSlider') as HTMLInputElement;
  const ramDisplay = document.getElementById('ramDisplay') as HTMLElement;
  if (ramSlider && ramDisplay) {
    ramDisplay.innerText = `${ramSlider.value} MB`;
    ramSlider.addEventListener('input', () => {
      ramDisplay.innerText = `${ramSlider.value} MB`;
    });
    ramSlider.addEventListener('change', () => {
      currentSettings.maxRam = parseInt(ramSlider.value);
      saveSettings(currentSettings);
    });
  }

  const jvmInput = document.getElementById('jvmInput') as HTMLInputElement;
  if (jvmInput) {
    jvmInput.addEventListener('change', () => {
      currentSettings.jvmArgs = jvmInput.value;
      saveSettings(currentSettings);
    });
  }

  const resInput = document.getElementById('resInput') as HTMLInputElement;
  if (resInput) {
    resInput.addEventListener('change', () => {
      currentSettings.gameResolution = resInput.value;
      saveSettings(currentSettings);
    });
  }

  const showLogsCheckbox = document.getElementById('showLogsCheckbox') as HTMLInputElement;
  if (showLogsCheckbox) {
    showLogsCheckbox.addEventListener('change', () => {
      currentSettings.showLogs = showLogsCheckbox.checked;
      saveSettings(currentSettings);
    });
  }

  // Settings: Close
  document.getElementById('settingsNavDone')?.addEventListener('click', () => {
    toggleSettings(false);
  });

  // Global close
  const overlay = document.getElementById('overlayContainer');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) toggleServerSelection(false);
    });
  }

  // Auto-refresh status data after render
  fetchPlayerCount();
  pollMojangServices();
}

// ─── Toggle Modals ────────────────────────────────────────

function toggleServerSelection(show: boolean) {
  const overlay = document.getElementById('overlayContainer');
  if (!overlay) return;
  if (show) {
    document.querySelectorAll('.serverListing').forEach(btn => {
      const idx = parseInt((btn as HTMLElement).dataset.index!);
      if (idx === activeSessionIndex) {
        btn.setAttribute('selected', '');
      } else {
        btn.removeAttribute('selected');
      }
    });
    overlay.style.display = 'flex';
  } else {
    overlay.style.display = 'none';
  }
}

function toggleSettings(show: boolean) {
  const settings = document.getElementById('settingsContainer');
  const landing = document.getElementById('landingContainer');
  if (!settings || !landing) return;

  if (show) {
    landing.style.opacity = '0';
    setTimeout(() => {
      landing.style.display = 'none';
      settings.style.display = 'flex';
      // tiny reflow delay
      setTimeout(() => settings.style.opacity = '1', 50);
    }, 250);
  } else {
    settings.style.opacity = '0';
    setTimeout(() => {
      settings.style.display = 'none';
      landing.style.display = 'flex';
      setTimeout(() => landing.style.opacity = '1', 50);
    }, 250);
  }
}

async function checkForUpdates() {
  try {
    const update = await check();
    if (update) {
      console.log(`Update available: ${update.version}`);
      const modal = document.getElementById('updateModal');
      const text = document.getElementById('updateModalText');
      const installBtn = document.getElementById('btn-update-install');
      const laterBtn = document.getElementById('btn-update-later');
      const progressContainer = document.getElementById('updateProgressContainer');
      const progressBar = document.getElementById('updateProgressBar');

      if (modal && text) {
        text.innerText = `Version ${update.version} is available. \n\n${update.body || ''}`;
        modal.style.display = 'flex';

        laterBtn?.addEventListener('click', () => {
          modal.style.display = 'none';
        });

        installBtn?.addEventListener('click', async () => {
          if (installBtn) installBtn.style.display = 'none';
          if (laterBtn) laterBtn.style.display = 'none';
          if (progressContainer) progressContainer.style.display = 'block';
          if (text) text.innerText = 'Downloading update...';

          try {
            let downloaded = 0;
            let contentLength = 0;

            await update.downloadAndInstall((event) => {
              switch (event.event) {
                case 'Started':
                  contentLength = event.data.contentLength || 0;
                  console.log(`started downloading ${contentLength} bytes`);
                  break;
                case 'Progress':
                  downloaded += event.data.chunkLength;
                  if (contentLength > 0 && progressBar) {
                    const pct = (downloaded / contentLength) * 100;
                    progressBar.style.width = `${pct}%`;
                  }
                  break;
                case 'Finished':
                  console.log('download finished');
                  break;
              }
            });

            if (text) text.innerText = 'Update installed! Restarting...';
            setTimeout(async () => {
              await relaunch();
            }, 2000);

          } catch (e) {
            console.error('Update failed:', e);
            if (text) text.innerText = `Update failed: ${e}`;
            if (laterBtn) laterBtn.style.display = 'block';
          }
        });
      }
    }
  } catch (e) {
    console.error('Failed to check for updates:', e);
  }
}

// ─── Boot ───────────────────────────────────────────────────────────────────

// Handle dynamic external links
app.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest('.externalLink') as HTMLElement;
  if (target) {
    const url = target.getAttribute('data-url');
    if (url) open(url);
  }
});

loadSessions();
