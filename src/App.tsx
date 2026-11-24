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
import { OptionalModsModal } from './components/OptionalModsModal';
import NoticeModal from './components/NoticeModal';
import DiscordLoginScreen from './components/DiscordLoginScreen';
import { LoaderCircle } from 'lucide-react';

interface AppProps {
  handlers: AppHandlers;
}

export const App: React.FC<AppProps> = ({ handlers }) => {
  const launcherState = useLauncherState();

  // Global Escape key handler with hierarchical modal stack priority
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (launcherState.noticeDialog) {
          e.preventDefault();
          handlers.handleNoticeDialogResolve(false);
          return;
        }
        if (launcherState.deletingSessionName) {
          e.preventDefault();
          return;
        }
        // Installation owns the overlay until completion; Escape must not close a page underneath it.
        if (launcherState.isInstallingUpdate) {
          e.preventDefault();
          return;
        }
        if (
          launcherState.updateManifest &&
          launcherState.dismissedUpdateVersion !==
            launcherState.updateManifest.version
        ) {
          e.preventDefault();
          handlers.handleDismissUpdatePrompt();
        } else if (launcherState.optionalModsModalOpen) {
          e.preventDefault();
          handlers.handleCloseOptionalMods();
        } else if (launcherState.crackModalOpen) {
          e.preventDefault();
          handlers.handleCrackModalResolve(null);
        } else if (launcherState.deviceCodeModalOpen) {
          e.preventDefault();
          handlers.handleDeviceCodeModalToggle(false);
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
      {launcherState.discordChecking ? (
        <div
          role="status"
          className="flex h-full items-center justify-center gap-2 bg-neutral-950 text-sm text-white/60"
        >
          <LoaderCircle
            aria-hidden="true"
            className="h-4 w-4 motion-safe:animate-spin"
          />
          Chargement…
        </div>
      ) : !launcherState.discordUser && !launcherState.discordSkipped ? (
        <>
          <DiscordLoginScreen state={launcherState} handlers={handlers} />
          <UpdatePromptModal state={launcherState} handlers={handlers} />
        </>
      ) : (
        <div className="relative w-full h-full">
          <MainScreen handlers={handlers} />
          {launcherState.sessionsLoading && !launcherState.sessionLinkError && (
            <p
              role="status"
              className="absolute inset-x-8 top-24 z-40 rounded-2xl bg-neutral-900/95 p-4 text-center text-sm text-white/80"
            >
              Chargement de vos sessions…
            </p>
          )}
          {(launcherState.sessionsError ||
            launcherState.sessionLinkError ||
            (!launcherState.sessionsLoading &&
              launcherState.globalSessions.length === 0)) && (
            <div className="absolute inset-x-8 top-24 z-40 rounded-2xl border border-white/10 bg-neutral-900/95 p-5 text-center text-white">
              <p
                role={
                  launcherState.sessionsError || launcherState.sessionLinkError
                    ? 'alert'
                    : 'status'
                }
                className="text-sm"
              >
                {launcherState.sessionsError ||
                  launcherState.sessionLinkError ||
                  (launcherState.discordSkipped
                    ? 'Aucune session publique disponible.'
                    : 'Aucune session accessible pour ce compte Discord. Demandez un accès au créateur de votre session.')}
              </p>
              {launcherState.sessionLinkError && launcherState.discordError && (
                <p role="alert" className="mt-2 text-sm text-red-300">
                  {launcherState.discordError}
                </p>
              )}
              {launcherState.sessionLinkError &&
                launcherState.discordSkipped && (
                  <button
                    type="button"
                    disabled={launcherState.sessionsLoading}
                    onClick={() =>
                      void (launcherState.discordBusy
                        ? handlers.handleDiscordCancel()
                        : handlers.handleDiscordLogin())
                    }
                    className="mt-3 mr-2 min-h-11 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
                  >
                    {launcherState.discordBusy
                      ? 'Annuler la connexion'
                      : 'Se connecter avec Discord'}
                  </button>
                )}
              <button
                type="button"
                disabled={launcherState.sessionsLoading}
                onClick={() => void handlers.handleRefreshSessions()}
                className="mt-3 min-h-11 rounded-lg bg-white/10 px-4 text-sm hover:bg-white/20 disabled:opacity-50"
              >
                {launcherState.sessionsLoading
                  ? 'Actualisation…'
                  : 'Actualiser les sessions'}
              </button>
              {launcherState.sessionLinkError && (
                <button
                  type="button"
                  onClick={handlers.handleDismissSessionLink}
                  className="mt-3 ml-2 min-h-11 rounded-lg bg-white/10 px-4 text-sm hover:bg-white/20"
                >
                  Ignorer ce lien
                </button>
              )}
            </div>
          )}

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
            onDelete={handlers.handleDeleteSession}
            onFetchAssets={handlers.fetchAssetMetadata}
            onOpenOptionalMods={(session) =>
              handlers.handleOpenOptionalMods(session)
            }
          />

          <MicrosoftDeviceCodeModal
            isOpen={launcherState.deviceCodeModalOpen}
            payload={launcherState.deviceCodePayload}
            errorMessage={launcherState.deviceCodeError}
            onClose={() => handlers.handleDeviceCodeModalToggle(false)}
          />

          <UpdatePromptModal state={launcherState} handlers={handlers} />

          <CrackModal
            isOpen={launcherState.crackModalOpen}
            defaultPseudo={launcherState.crackModalDefaultPseudo}
            onResolve={handlers.handleCrackModalResolve}
          />

          <OptionalModsModal
            isOpen={launcherState.optionalModsModalOpen}
            session={launcherState.optionalModsModalSession}
            isFirstSync={launcherState.optionalModsIsFirstSync}
            hasUpdates={launcherState.optionalModsHasUpdates}
            onClose={handlers.handleCloseOptionalMods}
            onSave={handlers.handleSaveOptionalMods}
          />
        </div>
      )}
      <NoticeModal
        dialog={launcherState.noticeDialog}
        onResolve={handlers.handleNoticeDialogResolve}
      />
    </Layout>
  );
};

export default App;
