import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AppHandlers, LauncherStateModel } from '../types';

interface UpdatePromptModalProps {
  state: Pick<
    LauncherStateModel,
    'updateManifest' | 'isInstallingUpdate' | 'updateInstallProgress' | 'updateError' | 'dismissedUpdateVersion'
  >;
  handlers: Pick<AppHandlers, 'handleInstallUpdate' | 'handleDismissUpdatePrompt'>;
}

const UpdatePromptModal: React.FC<UpdatePromptModalProps> = ({ state, handlers }) => {
  const update = state.updateManifest;

  const shouldShow =
    !!update &&
    state.dismissedUpdateVersion !== update.version;

  const releaseNotes = update?.body?.trim();

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 backdrop-blur-md px-6"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.93, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: 'spring', stiffness: 200, damping: 22 }}
            className="w-full max-w-xl rounded-[2rem] border border-emerald-300/20 bg-gradient-to-br from-emerald-950/95 via-zinc-950/95 to-black/95 p-8 text-white shadow-[0_40px_100px_rgba(16,185,129,0.25)]"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200">
                  <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.95)]"></span>
                  Launcher update
                </p>
                <h3 className="text-3xl font-black tracking-tight">Version {update?.version} disponible</h3>
                <p className="mt-2 text-sm text-white/65">
                  Une nouvelle version de Launched est prete. Installation rapide puis redemarrage automatique.
                </p>
              </div>
              <button
                onClick={handlers.handleDismissUpdatePrompt}
                disabled={state.isInstallingUpdate}
                className="h-10 w-10 rounded-xl border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label="Remind me later"
              >
                <sl-icon name="x-lg"></sl-icon>
              </button>
            </div>

            {releaseNotes && (
              <div className="mb-6 rounded-2xl border border-white/10 bg-black/35 p-4">
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/45">Release notes</p>
                <p className="max-h-28 overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-white/75 custom-scrollbar">
                  {releaseNotes}
                </p>
              </div>
            )}

            {state.updateError && (
              <div className="mb-5 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                Echec de la mise a jour: {state.updateError}
              </div>
            )}

            {state.isInstallingUpdate && (
              <div className="mb-6 rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-widest text-white/55">
                  <span>Telechargement en cours</span>
                  <span className="tabular-nums text-white">{Math.round(state.updateInstallProgress)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full border border-white/10 bg-white/10">
                  <motion.div
                    className="h-full bg-gradient-to-r from-emerald-300 via-emerald-400 to-lime-300"
                    initial={{ width: 0 }}
                    animate={{ width: `${state.updateInstallProgress}%` }}
                    transition={{ duration: 0.2 }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={handlers.handleDismissUpdatePrompt}
                disabled={state.isInstallingUpdate}
                className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white/80 transition hover:bg-white/10 hover:text-white"
              >
                Plus tard
              </button>
              <button
                onClick={() => {
                  void handlers.handleInstallUpdate();
                }}
                disabled={state.isInstallingUpdate}
                className="rounded-2xl border border-emerald-200/30 bg-gradient-to-r from-emerald-400 to-lime-300 px-5 py-3 text-sm font-black uppercase tracking-wider text-zinc-950 shadow-[0_10px_25px_rgba(110,231,183,0.45)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {state.isInstallingUpdate ? 'Installation...' : 'Installer maintenant'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default UpdatePromptModal;
