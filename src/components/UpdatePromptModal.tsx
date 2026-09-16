import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { LauncherState } from '../state';
import type { AppHandlers } from '../types';
import { ArrowUpCircle, ArrowRight, Download, X, AlertCircle } from 'lucide-react';

interface UpdatePromptModalProps {
  state: LauncherState;
  handlers: Pick<AppHandlers, 'handleInstallUpdate' | 'handleDismissUpdatePrompt'>;
}

const renderReleaseNotes = (content: string) => {
  const lines = content.trim().split('\n');
  return (
    <div className="space-y-2 text-xs leading-relaxed text-white/75">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1" />;
        }
        if (trimmed.startsWith('#')) {
          const title = trimmed.replace(/^#+\s*/, '');
          return (
            <h4 key={idx} className="text-white font-semibold text-xs tracking-tight pt-1.5 first:pt-0">
              {title}
            </h4>
          );
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const item = trimmed.substring(2);
          return (
            <div key={idx} className="flex items-start gap-2.5 text-white/80 pl-1">
              <span className="w-1.5 h-1.5 rounded-full bg-white/40 mt-1.5 flex-shrink-0" />
              <span>{item}</span>
            </div>
          );
        }
        return (
          <p key={idx} className="text-white/70">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
};

export const UpdatePromptModal: React.FC<UpdatePromptModalProps> = ({
  state,
  handlers,
}) => {
  const manifest = state.updateManifest;
  const isInstalling = state.isInstallingUpdate;
  const progress = state.updateInstallProgress;

  const isOpen =
    !!manifest &&
    !isInstalling &&
    state.dismissedUpdateVersion !== manifest.version;

  const onDismiss = () => handlers.handleDismissUpdatePrompt();
  const onInstall = () => void handlers.handleInstallUpdate();

  return (
    <AnimatePresence>
      {(isOpen || isInstalling) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 select-none">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={!isInstalling ? onDismiss : undefined}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: 'spring', duration: 0.35, bounce: 0.05 }}
            className="relative z-10 w-full max-w-lg bg-neutral-900/95 border border-white/10 rounded-2xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.7)] text-white overflow-hidden space-y-5"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white flex-shrink-0">
                  <ArrowUpCircle className="w-5 h-5 text-white/90" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm tracking-tight text-white">
                    Mise à jour disponible
                  </h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-white/50 text-xs font-mono">v{state.appVersion}</span>
                    <ArrowRight className="w-3 h-3 text-white/30" />
                    <span className="text-white text-xs font-mono font-medium bg-white/10 px-1.5 py-0.5 rounded border border-white/10">
                      v{manifest?.version ?? 'Nouveau'}
                    </span>
                  </div>
                </div>
              </div>

              {!isInstalling && (
                <button
                  type="button"
                  onClick={onDismiss}
                  className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                  title="Fermer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Release Notes */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-white/40 uppercase tracking-wider block">
                Notes de version
              </span>
              <div className="max-h-52 overflow-y-auto p-4 rounded-xl bg-black/40 border border-white/5 custom-scrollbar">
                {manifest?.body ? (
                  renderReleaseNotes(manifest.body)
                ) : (
                  <p className="text-white/40 text-xs italic">
                    Aucun détail spécifique fourni pour cette version.
                  </p>
                )}
              </div>
            </div>

            {/* Installing Progress Bar */}
            {isInstalling && (
              <div className="space-y-2 pt-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-white/70 font-medium">Téléchargement et installation...</span>
                  <span className="font-mono text-white font-semibold">{Math.round(progress)}%</span>
                </div>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-white rounded-full"
                    initial={false}
                    animate={{ width: `${Math.max(3, Math.min(100, progress))}%` }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                  />
                </div>
              </div>
            )}

            {/* Error banner */}
            {state.updateError && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-3 rounded-xl flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
                <span>{state.updateError}</span>
              </div>
            )}

            {/* Actions */}
            {!isInstalling && (
              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={onDismiss}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white font-medium text-xs transition-colors cursor-pointer text-center"
                >
                  Plus tard
                </button>
                <button
                  type="button"
                  onClick={onInstall}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-white text-neutral-950 font-bold text-xs hover:bg-neutral-200 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm text-center"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Mettre à jour</span>
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default UpdatePromptModal;
