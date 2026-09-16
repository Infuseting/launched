import React from 'react';
import type { LauncherState } from '../../state';
import type { AppHandlers } from '../../types';
import Slider from '../ui/Slider';
import Switch from '../ui/Switch';
import { Cpu, Terminal, RefreshCw, ArrowUpCircle, ExternalLink } from 'lucide-react';
import { open } from '@tauri-apps/plugin-shell';

interface SettingsGeneralTabProps {
  localMinRam: number;
  localMaxRam: number;
  localShowLogs: boolean;
  maxSystemRam: number;
  state: LauncherState;
  handlers: Pick<AppHandlers, 'handleCheckUpdate' | 'handleInstallUpdate'>;
  onMinRamChange: (val: number) => void;
  onMaxRamChange: (val: number) => void;
  onShowLogsChange: (val: boolean) => void;
}

export const SettingsGeneralTab: React.FC<SettingsGeneralTabProps> = ({
  localMinRam,
  localMaxRam,
  localShowLogs,
  maxSystemRam,
  state,
  handlers,
  onMinRamChange,
  onMaxRamChange,
  onShowLogsChange,
}) => {
  return (
    <div className="space-y-6">
      {/* RAM Allocation Panel */}
      <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 space-y-6">
        <div className="flex items-center gap-2.5 pb-2 border-b border-white/5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-400/25 flex items-center justify-center text-emerald-400">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-white font-black text-sm tracking-tight">Allocation de la Mémoire RAM</h3>
            <p className="text-[11px] text-white/40">Mémoire maximale du système détectée : {maxSystemRam} Go</p>
          </div>
        </div>

        <div className="grid gap-6">
          <Slider
            label="RAM Minimale au Démarrage"
            min={1}
            max={Math.max(4, maxSystemRam)}
            step={1}
            value={localMinRam}
            unit="Go"
            onChange={onMinRamChange}
          />

          <Slider
            label="RAM Maximale Allouée (Recommandé : 4 à 8 Go)"
            min={1}
            max={maxSystemRam}
            step={1}
            value={localMaxRam}
            unit="Go"
            onChange={onMaxRamChange}
          />
        </div>
      </div>

      {/* Logs & Diagnostics Panel */}
      <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-white font-bold text-xs">Afficher la console de logs en jeu</h4>
              <p className="text-white/40 text-[11px]">Ouvre une fenêtre détaillée pendant le lancement</p>
            </div>
          </div>
          <Switch checked={localShowLogs} onChange={onShowLogsChange} />
        </div>
      </div>

      {/* Launcher Update Panel */}
      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/90">
              <ArrowUpCircle className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-white font-semibold text-xs tracking-tight">Mise à jour du Launcher</h4>
              <p className="text-white/40 text-[11px] font-mono">Version actuelle : v{state.appVersion}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handlers.handleCheckUpdate()}
            disabled={state.isCheckingUpdate || state.isInstallingUpdate}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-semibold transition-all duration-150 cursor-pointer disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${state.isCheckingUpdate ? 'animate-spin' : ''}`} />
            <span>{state.isCheckingUpdate ? 'Recherche...' : 'Vérifier'}</span>
          </button>
        </div>

        {state.updateManifest && (
          <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
              <div className="min-w-0">
                <span className="text-xs font-semibold text-white block">
                  Version {state.updateManifest.version} disponible
                </span>
                <span className="text-[11px] text-white/40 block truncate">
                  Une nouvelle version est prête à être installée
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handlers.handleInstallUpdate()}
              disabled={state.isInstallingUpdate}
              className="px-4 py-1.5 rounded-xl bg-white text-neutral-950 font-bold text-xs hover:bg-neutral-200 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 flex-shrink-0 shadow-sm"
            >
              {state.isInstallingUpdate ? 'Installation...' : 'Installer'}
            </button>
          </div>
        )}
      </div>

      {/* Discord Community Panel */}
      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#5865F2]/20 border border-[#5865F2]/30 flex items-center justify-center text-[#5865F2] flex-shrink-0">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-white font-semibold text-xs tracking-tight">Discord Launched</h4>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#5865F2] bg-[#5865F2]/10 border border-[#5865F2]/25 px-1.5 py-0.5 rounded">
                  Discord
                </span>
              </div>
              <p className="text-white/40 text-[11px]">Support technique du launcher et annonces des nouvelles mises à jour</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void open('https://discord.gg/BWaj9JzsX6')}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] active:scale-[0.98] text-white text-xs font-semibold transition-all duration-150 cursor-pointer shadow-[0_2px_12px_rgba(88,101,242,0.3)] hover:shadow-[0_4px_16px_rgba(88,101,242,0.45)] flex-shrink-0"
          >
            <span>Rejoindre</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-80" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsGeneralTab;
