import { useModalFocus } from '../hooks/useModalFocus';
import React, { useState, useEffect } from 'react';
import { User, Check, ShieldAlert } from 'lucide-react';
import ModalShell from './ModalShell';

interface CrackModalProps {
  isOpen: boolean;
  defaultPseudo?: string;
  onResolve: (pseudo: string | null) => void;
}

export const CrackModal: React.FC<CrackModalProps> = ({
  isOpen,
  defaultPseudo = '',
  onResolve,
}) => {
  const dialogRef = useModalFocus(isOpen, 50);
  const [pseudo, setPseudo] = useState(defaultPseudo);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPseudo(defaultPseudo);
      setValidationError(null);
    }
  }, [isOpen, defaultPseudo]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = pseudo.trim();

    if (!trimmed) {
      setValidationError('Veuillez entrer un pseudo.');
      return;
    }

    if (trimmed.length < 3 || trimmed.length > 16) {
      setValidationError('Le pseudo doit contenir entre 3 et 16 caractères.');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      setValidationError(
        'Caractères alphanumériques et underscores uniquement.',
      );
      return;
    }

    onResolve(trimmed);
  };

  const handleCancel = () => {
    onResolve(null);
  };

  return (
    <ModalShell
      isOpen={isOpen}
      dialogRef={dialogRef}
      titleId="offline-login-title"
      title="Connexion Hors-Ligne"
      subtitle="Serveur en mode crack / hors-ligne"
      icon={<User className="w-5 h-5" />}
      onBackdropClick={handleCancel}
      onClose={handleCancel}
    >
      {validationError && (
        <div
          id="offline-login-error"
          role="alert"
          className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-2.5"
        >
          <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
          <span>{validationError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="offline-pseudo"
            className="text-[11px] font-medium text-white/50 uppercase tracking-wider block"
          >
            Pseudo Joueur
          </label>
          <input
            id="offline-pseudo"
            data-initial-focus
            aria-invalid={!!validationError}
            aria-describedby={
              validationError ? 'offline-login-error' : undefined
            }
            type="text"
            value={pseudo}
            onChange={(e) => {
              setPseudo(e.target.value);
              if (validationError) setValidationError(null);
            }}
            placeholder="ex: Jean_Mineur"
            maxLength={16}
            className="w-full bg-black/40 border border-white/10 focus:border-white/30 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-white/20 outline-none transition-colors"
          />
        </div>

        <div className="flex gap-2.5 pt-1">
          <button
            type="button"
            onClick={handleCancel}
            className="flex-1 py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white font-medium text-xs transition-colors cursor-pointer text-center"
          >
            Annuler
          </button>
          <button
            type="submit"
            className="flex-1 py-2.5 px-4 rounded-xl bg-white text-neutral-950 font-bold text-xs hover:bg-neutral-200 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm text-center"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Valider</span>
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

export default CrackModal;
