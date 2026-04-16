import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AuthResponse } from '../types';

interface AccountSwitcherProps {
  accounts: AuthResponse[];
  activeUuid?: string | null;
  onSwap: (uuid: string) => Promise<void>;
  onRemove: (uuid: string) => Promise<void>;
  onAdd: () => Promise<void>;
}

const AccountSwitcher: React.FC<AccountSwitcherProps> = ({
  accounts,
  activeUuid,
  onSwap,
  onRemove,
  onAdd
}) => {
  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        <AnimatePresence mode="popLayout">
          {accounts.map((account) => (
            <motion.div
              key={account.uuid}
              layout
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`group flex items-center justify-between p-4 rounded-3xl transition-all border ${
                activeUuid === account.uuid
                  ? 'bg-white/10 border-white/20'
                  : 'bg-white/5 border-white/5 hover:bg-white/8 hover:border-white/10'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="relative">
                  <img
                    src={`https://minotar.net/avatar/${account.name}/64`}
                    alt={account.name}
                    className="w-12 h-12 rounded-2xl shadow-lg group-hover:scale-105 transition-transform"
                  />
                  {activeUuid === account.uuid && (
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-neutral-900 rounded-full" />
                  )}
                </div>
                <div>
                  <h3 className="text-white font-bold tracking-tight">{account.name}</h3>
                  <p className="text-white/40 text-xs font-medium uppercase tracking-widest">
                    {activeUuid === account.uuid ? 'Active Session' : 'Stored Account'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activeUuid !== account.uuid && (
                  <button
                    onClick={() => onSwap(account.uuid)}
                    className="px-4 py-2 rounded-2xl bg-white/10 hover:bg-white text-white hover:text-black text-sm font-black transition-all cursor-pointer"
                  >
                    SWAP
                  </button>
                )}
                <button
                  onClick={() => onRemove(account.uuid)}
                  className="w-10 h-10 rounded-2xl bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white flex items-center justify-center transition-all cursor-pointer"
                  title="Remove Account"
                >
                  <sl-icon name="trash3-fill"></sl-icon>
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <button
        onClick={onAdd}
        className="w-full p-4 rounded-3xl bg-white/5 hover:bg-white/10 border-2 border-dashed border-white/10 hover:border-white/20 flex items-center justify-center gap-3 text-white/60 hover:text-white transition-all cursor-pointer group"
      >
        <div className="w-8 h-8 rounded-xl bg-white/5 group-hover:bg-white group-hover:text-black flex items-center justify-center transition-all">
          <sl-icon name="plus-lg"></sl-icon>
        </div>
        <span className="font-bold tracking-tight">Add Microsoft Account</span>
      </button>
    </div>
  );
};

export default AccountSwitcher;
