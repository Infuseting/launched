import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { LauncherState } from '../state';

interface ServerSelectModalProps {
  isOpen: boolean;
  state: LauncherState;
  onSelect: (index: number) => void;
  onClose: () => void;
}

const ServerSelectModal: React.FC<ServerSelectModalProps> = ({
  isOpen,
  state,
  onSelect,
  onClose
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-8"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="sl-theme-dark bg-neutral-900/80 border border-white/10 rounded-[2.5rem] overflow-hidden max-w-lg w-full shadow-[0_50px_100px_rgba(0,0,0,0.5)] flex flex-col max-h-[70vh] text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-8 pb-4 border-b border-white/5 bg-white/5">
              <h2 className="text-2xl font-black text-white tracking-tight">Select a Server</h2>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">Choose your destination</p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              <div className="space-y-2">
                {state.globalSessions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      onSelect(i);
                      onClose();
                    }}
                    className={`w-full group flex items-center gap-4 p-4 rounded-2xl transition-all cursor-pointer border ${
                      i === state.activeSessionIndex
                        ? '!bg-white !text-zinc-950 border-white shadow-xl scale-[1.02]'
                        : 'bg-white/5 text-white/60 border-transparent hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl overflow-hidden ${
                      i === state.activeSessionIndex ? 'bg-black text-white' : 'bg-white/10 text-white/50'
                    }`}>
                      {s.assetsData?.icon ? (
                        <img src={s.assetsData.icon} alt={s.name} className="w-full h-full object-cover" />
                      ) : (
                        "⚡"
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <div className="font-bold flex items-center gap-2">
                        {s.name}
                        {s.isDefault && <span className="text-yellow-500 text-xs">★</span>}
                      </div>
                      <div className="flex gap-2 mt-1">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${
                          i === state.activeSessionIndex ? 'bg-black/10' : 'bg-green-500/20 text-green-400'
                        }`}>
                          {s.minecraft}
                        </span>
                        {s.forge && (
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${
                            i === state.activeSessionIndex ? 'bg-black/10' : 'bg-orange-500/20 text-orange-400'
                          }`}>
                            Forge {s.forge}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 bg-white/2 border-t border-white/5 flex justify-center">
              <button 
                onClick={onClose}
                className="text-white/40 hover:text-white text-[10px] font-black uppercase tracking-widest p-2 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ServerSelectModal;
