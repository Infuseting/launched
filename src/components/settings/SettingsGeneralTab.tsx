import React from 'react';
import type { LauncherState } from '../../state';
import type { AppHandlers } from '../../types';
import Slider from '../ui/Slider';
import Switch from '../ui/Switch';
import { Cpu, Terminal, RefreshCw, Sparkles, CheckCircle2 } from 'lucide-react';

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
      <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-400/25 flex items-center justify-center text-emerald-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-white font-bold text-xs">Mise à jour du Launcher</h4>
              <p className="text-white/40 text-[11px]">Version actuelle : v{state.appVersion}</p>
            </div>
          </div>

          <button
            onClick={() => void handlers.handleCheckUpdate()}
            disabled={state.isCheckingUpdate || state.isInstallingUpdate}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white text-white hover:text-neutral-950 text-xs font-bold transition-all duration-150 cursor-pointer disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${state.isCheckingUpdate ? 'animate-spin' : ''}`} />
            <span>{state.isCheckingUpdate ? 'Recherche...' : 'Vérifier'}</span>
          </button>
        </div>

        {state.updateManifest && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
              <CheckCircle2 className="w-4 h-4" />
              <span>Version {state.updateManifest.version} disponible !</span>
            </div>
            <button
              onClick={() => void handlers.handleInstallUpdate()}
              disabled={state.isInstallingUpdate}
              className="px-4 py-1.5 rounded-xl bg-emerald-400 text-neutral-950 font-black text-xs hover:brightness-110 transition-all cursor-pointer"
            >
              {state.isInstallingUpdate ? 'Installation...' : 'Installer'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsGeneralTab;
