import { state } from "../state";
import { 
  toggleServerSelection, 
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
    handleCheckUpdate: () => Promise<void>;
    handleInstallUpdate: () => Promise<void>;
    handleTabChange: (tabId: string) => void;
    handleSettingsToggle: (show: boolean) => void;
  }
) {
  const app = document.querySelector<HTMLDivElement>('#app')!;
  if (state.globalSessions.length === 0) return;
  const activeSession = state.globalSessions[state.activeSessionIndex];

  const bgUrl = activeSession.assetsData?.background || (activeSession.assetsPath && !activeSession.assetsPath.endsWith('.json') ? `${activeSession.assetsPath}/background.png` : '');

  app.innerHTML = `
    <div id="landingContainer" style="${bgUrl ? `background-image: url('${bgUrl}'); background-size: cover; background-position: center;` : ''}; display: ${state.isSettingsOpen ? 'none' : 'flex'}; opacity: ${state.isSettingsOpen ? '0' : '1'};">
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
    <div id="settingsContainer" style="display: ${state.isSettingsOpen ? 'flex' : 'none'}; opacity: ${state.isSettingsOpen ? '1' : '0'}; ${bgUrl ? `background-image: url('${bgUrl}'); background-size: cover; background-position: center;` : ''}">
      <div id="settingsContainerLeft">
        <span id="settingsNavHeaderText">Settings</span>
        <div id="settingsNavItemsContent">
          <button class="settingsNavItem" data-tab="account" ${state.activeSettingsTab === 'account' ? 'selected' : ''}>Account</button>
          <button class="settingsNavItem" data-tab="minecraft" ${state.activeSettingsTab === 'minecraft' ? 'selected' : ''}>Minecraft</button>
          <button class="settingsNavItem" data-tab="mods" ${state.activeSettingsTab === 'mods' ? 'selected' : ''}>Mods</button>
          <button class="settingsNavItem" data-tab="java" ${state.activeSettingsTab === 'java' ? 'selected' : ''}>Java</button>
          <button class="settingsNavItem" data-tab="launcher" ${state.activeSettingsTab === 'launcher' ? 'selected' : ''}>Launcher</button>
          <div class="settingsNavDivider"></div>
          <button class="settingsNavItem" data-tab="about" ${state.activeSettingsTab === 'about' ? 'selected' : ''}>About</button>
          <button class="settingsNavItem" data-tab="updates" ${state.activeSettingsTab === 'updates' ? 'selected' : ''}>Updates</button>
        </div>
        <div id="settingsNavContentBottom">
          <button id="settingsNavDone">Done</button>
        </div>
      </div>
      <div id="settingsContainerRight">
        <!-- Account Tab -->
        <div id="tab-account" class="settingsTab" style="display:${state.activeSettingsTab === 'account' ? 'block' : 'none'};">
          <div class="settingsTabHeader">
            <span class="settingsTabHeaderText">Account Management</span>
            <span class="settingsTabHeaderDesc">Manage your authenticated Microsoft accounts.</span>
          </div>
          <div class="settingsCurrentAccounts">
            ${state.allAccounts.map(acc => `
              <div class="settingsAuthAccount settingsAccountItem" data-uuid="${acc.uuid}" style="cursor:pointer; margin-bottom: 12px; border: ${acc.uuid === state.authCache?.uuid ? '1px solid var(--accent-green)' : '1px solid var(--glass-border)'}; padding: 15px; border-radius: 4px; background: rgba(255,255,255,0.03);">
                <div style="display:flex; align-items:center;">
                  <div style="width: 40px; height: 40px; border-radius: 50%; background-image: url('https://mc-heads.net/avatar/${acc.uuid}'); background-size: cover; margin-right: 15px;"></div>
                  <div style="flex:1;">
                    <div style="font-weight:700; color:${acc.uuid === state.authCache?.uuid ? 'var(--accent-green)' : 'white'}">${acc.name}</div>
                    <div style="font-size:10px; color:rgba(255,255,255,0.4)">${acc.uuid === state.authCache?.uuid ? 'ACTIVE ACCOUNT' : 'STORED ACCOUNT'}</div>
                  </div>
                  <button class="settingsAccountRemove" data-uuid="${acc.uuid}" style="background:none; border:none; color:rgba(255,255,255,0.2); cursor:pointer; font-size:10px; font-weight:700;">REMOVE</button>
                </div>
              </div>
            `).join('')}
            <div style="margin-top: 30px; display: flex; justify-content: center;">
              <button class="settingsFileButton" id="btn-login-add" style="background:var(--accent-green); color:black; font-weight:900; letter-spacing:1px;">ADD ACCOUNT</button>
            </div>
          </div>
        </div>

        <!-- Java Tab -->
        <div id="tab-java" class="settingsTab" style="display:${state.activeSettingsTab === 'java' ? 'block' : 'none'};">
          <div class="settingsTabHeader">
            <span class="settingsTabHeaderText">Java Settings</span>
            <span class="settingsTabHeaderDesc">Manage the Java configuration (advanced).</span>
          </div>

          <div class="settingsSection">
            <div class="settingsSectionTitle">Memory</div>
            <div class="settingsSeparator"></div>
            
            <div style="display:flex;">
              <div style="flex:1;">
                <div class="settingsSliderRow">
                  <span class="settingsSliderLabel">Maximum RAM</span>
                  <div class="slider-container">
                    <input type="range" class="premium-slider" id="maxRamSlider" min="1024" max="${state.maxSystemRam}" step="512" value="${state.currentSettings.maxRam}">
                    <span class="slider-value" id="maxRamDisplay">${(state.currentSettings.maxRam / 1024).toFixed(1)}G</span>
                  </div>
                </div>

                <div class="settingsSliderRow">
                  <span class="settingsSliderLabel">Minimum RAM</span>
                  <div class="slider-container">
                    <input type="range" class="premium-slider" id="minRamSlider" min="512" max="${state.maxSystemRam}" step="512" value="${state.currentSettings.minRam || 1024}">
                    <span class="slider-value" id="minRamDisplay">${((state.currentSettings.minRam || 1024) / 1024).toFixed(1)}G</span>
                  </div>
                </div>
              </div>

              <div class="settingsStatsContainer">
                <div class="settingsStatItem">
                  <span class="settingsStatLabel">Total</span>
                  <span class="settingsStatValue">${(state.maxSystemRam / 1024).toFixed(1)}G</span>
                </div>
              </div>
            </div>

            <p class="settingsHelpText">
              The recommended minimum RAM is 3 gigabytes. Setting the minimum and maximum values to the same value may reduce lag.
            </p>
          </div>

          <div class="settingsSection">
            <div class="settingsSectionTitle">Java Executable</div>
            <div class="settingsFilePicker">
              <div class="settingsFileIcon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
              </div>
              <div class="settingsFilePath" id="javaExecPathDisplay">${state.currentSettings.wrapperCommand || 'Default (Auto-detected)'}</div>
              <button class="settingsFileButton">Choose File</button>
            </div>
            <p class="settingsHelpText">
              The Java executable is validated before game launch. Requires Java ${activeSession.minecraft.split('.')[1] === '17' || activeSession.minecraft.startsWith('1.18') ? '17' : '8'} x64.
            </p>
          </div>

          <div class="settingsSection">
            <div class="settingsSectionTitle">Additional JVM Options</div>
            <textarea class="settingsTextArea" id="jvmArgsInput" placeholder="-XX:+UseG1GC ...">${state.currentSettings.jvmArgs || ''}</textarea>
          </div>
        </div>

        <!-- Placeholder Tabs -->
        <!-- Minecraft Tab -->
        <div id="tab-minecraft" class="settingsTab" style="display:${state.activeSettingsTab === 'minecraft' ? 'block' : 'none'};">
          <div class="settingsTabHeader">
            <span class="settingsTabHeaderText">Minecraft Settings</span>
            <span class="settingsTabHeaderDesc">General game configuration.</span>
          </div>
          <div style="opacity:0.5; padding:40px; text-align:center;">General Minecraft settings coming soon.</div>
        </div>
        
        <div id="tab-mods" class="settingsTab" style="display:${state.activeSettingsTab === 'mods' ? 'block' : 'none'};">
          <div class="settingsTabHeader">
            <span class="settingsTabHeaderText">Mod Management</span>
            <span class="settingsTabHeaderDesc">Enable or disable specific modifications.</span>
          </div>
          <div style="opacity:0.5; padding:40px; text-align:center;">Mod management is automatically handled by the server profile.</div>
        </div>

        <div id="tab-launcher" class="settingsTab" style="display:${state.activeSettingsTab === 'launcher' ? 'block' : 'none'};">
          <div class="settingsTabHeader">
            <span class="settingsTabHeaderText">Launcher Settings</span>
            <span class="settingsTabHeaderDesc">Configure the launcher behavior and appearance.</span>
          </div>
          <div class="settingsSection">
             <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <div style="font-weight:700;">Show Console Logs</div>
                  <div style="font-size:12px; color:rgba(255,255,255,0.4);">Open a log window when the game starts.</div>
                </div>
                <input type="checkbox" id="showLogsCheckbox" ${state.currentSettings.showLogs ? 'checked' : ''} style="width:20px; height:20px;">
             </div>
          </div>
        </div>

        <div id="tab-updates" class="settingsTab" style="display:${state.activeSettingsTab === 'updates' ? 'block' : 'none'};">
          <div class="settingsTabHeader">
            <span class="settingsTabHeaderText">Updates</span>
            <span class="settingsTabHeaderDesc">Manage launcher updates and see what's new.</span>
          </div>
          <div class="settingsSection">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <div style="font-size:12px; color:rgba(255,255,255,0.4); text-transform:uppercase; letter-spacing:1px; margin-bottom:5px;">Current Version</div>
                <div style="font-size:18px; font-weight:700;">${state.appVersion}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:12px; color:rgba(255,255,255,0.4); text-transform:uppercase; letter-spacing:1px; margin-bottom:5px;">Latest Version</div>
                <div style="font-size:18px; font-weight:700; color:${state.updateManifest ? 'var(--accent-green)' : 'rgba(255,255,255,0.4)'}">${state.updateManifest ? state.updateManifest.version : (state.isCheckingUpdate ? 'Checking...' : 'Latest')}</div>
              </div>
            </div>
            
            <div style="margin-top:30px; padding:20px; background:rgba(255,255,255,0.03); border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
              ${state.updateManifest ? `
                <div style="color:var(--accent-green); font-weight:700; margin-bottom:10px;">New Update Available!</div>
                <div style="font-size:13px; color:rgba(255,255,255,0.6); line-height:1.6; max-height:150px; overflow-y:auto;">
                  ${state.updateManifest.body || 'No release notes provided.'}
                </div>
              ` : `
                <div style="font-size:13px; color:rgba(255,255,255,0.3); text-align:center;">
                  ${state.isCheckingUpdate ? 'Searching for new versions...' : 'Votre lanceur est à jour.'}
                </div>
              `}
            </div>

            <div style="margin-top:30px; display:flex; gap:15px;">
              <button class="settingsFileButton" id="btn-check-update" style="flex:1; background:rgba(255,255,255,0.1);" ${state.isCheckingUpdate ? 'disabled' : ''}>
                ${state.isCheckingUpdate ? 'Checking...' : 'Vérifier les mises à jour'}
              </button>
              ${state.updateManifest ? `
                <button class="settingsFileButton" id="btn-install-update" style="flex:1; background:var(--accent-green); color:black;">
                  Install Update
                </button>
              ` : ''}
            </div>
          </div>
        </div>

        <div id="tab-about" class="settingsTab" style="display:${state.activeSettingsTab === 'about' ? 'block' : 'none'};">
          <div class="settingsTabHeader">
            <span class="settingsTabHeaderText">About</span>
            <span class="settingsTabHeaderDesc">Launcher version and credits.</span>
          </div>
          <div style="background:rgba(255,255,255,0.03); padding:30px; border-radius:8px;">
            <div style="font-weight:900; font-size:24px; color:var(--accent-green);">LAUNCHED</div>
            <div style="font-size:14px; opacity:0.6; margin-bottom:20px;">Open Source Minecraft Launcher</div>
            <div style="font-size:13px; margin-bottom:5px;">Version: ${state.appVersion}</div>
            <div style="font-size:13px;">Author: Infuseting</div>
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
    handlers.handleSettingsToggle(true);
  });
  document.getElementById('avatarOverlay')?.addEventListener('click', () => {
    handlers.handleSettingsToggle(true);
  });
  document.getElementById('btn-login-add')?.addEventListener('click', () => {
    handlers.handleLoginAdd();
  });
  document.getElementById('msLoginModalCancel')?.addEventListener('click', () => {
    const modal = document.getElementById('msLoginModal');
    if (modal) modal.style.display = 'none';
  });

  document.querySelectorAll('.settingsNavItem').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement;
      const tabId = target.dataset.tab;
      if (tabId) handlers.handleTabChange(tabId);
    });
  });

  document.getElementById('btn-login-add')?.addEventListener('click', handlers.handleLoginAdd);

  document.getElementById('msLoginModalCancel')?.addEventListener('click', () => {
    const modal = document.getElementById('msLoginModal');
    if (modal) modal.style.display = 'none';
  });

  const maxRamSlider = document.getElementById('maxRamSlider') as HTMLInputElement;
  const maxRamDisplay = document.getElementById('maxRamDisplay') as HTMLElement;
  if (maxRamSlider && maxRamDisplay) {
    maxRamSlider.addEventListener('input', () => {
      maxRamDisplay.innerText = `${(parseInt(maxRamSlider.value) / 1024).toFixed(1)}G`;
    });
    maxRamSlider.addEventListener('change', () => {
      state.currentSettings.maxRam = parseInt(maxRamSlider.value);
      handlers.saveSettings();
    });
  }

  const minRamSlider = document.getElementById('minRamSlider') as HTMLInputElement;
  const minRamDisplay = document.getElementById('minRamDisplay') as HTMLElement;
  if (minRamSlider && minRamDisplay) {
    minRamSlider.addEventListener('input', () => {
      minRamDisplay.innerText = `${(parseInt(minRamSlider.value) / 1024).toFixed(1)}G`;
    });
    minRamSlider.addEventListener('change', () => {
      state.currentSettings.minRam = parseInt(minRamSlider.value);
      handlers.saveSettings();
    });
  }

  const jvmArgsInput = document.getElementById('jvmArgsInput') as HTMLTextAreaElement;
  if (jvmArgsInput) {
    jvmArgsInput.addEventListener('change', () => {
      state.currentSettings.jvmArgs = jvmArgsInput.value;
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
    handlers.handleSettingsToggle(false);
  });

  document.getElementById('btn-check-update')?.addEventListener('click', handlers.handleCheckUpdate);
  document.getElementById('btn-install-update')?.addEventListener('click', handlers.handleInstallUpdate);

  const overlay = document.getElementById('overlayContainer');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) toggleServerSelection(false);
    });
  }
}
