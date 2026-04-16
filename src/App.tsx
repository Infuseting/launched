import React from 'react';
import { useLauncherState } from './hooks/useLauncherState';
import Layout from './components/Layout';
import MainScreen from './screens/MainScreen';
import SettingsModal from './components/SettingsModal';
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
        
        <SettingsModal 
          isOpen={state.isSettingsOpen} 
          state={state} 
          handlers={handlers} 
        />

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
