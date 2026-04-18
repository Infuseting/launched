import React from 'react';
import { useLauncherState } from '../state';
import { motion, AnimatePresence } from 'framer-motion';

interface BottomBarProps {
  onPlayClick: () => void;
  onServerSelectClick: () => void;
  isSyncing: boolean;
}

const BottomBar: React.FC<BottomBarProps> = ({ onPlayClick, onServerSelectClick, isSyncing }) => {
  const state = useLauncherState();
  const session = state.globalSessions[state.activeSessionIndex];

  const playersOnline = state.serverStatus?.players?.online ?? 0;
  const playersMax = state.serverStatus?.players?.max ?? 0;
  const isOnline = state.serverStatus?.online ?? false;

  return (
    <div className="fixed bottom-0 left-0 right-0 p-16 flex flex-col items-center gap-8 z-50">
      <sl-tooltip hoist distance={20}>
        <div slot="content" className="p-3 min-w-[200px] space-y-4">
          <div className="border-b border-white/10 pb-2">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Game Server</h4>
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold">{isOnline ? 'Online' : 'Offline'}</span>
              <span className="font-mono text-white/60">{isOnline ? `${playersOnline} / ${playersMax}` : '--'}</span>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-white/40">Mojang Services</h4>
            {[
              { id: 'auth', label: 'Authentication', ok: state.mojangStatus?.auth ?? true },
              { id: 'session', label: 'Sessions', ok: state.mojangStatus?.session ?? true },
              { id: 'api', label: 'API / Skins', ok: state.mojangStatus?.api ?? true }
            ].map(svc => (
              <div key={svc.id} className="flex justify-between items-center text-[11px]">
                <span className="text-white/80">{svc.label}</span>
                <div className={`w-2 h-2 rounded-full ${svc.ok ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`}></div>
              </div>
            ))}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-2 cursor-pointer group"
          onClick={onServerSelectClick}
        >
          <div className="flex items-center gap-4">
            <h1 className="text-white text-4xl font-black tracking-tighter drop-shadow-[0_10px_10px_rgba(0,0,0,0.5)] group-hover:scale-105 transition-transform">
              {session?.name || 'Launched'}
            </h1>
            <div className={`w-3 h-3 rounded-full mt-2 ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'} shadow-lg`}></div>
          </div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/55 group-hover:text-white/80 transition-colors">
            Clique ici pour changer de version
          </p>
        </motion.div>
      </sl-tooltip>

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
              className="flex flex-col items-center justify-center w-full px-8 gap-2"
            >
              <div className="flex items-center justify-between w-full gap-8">
                <span className="text-white/90 text-[10px] font-black tracking-widest uppercase truncate max-w-[220px]">
                  {state.syncProgress.current_file || "Synchronizing..."}
                </span>
                <span className="text-white font-black text-xs tabular-nums">
                  {Math.round(state.syncProgress.percentage)}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-black/20 rounded-full overflow-hidden border border-white/5">
                <motion.div
                  className="h-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                  initial={{ width: 0 }}
                  animate={{ width: `${state.syncProgress.percentage}%` }}
                  transition={{ type: "spring", bounce: 0, duration: 0.5 }}
                />
              </div>
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
