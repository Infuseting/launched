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
import DiscordCommunityModal from './components/DiscordCommunityModal';
import DiscordLoginScreen from './components/DiscordLoginScreen';

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
        } else if (launcherState.discordModalOpen) {
          // Handled inside DiscordCommunityModal (only dismisses if 5s countdown finished)
          e.preventDefault();
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
      {!launcherState.discordUser || launcherState.discordChecking ? <>
        <DiscordLoginScreen state={launcherState} handlers={handlers} />
        <UpdatePromptModal state={launcherState} handlers={handlers} />
      </> :
      <div className="relative w-full h-full">
        <MainScreen handlers={handlers} />
        {launcherState.sessionsLoading && <p role="status" className="absolute inset-x-8 top-24 z-40 rounded-2xl bg-neutral-900/95 p-4 text-center text-sm text-white/80">Chargement de vos sessions…</p>}
        {(launcherState.sessionsError || (!launcherState.sessionsLoading && launcherState.globalSessions.length === 0)) && <div className="absolute inset-x-8 top-24 z-40 rounded-2xl border border-white/10 bg-neutral-900/95 p-5 text-center text-white">
          <p role={launcherState.sessionsError ? 'alert' : 'status'} className="text-sm">{launcherState.sessionsError || 'Aucune session accessible pour ce compte Discord. Demandez un accès au créateur de votre session.'}</p>
          <button type="button" disabled={launcherState.sessionsLoading} onClick={() => void handlers.handleRefreshSessions()} className="mt-3 min-h-11 rounded-lg bg-white/10 px-4 text-sm hover:bg-white/20 disabled:opacity-50">Actualiser les sessions</button>
        </div>}

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
          onRefresh={handlers.handleRefreshSessions}
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

        <DiscordCommunityModal
          isOpen={launcherState.discordModalOpen}
          onJoin={handlers.handleOpenDiscord}
          onDismiss={handlers.handleDiscordModalDismiss}
        />
      </div>}
    </Layout>
  );
};

export default App;
