import React from 'react';
import { useLauncherState } from '../state';
import { motion } from 'framer-motion';
import { Settings, User as UserIcon, ShieldCheck } from 'lucide-react';

interface TopBarProps {
  onSettingsClick: () => void;
  onAccountClick: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onSettingsClick, onAccountClick }) => {
  const state = useLauncherState();
  const user = state.authCache;

  return (
    <header className="fixed top-0 left-0 right-0 p-8 flex justify-between items-center z-40 pointer-events-none">
      {/* Player Profile Capsule */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        onClick={onAccountClick}
        className="group pointer-events-auto flex items-center gap-3.5 px-3.5 py-2.5 rounded-2xl bg-neutral-900/70 hover:bg-neutral-850/90 border border-white/10 hover:border-white/20 backdrop-blur-2xl transition-all duration-200 cursor-pointer shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
      >
        <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-neutral-800 border border-white/10 flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform duration-200">
          {user ? (
            <img
              src={`https://mc-heads.net/avatar/${user.uuid}/64`}
              alt={user.name}
              className="w-full h-full object-cover rendering-pixelated"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          ) : (
            <UserIcon className="w-5 h-5 text-white/40" />
          )}
        </div>

        <div className="flex flex-col pr-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-white tracking-tight group-hover:text-emerald-300 transition-colors">
              {user ? user.name : 'Non connecté'}
            </span>
            {user && (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 opacity-80" />
            )}
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
            {user ? 'Compte Actif' : 'Mode Invité'}
          </span>
        </div>
      </motion.div>

      {/* Settings Action Button */}
      <motion.button
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onSettingsClick}
        className="group pointer-events-auto w-11 h-11 rounded-2xl bg-neutral-900/70 hover:bg-neutral-850/90 border border-white/10 hover:border-white/20 backdrop-blur-2xl flex items-center justify-center text-white/80 hover:text-white transition-all duration-200 cursor-pointer shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
        title="Paramètres"
      >
        <Settings className="w-5 h-5 transition-transform duration-500 ease-out group-hover:rotate-90 text-white/70 group-hover:text-white" />
      </motion.button>
    </header>
  );
};

export default TopBar;
