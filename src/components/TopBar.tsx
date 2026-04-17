import React from 'react';
import { useLauncherState } from '../state';
import { motion } from 'framer-motion';

interface TopBarProps {
  onSettingsClick: () => void;
  onAccountClick: () => void;
}

const TopBar: React.FC<TopBarProps> = ({ onSettingsClick, onAccountClick }) => {
  const state = useLauncherState();
  const user = state.authCache;

  return (
    <div className="fixed top-0 left-0 right-0 p-12 flex justify-between items-start z-50">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={onAccountClick}
        className="flex items-center gap-4 group cursor-pointer bg-black/20 hover:bg-black/40 backdrop-blur-xl p-2 pr-6 rounded-2xl border border-white/10 transition-colors shadow-2xl"
      >
        <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/20 overflow-hidden shadow-lg relative transition-transform group-hover:scale-105 active:scale-95">
          {user ? (
            <img 
              src={`https://mc-heads.net/body/${user.uuid}/right`} 
              alt={user.name}
              className="w-full h-full object-cover object-top"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/50 bg-neutral-800">
              <sl-icon name="person" style={{ fontSize: '1.5rem' }}></sl-icon>
            </div>
          )}
        </div>
        <div className="flex flex-col">
          <span className="text-white font-semibold text-sm drop-shadow-md">
            {user ? user.name : 'Not Logged In'}
          </span>
          <span className="text-white/50 text-[10px] uppercase font-bold tracking-widest drop-shadow-sm">
            {user ? 'Microsoft' : 'Guest'}
          </span>
        </div>
      </motion.div>

      <motion.button 
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.1, rotate: 90 }}
        whileTap={{ scale: 0.9 }}
        onClick={onSettingsClick}
        className="w-12 h-12 rounded-2xl bg-black/20 hover:bg-black/40 backdrop-blur-xl border border-white/10 flex items-center justify-center text-white shadow-2xl transition-colors cursor-pointer"
      >
        <sl-icon name="gear-wide-connected" style={{ fontSize: '1.5rem' }}></sl-icon>
      </motion.button>
    </div>
  );
};

export default TopBar;
