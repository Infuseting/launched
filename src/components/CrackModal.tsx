import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CrackModalProps {
  isOpen: boolean;
  defaultPseudo: string;
  onResolve: (pseudo: string | null) => void;
}

const CrackModal: React.FC<CrackModalProps> = ({ isOpen, defaultPseudo, onResolve }) => {
  const [pseudo, setPseudo] = useState(defaultPseudo);

  useEffect(() => {
    if (isOpen) {
      setPseudo(defaultPseudo);
    }
  }, [isOpen, defaultPseudo]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pseudo.trim()) {
      onResolve(pseudo.trim());
    }
  };

  const handleCancel = () => {
    onResolve(null);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-md flex items-center justify-center p-6"
          onClick={handleCancel}
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
                <p className="text-xs uppercase tracking-[0.2em] text-white/40 font-bold">Mode Crack</p>
                <h3 className="text-2xl font-black tracking-tight mt-1">Choisissez votre Pseudo</h3>
              </div>
              <button
                onClick={handleCancel}
                className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center cursor-pointer transition-colors"
              >
                <sl-icon name="x-lg"></sl-icon>
              </button>
            </div>

            <p className="text-sm text-white/75 mt-4 leading-relaxed">
              Ce serveur accepte les versions non-officielles (crackées). Entrez le pseudo que vous souhaitez utiliser en jeu.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 focus-within:border-white/30 focus-within:bg-white/[0.05] transition-all">
                <p className="text-[11px] uppercase tracking-widest text-white/40 font-bold mb-2">Pseudo (Pseudonyme)</p>
                <input
                  type="text"
                  value={pseudo}
                  onChange={(e) => setPseudo(e.target.value)}
                  placeholder="Steve"
                  autoFocus
                  className="w-full bg-transparent border-none outline-none text-2xl font-black tracking-wide text-white placeholder-white/20"
                />
              </div>

              <div className="mt-8 flex gap-3">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex-1 rounded-2xl bg-white/10 border border-white/10 font-bold py-3 cursor-pointer hover:bg-white/20 hover:-translate-y-0.5 active:translate-y-0 transition-all"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={!pseudo.trim()}
                  className="flex-1 rounded-2xl bg-green-400 text-neutral-950 border border-green-300 font-bold py-3 cursor-pointer hover:bg-green-300 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Lancer le jeu
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CrackModal;
