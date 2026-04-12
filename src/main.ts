import './style.css';
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

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

interface Session {
  name: string;
  minecraft: string;
  forge?: string;
  syncDir: string;
  syncUrl: string;
  welcome: string;
  jvmArg: string;
  credits: string;
  htmlPath?: string;
  isDefault: boolean;
}

const app = document.querySelector<HTMLDivElement>('#app')!;

async function syncAndLoad(session: Session, index: number) {
  const allButtons = document.querySelectorAll<HTMLButtonElement>('.session-btn');
  const actionArea = document.querySelector<HTMLDivElement>(`#action-area-${index}`)!;
  
  // Disable all buttons to prevent multiple syncs
  allButtons.forEach(btn => {
    btn.disabled = true;
    btn.classList.add('opacity-50', 'cursor-not-allowed', 'active:scale-100');
    btn.classList.remove('active:scale-[0.98]', 'hover:bg-gray-800', 'hover:border-blue-500/50');
  });

  // Replace "Sync & Play" with progress bar
  actionArea.className = "pt-6 border-t border-white/5 space-y-3 block";
  actionArea.innerHTML = `
    <div class="flex justify-between text-[10px] font-bold uppercase tracking-widest text-gray-500">
      <span id="progress-status-${index}" class="truncate mr-4">Initializing...</span>
      <span id="progress-percent-${index}">0%</span>
    </div>
    <div class="h-1.5 w-full bg-gray-900/50 rounded-full overflow-hidden border border-white/5">
      <div id="progress-bar-${index}" class="h-full bg-blue-500 transition-all duration-300 shadow-[0_0_10px_rgba(59,130,246,0.5)]" style="width: 0%"></div>
    </div>
  `;

  const statusEl = document.getElementById(`progress-status-${index}`)!;
  const percentEl = document.getElementById(`progress-percent-${index}`)!;
  const barEl = document.getElementById(`progress-bar-${index}`)!;

  try {
    // ── Step 1: Auth check BEFORE sync ──────────────────────────────────────────
    let auth = await invoke<AuthResponse | null>("get_auth");

    if (!auth) {
      statusEl.textContent = `Waiting for Microsoft Login...`;
      console.log("Starting Microsoft Auth...");

      // Listen for the device code to show it to the user
      const unlistenCode = await listen<any>("ms-device-code", (event) => {
        const { user_code, verification_uri } = event.payload;
        statusEl.innerHTML = `Login at <span class="text-blue-400 underline">${verification_uri}</span><br>Code: <span class="text-white font-mono bg-black px-2 py-1 rounded">${user_code}</span> <span class="text-[8px] text-green-400 font-bold ml-1 animate-pulse">(Copied!)</span>`;
        
        // Copy to clipboard
        navigator.clipboard.writeText(user_code).catch(err => {
          console.error("Failed to copy to clipboard:", err);
        });
      });

      try {
        const authResponse = await invoke<AuthResponse>("login_microsoft");
        statusEl.textContent = `Login Successful! Welcome, ${authResponse.name}`;
        auth = authResponse;
        // Short pause to let the user see the success message
        await new Promise(r => setTimeout(r, 1000));
      } catch (authError) {
        console.error("Auth failed:", authError);
        alert("Microsoft Authentication failed. Please try again.");
        loadSessions();
        return;
      } finally {
        unlistenCode();
      }
    } else {
      statusEl.textContent = `Authenticated as ${auth.name}`;
    }

    // ── Step 2: Sync ────────────────────────────────────────────────────────────
    statusEl.textContent = `Starting sync...`;

    const unlisten = await listen<SyncProgress>("sync-progress", (event) => {
      const { current_file, percentage } = event.payload;
      statusEl.textContent = current_file;
      percentEl.textContent = `${Math.round(percentage)}%`;
      barEl.style.width = `${percentage}%`;
    });

    console.log(`Syncing session: ${session.name}`);
    
    // Store session globally for the bridge to access after navigation
    (window as any).__LAUNCHED_CURRENT_SESSION__ = session;

    try {
      await invoke("sync_session", { session });
    } finally {
      unlisten();
    }
    
    // Ensure 100% visibility
    percentEl.textContent = `100%`;
    barEl.style.width = `100%`;
    statusEl.textContent = `Sync Complete`;

    // ── Step 3: Launch or Navigate ───────────────────────────────────────────────
    if (!session.htmlPath) {
      // No external launcher: launch the game directly from here
      statusEl.textContent = `Launching game...`;
      console.log(`No htmlPath defined, launching game directly for session: ${session.name}`);
      try {
        await invoke("launch_game", { session, showLogs: true });
        statusEl.textContent = `Game launched! ✓`;
        // Re-enable buttons after game is launched so user can open it again
        setTimeout(() => loadSessions(), 3000);
      } catch (launchError) {
        console.error("Failed to launch game:", launchError);
        alert(`Failed to launch game: ${launchError}`);
        loadSessions();
      }
    } else {
      // External launcher page: navigate to it
      let htmlUrl = session.htmlPath;
      if (htmlUrl.startsWith("http")) {
        if (!htmlUrl.endsWith(".html")) {
          if (!htmlUrl.endsWith("/")) htmlUrl += "/";
          htmlUrl += "index.html";
        }
      }
      console.log(`Navigating to external launcher: ${htmlUrl}`);
      setTimeout(() => {
        window.location.href = htmlUrl;
      }, 1500);
    }
  } catch (error) {
    console.error("Failed to sync or load session:", error);
    alert(`Error: ${error}`);
    // Re-enable everything on error
    loadSessions();
  }
}

