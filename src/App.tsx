import React, { useEffect } from 'react';
import { useLauncherState } from './state';
import type { AppHandlers } from './types';
import Layout from './components/Layout';
import MainScreen from './screens/MainScreen';
import SettingsModal from './components/settings/SettingsModal';
import ServerSelectModal from './components/ServerSelectModal';
import MicrosoftDeviceCodeModal from './components/MicrosoftDeviceCodeModal';
import UpdatePromptModal from './components/UpdatePromptModal';
import CrackModal from './components/CrackModal';

interface AppProps {
  handlers: AppHandlers;
}

export const App: React.FC<AppProps> = ({ handlers }) => {
  const launcherState = useLauncherState();

  // Global Escape key handler with hierarchical modal stack priority
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (launcherState.crackModalOpen) {
          e.preventDefault();
          handlers.handleCrackModalResolve(null);
        } else if (launcherState.deviceCodeModalOpen) {
          e.preventDefault();
          handlers.handleDeviceCodeModalToggle(false);
        } else if (
          launcherState.updateManifest &&
          !launcherState.isInstallingUpdate &&
          launcherState.dismissedUpdateVersion !== launcherState.updateManifest.version
        ) {
          e.preventDefault();
          handlers.handleDismissUpdatePrompt();
        } else if (launcherState.isServerSelectOpen) {
          e.preventDefault();
          handlers.handleServerSelectToggle(false);
        } else if (launcherState.isSettingsOpen) {
          e.preventDefault();
          handlers.handleSettingsToggle(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [launcherState, handlers]);

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

        <MicrosoftDeviceCodeModal
          isOpen={launcherState.deviceCodeModalOpen}
          payload={launcherState.deviceCodePayload}
          errorMessage={launcherState.deviceCodeError}
          onClose={() => handlers.handleDeviceCodeModalToggle(false)}
        />

        <UpdatePromptModal
          state={launcherState}
          handlers={handlers}
        />

        <CrackModal
          isOpen={launcherState.crackModalOpen}
          defaultPseudo={launcherState.crackModalDefaultPseudo}
          onResolve={handlers.handleCrackModalResolve}
        />
      </div>
    </Layout>
  );
};

export default App;
