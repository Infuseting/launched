import React from 'react';
import { useLauncherState } from '../hooks/useLauncherState';
import { motion, AnimatePresence } from 'framer-motion';

interface BottomBarProps {
  onPlayClick: () => void;
  isSyncing: boolean;
}

const BottomBar: React.FC<BottomBarProps> = ({ onPlayClick, isSyncing }) => {
  const state = useLauncherState();
  const session = state.globalSessions[state.activeSessionIndex];
  
  const playersOnline = state.serverStatus?.players?.online ?? 0;
  const playersMax = state.serverStatus?.players?.max ?? 0;
  const isOnline = state.serverStatus?.online ?? false;

  return (
    <div className="fixed bottom-0 left-0 right-0 p-10 flex flex-col items-center gap-8 z-50">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-2"
      >
        <h1 className="text-white text-4xl font-black tracking-tighter drop-shadow-[0_10px_10px_rgba(0,0,0,0.5)]">
          {session?.name || 'Launched'}
        </h1>
        
        {session?.hostname && (
          <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/10 shadow-xl">
            <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className="text-white/80 text-[11px] font-bold uppercase tracking-widest">
              {isOnline ? `${playersOnline} / ${playersMax} Players` : 'Server Offline'}
            </span>
          </div>
        )}
      </motion.div>

      <motion.button
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.05, y: -5 }}
        whileTap={{ scale: 0.95 }}
        onClick={onPlayClick}
        disabled={isSyncing}
        className={`
          group relative overflow-hidden
          px-20 py-6 rounded-[2rem]
          bg-gradient-to-br from-green-400 to-green-600
          text-white font-black text-2xl tracking-[0.2em] uppercase
          shadow-[0_25px_60px_-15px_rgba(34,197,94,0.5)]
          border border-green-300/30
          disabled:from-neutral-700 disabled:to-neutral-800 disabled:shadow-none
          transition-all duration-300 cursor-pointer
        `}
      >
        <AnimatePresence mode="wait">
          {isSyncing ? (
            <motion.div
              key="syncing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center gap-4"
            >
              <div className="w-6 h-6 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
              <span className="text-white/90">Syncing</span>
            </motion.div>
          ) : (
            <motion.span
              key="play"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="drop-shadow-lg"
            >
              Play
            </motion.span>
          )}
        </AnimatePresence>
        
        {/* Shine effect */}
        <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        <div className="absolute -inset-full bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-[-30deg] translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none" />
      </motion.button>
    </div>
  );
};

export default BottomBar;