async function loadSessions() {
  try {
    const sessions = await invoke<Session[]>("get_sessions");
    renderSessions(sessions);
  } catch (error) {
    console.error("Failed to load sessions:", error);
    app.innerHTML = `
      <div class="min-h-screen bg-gray-900 flex items-center justify-center p-8">
        <div class="text-red-500 text-center border border-red-500/30 p-6 rounded-xl bg-red-500/10">
          <h2 class="text-xl font-bold mb-2">Failed to load sessions</h2>
          <p class="opacity-80">${error}</p>
        </div>
      </div>
    `;
  }
}

function renderSessions(sessions: Session[]) {
  app.innerHTML = `
    <div class="min-h-screen bg-gray-900 text-white p-8 font-sans selection:bg-blue-500/30">
      <header class="max-w-4xl mx-auto mb-12">
        <h1 class="text-4xl font-black mb-2 tracking-tight">Select a Session</h1>
        <p class="text-gray-400">Choose a session to sync and launch the launcher.</p>
      </header>
      
      <main class="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
        ${sessions.map((s, i) => `
          <button 
            data-index="${i}"
            id="session-btn-${i}"
            class="session-btn group p-8 rounded-3xl bg-gray-800/50 border border-gray-700/50 hover:border-blue-500/50 hover:bg-gray-800 transition-all duration-300 text-left focus:outline-none focus:ring-4 focus:ring-blue-500/20 active:scale-[0.98]"
          >
            <div class="flex items-center justify-between mb-6">
              <h2 class="text-2xl font-bold group-hover:text-blue-400 transition-colors">${s.name}</h2>
              ${s.isDefault ? '<span class="text-[10px] uppercase font-black px-2.5 py-1 rounded-lg bg-blue-500 text-white">Default</span>' : ''}
            </div>
            
            <div class="space-y-3 mb-6">
              <div class="flex items-center gap-3">
                <span class="text-xs uppercase tracking-widest text-gray-500 font-bold">MC</span>
                <span class="font-mono text-sm bg-gray-900/50 px-2 py-0.5 rounded border border-white/5">${s.minecraft}</span>
              </div>
              ${s.forge ? `
                <div class="flex items-center gap-3">
                  <span class="text-xs uppercase tracking-widest text-gray-500 font-bold">Forge</span>
                  <span class="font-mono text-xs bg-gray-900/50 px-2 py-0.5 rounded border border-white/5">${s.forge}</span>
                </div>
              ` : ''}
            </div>
            
            <div id="action-area-${i}" class="pt-6 border-t border-white/5 flex items-center gap-2 text-blue-400 font-bold text-sm">
              <span>Sync & Play</span>
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
          </button>
        `).join('')}
      </main>
    </div>
  `;

  document.querySelectorAll('.session-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt((btn as HTMLElement).dataset.index!);
      syncAndLoad(sessions[index], index);
    });
  });
}

loadSessions();
