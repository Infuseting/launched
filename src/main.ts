import './style.css';
import { invoke } from "@tauri-apps/api/core";

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

async function syncAndLoad(session: Session) {
  try {
    console.log(`Syncing session: ${session.name}`);
    await invoke("sync_session", { session });
    
    let htmlUrl = session.htmlPath || "index.html";
    if (htmlUrl.startsWith("http")) {
       // Requirement: "Note: The user said "htmlPath load by default is index.html"."
       // "So if `html_path` is `https://galade.fr/installateur/html`, then the full URL would be `https://galade.fr/installateur/html/index.html`."
       if (!htmlUrl.endsWith(".html")) {
         if (!htmlUrl.endsWith("/")) htmlUrl += "/";
         htmlUrl += "index.html";
       }
    }
    
    console.log(`Navigating to: ${htmlUrl}`);
    window.location.href = htmlUrl;
  } catch (error) {
    console.error("Failed to sync or load session:", error);
    alert(`Error: ${error}`);
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
        ${sessions.map(s => `
          <button 
            data-session='${JSON.stringify(s)}'
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
            
            <div class="pt-6 border-t border-white/5 flex items-center gap-2 text-blue-400 font-bold text-sm">
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
      const session = JSON.parse((btn as HTMLElement).dataset.session!);
      syncAndLoad(session);
    });
  });
}

loadSessions();
