import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { LauncherState } from '../state';
import type { AppHandlers } from '../types';
import { Sparkles, Download, X } from 'lucide-react';

interface UpdatePromptModalProps {
  state: LauncherState;
  handlers: Pick<AppHandlers, 'handleInstallUpdate' | 'handleDismissUpdatePrompt'>;
}

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
            className="absolute inset-0 bg-black/75 backdrop-blur-xl"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', duration: 0.35, bounce: 0.1 }}
            className="relative z-10 w-full max-w-lg bg-neutral-900/95 border border-white/15 rounded-3xl p-6 shadow-[0_25px_60px_rgba(0,0,0,0.8)] text-white overflow-hidden space-y-5"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base tracking-tight">Nouvelle Version Disponible</h3>
                  <p className="text-white/40 text-xs">Mise à jour v{manifest?.version ?? state.appVersion}</p>
                </div>
              </div>
              {!isInstalling && (
                <button
                  onClick={onDismiss}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Release Notes */}
            {manifest?.body && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 block">
                  Notes de mise à jour
                </span>
                <div className="max-h-48 overflow-y-auto p-4 rounded-2xl bg-black/50 border border-white/5 text-xs text-white/80 whitespace-pre-wrap font-sans leading-relaxed custom-scrollbar">
                  {manifest.body}
                </div>
              </div>
            )}

            {/* Installing Progress Bar */}
            {isInstalling && (
              <div className="space-y-2 pt-2">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-white/70">Installation en cours...</span>
                  <span className="font-mono text-emerald-400">{Math.round(progress)}%</span>
                </div>
                <div className="w-full h-2.5 bg-neutral-800 rounded-full overflow-hidden border border-white/5">
                  <motion.div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full shadow-[0_0_15px_rgba(52,211,153,0.8)]"
                    style={{ width: `${Math.max(3, progress)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Error banner */}
            {state.updateError && (
              <p className="text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/20 p-3 rounded-xl">
                {state.updateError}
              </p>
            )}

            {/* Actions */}
            {!isInstalling && (
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onDismiss}
                  className="flex-1 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                >
                  Plus tard
                </button>
                <button
                  type="button"
                  onClick={onInstall}
                  className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-400 text-neutral-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_6px_25px_rgba(52,211,153,0.35)] hover:brightness-110 cursor-pointer transition-all"
                >
                  <Download className="w-4 h-4" />
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
