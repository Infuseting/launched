import React from 'react';
import { useLauncherState } from './hooks/useLauncherState';
import Layout from './components/Layout';
import MainScreen from './screens/MainScreen';
import { AnimatePresence, motion } from 'framer-motion';

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
      <div className="relative w-full h-screen">
        <MainScreen handlers={handlers} />
        
        {/* We can add overlays here like SettingsModal later in Task 5 */}
        <AnimatePresence>
          {state.isSettingsOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-8"
              onClick={() => handlers.handleSettingsToggle(false)}
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="bg-neutral-900 border border-white/10 rounded-[2.5rem] p-12 max-w-2xl w-full shadow-[0_50px_100px_rgba(0,0,0,0.5)]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-3xl font-black text-white tracking-tight">Settings</h2>
                  <button 
                    onClick={() => handlers.handleSettingsToggle(false)}
                    className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white transition-colors cursor-pointer"
                  >
                    <sl-icon name="x-lg"></sl-icon>
                  </button>
                </div>
                
                <div className="text-neutral-400 text-center py-20 border-2 border-dashed border-white/5 rounded-3xl">
                  <p className="text-lg font-medium italic">Settings are being migrated to Material 3...</p>
                  <p className="text-sm opacity-50 mt-2">(Task 5: Feature Porting)</p>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global Loading / Sync Overlay (Task 6+) */}
        <AnimatePresence>
          {state.isSyncing && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed bottom-32 left-0 right-0 z-[60] flex justify-center pointer-events-none"
            >
              <div className="bg-white/10 backdrop-blur-xl border border-white/20 px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-4">
                <sl-spinner style={{ fontSize: '1rem', '--indicator-color': 'white' }}></sl-spinner>
                <span className="text-white text-sm font-bold tracking-widest uppercase">Preparing Game Files...</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  );
};

export default App;
