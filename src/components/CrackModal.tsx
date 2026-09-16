import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Check, X, ShieldAlert } from 'lucide-react';

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
  const [pseudo, setPseudo] = useState(defaultPseudo);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPseudo(defaultPseudo);
      setValidationError(null);
      setTimeout(() => inputRef.current?.focus(), 50);
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
      setValidationError('Caractères alphanumériques et underscores uniquement.');
      return;
    }

    onResolve(trimmed);
  };

  const handleCancel = () => {
    onResolve(null);
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
            onClick={handleCancel}
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
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm tracking-tight text-white">Connexion Hors-Ligne</h3>
                  <p className="text-white/50 text-xs mt-0.5">Serveur en mode crack / hors-ligne</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancel}
                className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Error banner */}
            {validationError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
                <span>{validationError}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-white/50 uppercase tracking-wider block">
                  Pseudo Joueur
                </label>
                <input
                  ref={inputRef}
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
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default CrackModal;
