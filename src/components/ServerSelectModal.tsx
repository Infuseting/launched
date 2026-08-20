import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { LauncherState } from '../state';
import { ArrowLeft, Server, Star, Check, Search, Box } from 'lucide-react';

interface ServerSelectModalProps {
  isOpen: boolean;
  state: LauncherState;
  onSelect: (index: number) => void;
  onClose: () => void;
}

export const ServerSelectModal: React.FC<ServerSelectModalProps> = ({
  isOpen,
  state,
  onSelect,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSessions = state.globalSessions
    .map((s, index) => ({ ...s, originalIndex: index }))
    .filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.minecraft.includes(searchQuery));

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="fixed inset-0 z-50 bg-neutral-950/98 backdrop-blur-3xl flex flex-col text-white select-none overflow-hidden"
        >
          {/* Top Bar Header */}
          <header className="h-16 px-8 border-b border-white/10 flex items-center justify-between bg-black/40 flex-shrink-0">
            <div className="flex items-center gap-4">
              <button
                onClick={onClose}
                className="group flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-xs font-bold text-white transition-all cursor-pointer shadow-md"
              >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                <span>Retour au Launcher</span>
              </button>

              <div className="h-4 w-px bg-white/10" />

              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-black tracking-tight">Hub des Serveurs & Versions</span>
                <span className="text-[10px] font-mono font-bold bg-white/5 px-2 py-0.5 rounded-md text-white/50 border border-white/5">
                  {state.globalSessions.length} disponible{state.globalSessions.length > 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Search Input in header */}
            <div className="relative w-80">
              <Search className="w-4 h-4 text-white/30 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher par nom ou version..."
                className="w-full bg-white/5 border border-white/10 focus:border-emerald-500/50 rounded-2xl pl-10 pr-4 py-2 text-xs text-white placeholder-white/30 outline-none transition-colors"
              />
            </div>
          </header>

          {/* Main Grid Content */}
          <main className="flex-1 overflow-y-auto p-10 custom-scrollbar">
            <div className="max-w-6xl mx-auto space-y-6">
              <div>
                <h2 className="text-2xl font-black tracking-tight">Choisissez votre Destination</h2>
                <p className="text-white/40 text-xs mt-1">
                  Sélectionnez le serveur ou le modpack sur lequel vous souhaitez vous connecter.
                </p>
              </div>

              {filteredSessions.length === 0 ? (
                <div className="text-center py-20 text-white/30 text-xs rounded-3xl border border-dashed border-white/10 p-10 space-y-2">
                  <Box className="w-10 h-10 mx-auto opacity-30 mb-1" />
                  <p className="font-semibold text-sm">Aucun serveur trouvé</p>
                  <p className="text-[11px] text-white/20">Modifiez votre recherche pour voir d'autres résultats.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {filteredSessions.map((s) => {
                    const isActive = s.originalIndex === state.activeSessionIndex;
                    const bgUrl = Array.isArray(s.assetsData?.background)
                      ? s.assetsData.background[0]
                      : s.assetsData?.background;

                    return (
                      <motion.div
                        key={s.originalIndex}
                        layout
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        whileHover={{ y: -4, transition: { duration: 0.15 } }}
                        onClick={() => {
                          onSelect(s.originalIndex);
                          onClose();
                        }}
                        className={`
                          group relative rounded-3xl overflow-hidden border transition-all duration-200 cursor-pointer flex flex-col justify-between
                          ${
                            isActive
                              ? 'bg-neutral-900/90 border-emerald-500/50 shadow-[0_10px_35px_rgba(16,185,129,0.2)] ring-1 ring-emerald-500/40'
                              : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/10 hover:border-white/25 shadow-lg'
                          }
                        `}
                        style={{ minHeight: '190px' }}
                      >
                        {/* Background Banner Preview */}
                        {bgUrl && (
                          <div className="absolute inset-0 z-0 opacity-20 group-hover:opacity-30 transition-opacity pointer-events-none">
                            <img src={bgUrl} alt="" className="w-full h-full object-cover select-none" />
                            <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/80 to-transparent" />
                          </div>
                        )}

                        {/* Top Card Info */}
                        <div className="relative z-10 p-5 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3.5">
                              {/* Server Icon */}
                              <div className="w-13 h-13 rounded-2xl overflow-hidden bg-neutral-800 border border-white/15 flex items-center justify-center flex-shrink-0 shadow-inner group-hover:scale-105 transition-transform duration-200">
                                {s.assetsData?.icon ? (
                                  <img src={s.assetsData.icon} alt={s.name} className="w-full h-full object-cover" />
                                ) : (
                                  <Box className="w-7 h-7 text-white/40" />
                                )}
                              </div>

                              <div>
                                <div className="flex items-center gap-1.5">
                                  <h3 className={`font-black text-base tracking-tight ${isActive ? 'text-emerald-300' : 'text-white'}`}>
                                    {s.name}
                                  </h3>
                                  {s.isDefault && (
                                    <Star className="w-4 h-4 fill-amber-400 text-amber-400 flex-shrink-0" />
                                  )}
                                </div>

                                {s.hostname ? (
                                  <p className="text-[11px] font-mono text-white/40">{s.hostname}</p>
                                ) : (
                                  <p className="text-[11px] text-white/40">Configuration officielle</p>
                                )}
                              </div>
                            </div>

                            {/* Active badge or Select check */}
                            {isActive ? (
                              <span className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider text-emerald-300">
                                <Check className="w-3.5 h-3.5" />
                                Actuel
                              </span>
                            ) : null}
                          </div>

                          {/* Version & Modloader Badges */}
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-lg bg-white/10 text-white/90 border border-white/5">
                              MC {s.minecraft}
                            </span>
                            {s.forge && (
                              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/20">
                                Forge {s.forge}
                              </span>
                            )}
                            {s.neoforge && (
                              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-lg bg-orange-500/20 text-orange-300 border border-orange-500/20">
                                NeoForge {s.neoforge}
                              </span>
                            )}
                            {s.fabric && (
                              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-500/20">
                                Fabric {s.fabric}
                              </span>
                            )}
                            {s.quilt && (
                              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/20">
                                Quilt {s.quilt}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Bottom Card Action Footer */}
                        <div className="relative z-10 p-4 px-5 bg-black/40 border-t border-white/5 flex items-center justify-between text-xs">
                          <span className="text-white/40 text-[11px]">
                            {isActive ? 'Session prête au lancement' : 'Cliquer pour sélectionner'}
                          </span>
                          <button
                            type="button"
                            className={`px-3.5 py-1 rounded-xl text-xs font-bold transition-all ${
                              isActive
                                ? 'bg-emerald-400 text-neutral-950 font-black'
                                : 'bg-white/10 group-hover:bg-white text-white group-hover:text-neutral-950'
                            }`}
                          >
                            {isActive ? 'Sélectionné' : 'Rejoindre'}
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </main>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ServerSelectModal;
