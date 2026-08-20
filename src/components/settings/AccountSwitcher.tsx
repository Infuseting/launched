import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AuthResponse } from '../../types';
import { Plus, Trash2, ArrowRightLeft, ShieldCheck } from 'lucide-react';

interface AccountSwitcherProps {
  accounts: AuthResponse[];
  activeUuid?: string | null;
  onSwap: (uuid: string) => Promise<void>;
  onRemove: (uuid: string) => Promise<void>;
  onAdd: () => Promise<void>;
}

export const AccountSwitcher: React.FC<AccountSwitcherProps> = ({
  accounts,
  activeUuid,
  onSwap,
  onRemove,
  onAdd,
}) => {
  return (
    <div className="space-y-4">
      <div className="grid gap-2.5">
        <AnimatePresence mode="popLayout">
          {accounts.map((account) => {
            const isActive = activeUuid === account.uuid;
            return (
              <motion.div
                key={account.uuid}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`
                  group flex items-center justify-between p-3.5 rounded-2xl transition-all duration-200 border
                  ${
                    isActive
                      ? 'bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.1)]'
                      : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/5 hover:border-white/10'
                  }
                `}
              >
                <div className="flex items-center gap-3.5">
                  <div className="relative w-11 h-11 rounded-xl overflow-hidden bg-neutral-800 border border-white/10 flex items-center justify-center shadow-inner flex-shrink-0">
                    <img
                      src={`https://mc-heads.net/avatar/${account.uuid}/64`}
                      alt={account.name}
                      className="w-full h-full object-cover rendering-pixelated"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    {isActive && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-400 border-2 border-neutral-900 rounded-full" />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className={`font-bold text-sm ${isActive ? 'text-emerald-300' : 'text-white'}`}>
                        {account.name}
                      </h3>
                      {isActive && <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />}
                    </div>
                    <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wider">
                      {isActive ? 'Session Active' : 'Compte Enregistré'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!isActive && (
                    <button
                      onClick={() => onSwap(account.uuid)}
                      className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white text-white hover:text-neutral-950 text-xs font-bold transition-all duration-150 cursor-pointer flex items-center gap-1.5"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      <span>Activer</span>
                    </button>
                  )}
                  <button
                    onClick={() => onRemove(account.uuid)}
                    className="w-8 h-8 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 flex items-center justify-center transition-all cursor-pointer"
                    title="Supprimer ce compte"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Add Microsoft Account Button */}
      <button
        onClick={onAdd}
        className="w-full p-4 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-dashed border-white/15 hover:border-emerald-500/40 flex items-center justify-center gap-2.5 text-white/70 hover:text-emerald-300 transition-all duration-200 cursor-pointer group"
      >
        <div className="w-7 h-7 rounded-xl bg-white/5 group-hover:bg-emerald-500/20 group-hover:text-emerald-300 flex items-center justify-center transition-colors">
          <Plus className="w-4 h-4" />
        </div>
        <span className="font-bold text-xs">Ajouter un compte Microsoft</span>
      </button>
    </div>
  );
};

export default AccountSwitcher;
