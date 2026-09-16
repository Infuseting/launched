import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { DeviceCodePayload } from '../types';
import { open } from '@tauri-apps/plugin-shell';
import { KeyRound, Copy, Check, ExternalLink, ShieldAlert, X } from 'lucide-react';

interface MicrosoftDeviceCodeModalProps {
  isOpen: boolean;
  payload: DeviceCodePayload | null;
  errorMessage: string | null;
  onClose: () => void;
}

export const MicrosoftDeviceCodeModal: React.FC<MicrosoftDeviceCodeModalProps> = ({
  isOpen,
  payload,
  errorMessage,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyCode = async () => {
    if (!payload?.user_code) return;
    try {
      await navigator.clipboard.writeText(payload.user_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy user code:', err);
    }
  };

  const handleOpenBrowser = async () => {
    if (!payload?.verification_uri) return;
    try {
      await open(payload.verification_uri);
    } catch (err) {
      console.error('Failed to open browser:', err);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 select-none">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: 'spring', duration: 0.35, bounce: 0.05 }}
            className="relative z-10 w-full max-w-md bg-neutral-900/95 border border-white/10 rounded-2xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.7)] text-white overflow-hidden space-y-5"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/90 flex-shrink-0">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm tracking-tight text-white">Connexion Microsoft</h3>
                  <p className="text-white/50 text-xs mt-0.5">Authentification sécurisée OAuth2</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Step Instructions */}
            <div className="space-y-3.5">
              <div>
                <span className="text-[11px] font-medium text-white/50 uppercase tracking-wider block mb-2">
                  Code d'autorisation unique
                </span>

                {/* Code Box with 1-click Copy */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/10">
                  <span className="font-mono text-xl font-bold tracking-widest text-white select-all px-2">
                    {payload?.user_code || '------'}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                      copied
                        ? 'bg-white text-neutral-950 shadow-sm'
                        : 'bg-white/10 hover:bg-white/20 text-white/90'
                    }`}
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copié !' : 'Copier'}</span>
                  </button>
                </div>
              </div>

              <p className="text-xs text-white/60 leading-relaxed">
                Cliquez ci-dessous pour ouvrir la page officielle Microsoft et valider la connexion avec ce code.
              </p>

              <button
                type="button"
                onClick={handleOpenBrowser}
                className="w-full py-2.5 px-4 rounded-xl bg-white text-neutral-950 font-bold text-xs hover:bg-neutral-200 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm text-center"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Ouvrir la page de connexion</span>
              </button>
            </div>

            {/* Waiting Footer */}
            <div className="pt-2 border-t border-white/5 flex items-center justify-center gap-2 text-white/40 text-[11px]">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>En attente de validation dans votre navigateur...</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default MicrosoftDeviceCodeModal;
