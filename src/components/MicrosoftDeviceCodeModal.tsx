import { useModalFocus } from '../hooks/useModalFocus';
import React, { useEffect, useState } from 'react';
import type { DeviceCodePayload } from '../types';
import { open } from '@tauri-apps/plugin-shell';
import { KeyRound, Copy, Check, ExternalLink, ShieldAlert } from 'lucide-react';
import ModalShell from './ModalShell';

interface MicrosoftDeviceCodeModalProps {
  isOpen: boolean;
  payload: DeviceCodePayload | null;
  errorMessage: string | null;
  onClose: () => void;
}

export const MicrosoftDeviceCodeModal: React.FC<
  MicrosoftDeviceCodeModalProps
> = ({ isOpen, payload, errorMessage, onClose }) => {
  const dialogRef = useModalFocus(isOpen, 30);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    setCopied(false);
  }, [isOpen, payload?.user_code]);

  const handleCopyCode = async () => {
    if (!payload?.user_code) return;
    try {
      await navigator.clipboard.writeText(payload.user_code);
      setCopied(true);
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
    <ModalShell
      isOpen={isOpen}
      dialogRef={dialogRef}
      titleId="microsoft-login-title"
      title="Connexion Microsoft"
      subtitle="Authentification sécurisée OAuth2"
      icon={<KeyRound className="w-5 h-5" />}
      onBackdropClick={onClose}
      onClose={onClose}
    >
      {errorMessage && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-2.5"
        >
          <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="space-y-3.5">
        <div>
          <span className="text-[11px] font-medium text-white/50 uppercase tracking-wider block mb-2">
            Code d&apos;autorisation unique
          </span>

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
              {copied ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copied ? 'Copié !' : 'Copier'}</span>
            </button>
          </div>
        </div>

        <p className="text-xs text-white/60 leading-relaxed">
          Cliquez ci-dessous pour ouvrir la page officielle Microsoft et valider
          la connexion avec ce code.
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

      <div className="pt-2 border-t border-white/5 flex items-center justify-center gap-2 text-white/40 text-[11px]">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span>En attente de validation dans votre navigateur...</span>
      </div>
    </ModalShell>
  );
};

export default MicrosoftDeviceCodeModal;
