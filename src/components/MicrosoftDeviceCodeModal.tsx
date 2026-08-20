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
            className="absolute inset-0 bg-black/75 backdrop-blur-xl"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', duration: 0.35, bounce: 0.1 }}
            className="relative z-10 w-full max-w-md bg-neutral-900/95 border border-white/15 rounded-3xl p-6 shadow-[0_25px_60px_rgba(0,0,0,0.8)] text-white overflow-hidden space-y-5"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base tracking-tight">Connexion Microsoft</h3>
                  <p className="text-white/40 text-xs">Authentification sécurisée OAuth2</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3.5 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2.5">
                <ShieldAlert className="w-4 h-4 flex-shrink-0 text-red-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Step Instructions */}
            <div className="space-y-3">
              <p className="text-xs text-white/70 leading-relaxed">
                1. Copiez votre code de vérification à usage unique ci-dessous :
              </p>

              {/* Code Box with 1-click Copy */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-black/60 border border-white/10">
                <span className="font-mono text-2xl font-black tracking-widest text-emerald-400 select-all px-2">
                  {payload?.user_code || '------'}
                </span>
                <button
                  onClick={handleCopyCode}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    copied
                      ? 'bg-emerald-500 text-neutral-950 shadow-md'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? 'Copié !' : 'Copier'}</span>
                </button>
              </div>

              <p className="text-xs text-white/70 leading-relaxed pt-1">
                2. Ouvrez la page d'autorisation Microsoft et collez le code :
              </p>

              <button
                onClick={handleOpenBrowser}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 text-neutral-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_6px_25px_rgba(52,211,153,0.35)] hover:brightness-110 cursor-pointer transition-all"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Ouvrir la page de connexion</span>
              </button>
            </div>

            {/* Waiting Footer */}
            <div className="pt-2 border-t border-white/5 flex items-center justify-center gap-2 text-white/40 text-[11px]">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>En attente de votre validation dans le navigateur...</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default MicrosoftDeviceCodeModal;
