import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { open } from '@tauri-apps/plugin-shell';
import type { DeviceCodePayload } from '../types';

interface MicrosoftDeviceCodeModalProps {
  isOpen: boolean;
  payload: DeviceCodePayload | null;
  errorMessage: string | null;
  onClose: () => void;
}

const MicrosoftDeviceCodeModal: React.FC<MicrosoftDeviceCodeModalProps> = ({ isOpen, payload, errorMessage, onClose }) => {
  const code = payload?.user_code ?? '';
  const url = payload?.verification_uri ?? '';
  const message = payload?.message ?? 'Connectez-vous avec Microsoft pour continuer.';

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Ignore clipboard failures.
    }
  };

  const openUrl = async () => {
    if (!url) return;
    try {
      await open(url);
    } catch {
      // Ignore open failures.
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-md flex items-center justify-center p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.95 }}
            className="w-full max-w-lg rounded-3xl bg-neutral-950/95 border border-white/10 p-6 text-white shadow-[0_40px_80px_rgba(0,0,0,0.6)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-white/40 font-bold">Microsoft Login</p>
                <h3 className="text-2xl font-black tracking-tight mt-1">Connexion requise</h3>
              </div>
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center"
              >
                <sl-icon name="x-lg"></sl-icon>
              </button>
            </div>

            <p className="text-sm text-white/75 mt-4 leading-relaxed">{message}</p>

            {errorMessage ? (
              <div className="mt-4 rounded-2xl border border-red-300/30 bg-red-400/10 p-4">
                <p className="text-[11px] uppercase tracking-widest text-red-200/80 font-bold">Erreur de connexion</p>
                <p className="mt-2 text-sm text-red-100 leading-relaxed">{errorMessage}</p>
              </div>
            ) : null}

            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[11px] uppercase tracking-widest text-white/40 font-bold">URL</p>
                <p className="mt-2 text-sm font-mono break-all text-white/90">{url || 'En attente...'}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[11px] uppercase tracking-widest text-white/40 font-bold">Code</p>
                <p className="mt-2 text-3xl font-black tracking-[0.2em] text-white">{code || '------'}</p>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={openUrl}
                className="flex-1 rounded-2xl bg-cyan-300 text-neutral-950 border border-cyan-200 font-bold py-3 cursor-pointer hover:bg-cyan-200 hover:-translate-y-0.5 active:translate-y-0 transition-all"
              >
                Ouvrir l'URL
              </button>
              <button
                onClick={copyCode}
                className="flex-1 rounded-2xl bg-white/10 border border-white/10 font-bold py-3 cursor-pointer hover:bg-white/20 hover:-translate-y-0.5 active:translate-y-0 transition-all"
              >
                Copier le code
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default MicrosoftDeviceCodeModal;
