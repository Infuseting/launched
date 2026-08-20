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
                <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-400">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base tracking-tight">Connexion Hors-Ligne</h3>
                  <p className="text-white/40 text-xs">Serveur en mode crack / hors-ligne</p>
                </div>
              </div>
              <button
                onClick={handleCancel}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Error banner */}
            {validationError && (
              <div className="p-3.5 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2.5">
                <ShieldAlert className="w-4 h-4 flex-shrink-0 text-red-400" />
                <span>{validationError}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-white/50 block">
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
                  className="w-full bg-black/50 border border-white/10 focus:border-amber-400/50 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none transition-colors"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex-1 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 text-neutral-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_6px_25px_rgba(245,158,11,0.3)] hover:brightness-110 cursor-pointer transition-all"
                >
                  <Check className="w-4 h-4" />
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
