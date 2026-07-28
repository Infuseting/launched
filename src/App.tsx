import React from 'react';
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
