import React from 'react';
import { useLauncherState } from './state';
import Layout from './components/Layout';
import MainScreen from './screens/MainScreen';
import SettingsModal from './components/SettingsModal';
import ServerSelectModal from './components/ServerSelectModal';

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
    handleServerSelectToggle: (show: boolean) => void;
    handleSessionSelect: (index: number) => Promise<void>;
  };
}

const App: React.FC<AppProps> = ({ handlers }) => {
  const launcherState = useLauncherState();

  return (
    <Layout>
      <div className="relative w-full h-screen">
        <MainScreen handlers={handlers} />

        <SettingsModal
          isOpen={launcherState.isSettingsOpen}
          state={launcherState}
          handlers={handlers}
        />

        <ServerSelectModal
          isOpen={launcherState.isServerSelectOpen}
          state={launcherState}
          onSelect={async (index) => {
            await handlers.handleSessionSelect(index);
          }}
          onClose={() => handlers.handleServerSelectToggle(false)}
        />


      </div>
    </Layout>
  );
};

export default App;
