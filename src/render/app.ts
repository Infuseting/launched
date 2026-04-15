import { state } from "../state";
import { 
  toggleServerSelection, 
  toggleSettings, 
  updateServerButton
} from "./ui";

export function renderApp(
  handlers: {
    syncAndLoad: () => Promise<void>;
    fetchAssetMetadata: (index: number) => Promise<void>;
    handleAccountSwap: (uuid: string) => Promise<void>;
    handleAccountRemove: (uuid: string) => Promise<void>;
    handleLoginAdd: () => Promise<void>;
    saveSettings: () => Promise<void>;
  }
) {
  const app = document.querySelector<HTMLDivElement>('#app')!;
  if (state.globalSessions.length === 0) return;
  const activeSession = state.globalSessions[state.activeSessionIndex];

  const bgUrl = activeSession.assetsData?.background || (activeSession.assetsPath && !activeSession.assetsPath.endsWith('.json') ? `${activeSession.assetsPath}/background.png` : '');

  app.innerHTML = `
    <div id="landingContainer" style="${bgUrl ? `background-image: url('${bgUrl}'); background-size: cover; background-position: center;` : ''}">
      <!-- Upper area -->
      <div id="upper">
        <div id="left"></div>
        <div id="content"></div>
        <div id="right">
          <div id="rightContainer">
            <div id="user_content">
              <span id="user_text">${state.authCache ? state.authCache.name : 'No Account Selected'}</span>
              <div id="avatarContainer" ${state.authCache ? `style="background-image: url('https://mc-heads.net/body/${state.authCache.uuid}/right')"` : ''}>
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
                  <div class="ms-status-item"><span class="ms-status-dot" id="dot-auth"></span> Authentication</div>
                  <div class="ms-status-item"><span class="ms-status-dot" id="dot-session"></span> Session & Skins</div>
                  <div class="ms-status-item"><span class="ms-status-dot" id="dot-api"></span> API Services</div>
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

    <!-- Server Selection Overlay -->
    <div id="overlayContainer" style="display: none;">
      <div id="serverSelectContent">
        <span id="serverSelectHeader">Select a Server</span>
        <div id="serverSelectList">
          <div id="serverSelectListScrollable">
            ${state.globalSessions.map((s, i) => `
              <button class="serverListing" data-index="${i}" ${i === state.activeSessionIndex ? 'selected' : ''}>
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
          <div id="serverSelectCancelWrapper"><button id="serverSelectCancel">Cancel</button></div>
        </div>
      </div>
    </div>

    <!-- Settings Overlay -->
    <div id="settingsContainer" style="display: none;">
      <div id="settingsContainerLeft">
        <div id="settingsNavContainer">
          <div id="settingsNavHeader"><span id="settingsNavHeaderText">Settings</span></div>
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
              ${state.allAccounts.map(acc => `
                <div class="settingsAuthAccount settingsAccountItem" data-uuid="${acc.uuid}" style="cursor:pointer; margin-bottom: 10px; border: ${acc.uuid === state.authCache?.uuid ? '2px solid #55aa55' : '1px solid #333'}; padding: 5px;">
                  <div class="settingsAuthAccountLeft">
                    <div class="settingsAuthAccountImage" style="width: 40px; height: 80px; background-color: rgba(255,255,255,0.05); background-image: url('https://mc-heads.net/body/${acc.uuid}/right'); background-size: contain; background-repeat: no-repeat; background-position: center;"></div>
                  </div>
                  <div class="settingsAuthAccountRight">
                    <div class="settingsAuthAccountDetails">
                      <div class="settingsAuthAccountDetailPane">
                        <span class="settingsAuthAccountDetailTitle">USERNAME</span>
                        <span class="settingsAuthAccountDetailValue" style="color: ${acc.uuid === state.authCache?.uuid ? '#55aa55' : '#fff'};">${acc.name}</span>
                      </div>
                    </div>
                    <div class="settingsAuthAccountActions">
                      <button class="settingsAccountRemove settingsAuthAccountLogOut" data-uuid="${acc.uuid}">REMOVE</button>
                    </div>
                  </div>
                </div>
              `).join('')}
              ${state.allAccounts.length === 0 ? `<div style="text-align:center; padding: 20px; opacity: 0.7;">No accounts found.</div>` : ''}
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
                <span class="settingsFieldDesc">Slide to allocate system memory to Minecraft. System Max: ${state.maxSystemRam} MB</span>
              </div>
              <div style="display:flex; align-items:center; flex-direction:column;">
                <input type="range" id="ramSlider" min="1024" max="${state.maxSystemRam}" step="512" value="${(() => {
                  let v = state.currentSettings.maxRam;
                  if (v === 4096 || v === 0) {
                    const s = state.globalSessions[state.activeSessionIndex]?.jvmArg || "";
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
                <input type="text" id="jvmInput" value="${state.currentSettings.jvmArgs || ''}" style="width:300px; padding: 8px; background: rgba(0,0,0,0.5); border: 1px solid #333; color: white;">
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
                <input type="text" id="resInput" value="${state.currentSettings.gameResolution || '400x300'}" style="width:150px; padding: 8px; background: rgba(0,0,0,0.5); border: 1px solid #333; color: white;">
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
                <input type="checkbox" id="showLogsCheckbox" ${state.currentSettings.showLogs ? 'checked' : ''} style="width: 20px; height: 20px; cursor: pointer;">
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
        <p id="updateModalText" style="color: white; font-size: 14px; margin-bottom: 20px;">A new version is available.</p>
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

  // Attach Event Listeners
  const playBtn = document.getElementById('launch_button') as HTMLButtonElement | null;
  if (playBtn) {
    if (!state.authCache) {
      playBtn.style.opacity = '0.5';
      playBtn.style.cursor = 'not-allowed';
      playBtn.title = "Please select or add an account first";
    } else {
      playBtn.style.opacity = '1';
      playBtn.style.cursor = 'pointer';
      playBtn.title = "";
      playBtn.addEventListener('click', handlers.syncAndLoad);
    }
  }

  // Account Swap handling
  document.querySelectorAll('.settingsAccountItem').forEach(el => {
    el.addEventListener('click', async (e) => {
      const target = e.currentTarget as HTMLElement;
      const uuid = target.dataset.uuid;
      if (uuid && uuid !== state.authCache?.uuid) {
        await handlers.handleAccountSwap(uuid);
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
        await handlers.handleAccountRemove(uuid);
      }
    });
  });

  const serverSelBtn = document.getElementById('server_selection_button');
  if (serverSelBtn) {
    serverSelBtn.addEventListener('click', (e) => {
      (e.target as HTMLElement).blur();
      toggleServerSelection(true);
    });
  }

  document.querySelectorAll('.serverListing').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.serverListing').forEach(b => b.removeAttribute('selected'));
      btn.setAttribute('selected', '');
    });
  });

  document.getElementById('serverSelectConfirm')?.addEventListener('click', async () => {
    const selected = document.querySelector('.serverListing[selected]') as HTMLElement;
    if (selected) {
      const idx = parseInt(selected.dataset.index!);
      state.activeSessionIndex = idx;
      updateServerButton();
      await handlers.fetchAssetMetadata(idx);
      renderApp(handlers);
    }
    toggleServerSelection(false);
  });

  document.getElementById('serverSelectCancel')?.addEventListener('click', () => {
    toggleServerSelection(false);
  });

  document.getElementById('settingsMediaButton')?.addEventListener('click', () => {
    toggleSettings(true);
  });
  document.getElementById('avatarOverlay')?.addEventListener('click', () => {
    toggleSettings(true);
  });

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

  document.getElementById('btn-login-add')?.addEventListener('click', handlers.handleLoginAdd);

  document.getElementById('msLoginModalCancel')?.addEventListener('click', () => {
    const modal = document.getElementById('msLoginModal');
    if (modal) modal.style.display = 'none';
  });

  const ramSlider = document.getElementById('ramSlider') as HTMLInputElement;
  const ramDisplay = document.getElementById('ramDisplay') as HTMLElement;
  if (ramSlider && ramDisplay) {
    ramDisplay.innerText = `${ramSlider.value} MB`;
    ramSlider.addEventListener('input', () => {
      ramDisplay.innerText = `${ramSlider.value} MB`;
    });
    ramSlider.addEventListener('change', () => {
      state.currentSettings.maxRam = parseInt(ramSlider.value);
      handlers.saveSettings();
    });
  }

  const jvmInput = document.getElementById('jvmInput') as HTMLInputElement;
  if (jvmInput) {
    jvmInput.addEventListener('change', () => {
      state.currentSettings.jvmArgs = jvmInput.value;
      handlers.saveSettings();
    });
  }

  const resInput = document.getElementById('resInput') as HTMLInputElement;
  if (resInput) {
    resInput.addEventListener('change', () => {
      state.currentSettings.gameResolution = resInput.value;
      handlers.saveSettings();
    });
  }

  const showLogsCheckbox = document.getElementById('showLogsCheckbox') as HTMLInputElement;
  if (showLogsCheckbox) {
    showLogsCheckbox.addEventListener('change', () => {
      state.currentSettings.showLogs = showLogsCheckbox.checked;
      handlers.saveSettings();
    });
  }

  document.getElementById('settingsNavDone')?.addEventListener('click', () => {
    toggleSettings(false);
  });

  const overlay = document.getElementById('overlayContainer');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) toggleServerSelection(false);
    });
  }
}
