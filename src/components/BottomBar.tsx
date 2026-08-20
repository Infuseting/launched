import React, { useState } from 'react';
import { useLauncherState } from '../state';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, ChevronUp, Users, Server, Shield, Layers, Download, FileText } from 'lucide-react';

interface BottomBarProps {
  onPlayClick: () => void;
  onServerSelectClick: () => void;
  isSyncing: boolean;
}

export const BottomBar: React.FC<BottomBarProps> = ({ onPlayClick, onServerSelectClick, isSyncing }) => {
  const state = useLauncherState();
  const session = state.globalSessions[state.activeSessionIndex];
  const [showStatusPopover, setShowStatusPopover] = useState(false);
  const [showSyncTooltip, setShowSyncTooltip] = useState(false);

  const playersOnline = state.serverStatus?.players?.online ?? 0;
  const playersMax = state.serverStatus?.players?.max ?? 0;
  const isOnline = state.serverStatus?.online ?? false;

  const currentFile = state.syncProgress.current_file || '';
  const filesDone = state.syncProgress.files_done || 0;
  const totalFiles = state.syncProgress.total_files || 0;
  const percentage = Math.round(state.syncProgress.percentage || 0);

  // Short display label for the button face
  const fileNameOnly = currentFile ? currentFile.split(/[/\\]/).pop() || currentFile : 'Synchronisation...';

  return (
    <footer className="fixed bottom-0 left-0 right-0 p-8 pb-10 flex flex-col items-center gap-4 z-40">
      {/* Session Pill & Status Tooltip Popover */}
      <div className="relative">
        <AnimatePresence>
          {showStatusPopover && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-64 p-4 rounded-2xl bg-neutral-900/95 border border-white/10 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] text-white space-y-3 z-50 pointer-events-none"
            >
              {/* Game Server Status */}
              <div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1.5">
                  <Server className="w-3 h-3" />
                  <span>Serveur de Jeu</span>
                </div>
                <div className="flex justify-between items-center text-xs bg-white/5 px-2.5 py-1.5 rounded-xl border border-white/5">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-red-400'}`} />
                    <span className="font-semibold">{isOnline ? 'En ligne' : 'Hors ligne'}</span>
                  </div>
                  <div className="flex items-center gap-1 font-mono text-white/60 text-[11px]">
                    <Users className="w-3 h-3 opacity-60" />
                    <span>{isOnline ? `${playersOnline}/${playersMax}` : '--'}</span>
                  </div>
                </div>
              </div>

              {/* Mojang Services */}
              <div className="space-y-1.5 pt-1 border-t border-white/5">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1">
                  <Shield className="w-3 h-3" />
                  <span>Services Mojang</span>
                </div>
                {[
                  { id: 'auth', label: 'Authentification', ok: state.mojangStatus?.auth ?? true },
                  { id: 'session', label: 'Sessions multijoueur', ok: state.mojangStatus?.session ?? true },
                  { id: 'api', label: 'API & Skins', ok: state.mojangStatus?.api ?? true },
                ].map((svc) => (
                  <div key={svc.id} className="flex justify-between items-center text-[11px] text-white/75 px-1">
                    <span>{svc.label}</span>
                    <div className={`w-1.5 h-1.5 rounded-full ${svc.ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Clickable Session Card */}
        <motion.button
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          onMouseEnter={() => setShowStatusPopover(true)}
          onMouseLeave={() => setShowStatusPopover(false)}
          onClick={onServerSelectClick}
          className="group flex items-center gap-3 px-5 py-2 rounded-2xl bg-neutral-900/60 hover:bg-neutral-800/80 border border-white/10 hover:border-white/20 backdrop-blur-2xl transition-all duration-200 cursor-pointer shadow-lg"
        >
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-red-400'}`} />
            <span className="text-white font-black text-sm tracking-tight group-hover:text-emerald-300 transition-colors">
              {session?.name || 'Launched'}
            </span>
          </div>

          <div className="h-3.5 w-px bg-white/10" />

          <div className="flex items-center gap-1.5 text-white/40 group-hover:text-white/70 text-[11px] font-medium transition-colors">
            <Layers className="w-3.5 h-3.5" />
            <span>Changer</span>
            <ChevronUp className="w-3 h-3 group-hover:-translate-y-0.5 transition-transform" />
          </div>
        </motion.button>
      </div>

      {/* Hero Play & Sync Button Container */}
      <div
        className="relative w-full max-w-[360px]"
        onMouseEnter={() => isSyncing && setShowSyncTooltip(true)}
        onMouseLeave={() => setShowSyncTooltip(false)}
      >
        {/* Full File Sync Tooltip */}
        <AnimatePresence>
          {isSyncing && showSyncTooltip && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-[360px] p-4 rounded-2xl bg-neutral-900/98 border border-white/15 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] text-white space-y-2.5 z-50"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  <Download className="w-3.5 h-3.5 animate-bounce" />
                  <span>Détails du téléchargement</span>
                </div>
                {totalFiles > 0 && (
                  <span className="text-[10px] font-mono font-bold text-white/60 bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
                    {filesDone} / {totalFiles} fichiers
                  </span>
                )}
              </div>

              {/* Complete File Path */}
              <div className="p-2.5 rounded-xl bg-black/50 border border-white/5 space-y-1">
                <div className="flex items-center gap-1 text-[10px] text-white/40 font-semibold">
                  <FileText className="w-3 h-3" />
                  <span>Fichier en cours :</span>
                </div>
                <p className="font-mono text-xs text-white/90 break-all leading-relaxed max-h-24 overflow-y-auto custom-scrollbar pr-1">
                  {currentFile || 'Préparation des fichiers...'}
                </p>
              </div>

              {/* Progress and percentage */}
              <div className="flex justify-between items-center text-xs pt-0.5">
                <span className="text-white/50 text-[11px]">Progression totale</span>
                <span className="font-mono font-bold text-emerald-400 tabular-nums">{percentage}%</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={!isSyncing ? { scale: 1.03, y: -2 } : {}}
          whileTap={!isSyncing ? { scale: 0.97 } : {}}
          onClick={onPlayClick}
          disabled={isSyncing}
          className={`
            relative overflow-hidden
            w-full h-[60px] rounded-2xl
            flex items-center justify-center
            transition-all duration-300 cursor-pointer
            ${
              isSyncing
                ? 'bg-neutral-900/90 border border-white/10 shadow-2xl cursor-pointer'
                : 'bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400 text-neutral-950 font-black border border-emerald-300/40 shadow-[0_12px_40px_-8px_rgba(16,185,129,0.5)] hover:shadow-[0_16px_50px_-6px_rgba(16,185,129,0.65)] hover:brightness-105'
            }
          `}
        >
          <AnimatePresence mode="wait">
            {isSyncing ? (
              <motion.div
                key="syncing"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col justify-center w-full px-6 gap-1.5"
              >
                <div className="flex items-center justify-between text-xs font-bold text-white">
                  <span className="text-white/80 truncate max-w-[220px] text-[11px] font-medium">
                    {fileNameOnly}
                  </span>
                  <span className="font-mono text-emerald-400 tabular-nums">
                    {percentage}%
                  </span>
                </div>
                <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden border border-white/5">
                  <motion.div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full shadow-[0_0_12px_rgba(52,211,153,0.8)]"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(2, percentage)}%` }}
                    transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="play"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-3"
              >
                <Play className="w-6 h-6 fill-current text-neutral-950" />
                <span className="text-xl tracking-widest uppercase font-black">
                  JOUER
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Shimmer light pass on hover */}
          {!isSyncing && (
            <div className="absolute -inset-full bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-[-25deg] translate-x-[-150%] group-hover:translate-x-[150%] transition-transform duration-1000 pointer-events-none" />
          )}
        </motion.button>
      </div>
    </footer>
  );
};

export default BottomBar;
