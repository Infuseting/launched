import React from 'react';
import { useLauncherState } from './hooks/useLauncherState';
import Layout from './components/Layout';

interface AppProps {
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
  };
}

const App: React.FC<AppProps> = ({ handlers }) => {
  const state = useLauncherState();

  return (
    <Layout>
      <div className="min-h-screen text-white flex flex-col items-center justify-center p-8">
        <h1 className="text-4xl font-bold mb-4">Launched</h1>
        <p className="text-neutral-400 mb-8">Material UI Redesign in Progress</p>
        
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 w-full max-w-md">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center overflow-hidden">
              {state.authCache ? (
                <img src={`https://mc-heads.net/avatar/${state.authCache.uuid}`} alt="avatar" />
              ) : (
                <span className="text-xs">?</span>
              )}
            </div>
            <div>
              <div className="font-bold">{state.authCache ? state.authCache.name : 'Not Logged In'}</div>
              <div className="text-xs text-neutral-500">{state.authCache ? 'Microsoft Account' : 'Please log in'}</div>
            </div>
          </div>

          <div className="space-y-2">
            <button 
              onClick={() => handlers.syncAndLoad()}
              disabled={state.isSyncing || !state.authCache}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-bold transition-colors"
            >
              {state.isSyncing ? 'Syncing...' : 'PLAY'}
            </button>
            
            <button 
              onClick={() => handlers.handleSettingsToggle(true)}
              className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm transition-colors"
            >
              Settings
            </button>
          </div>
        </div>

        <div className="mt-8 text-[10px] text-neutral-600 uppercase tracking-widest">
          Version {state.appVersion}
        </div>
      </div>
    </Layout>
  );
};

export default App;
