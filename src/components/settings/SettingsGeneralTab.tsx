import React from 'react';
import { motion } from 'framer-motion';
import type { LauncherState } from '../../state';
import type { AppHandlers } from '../../types';

interface SettingsGeneralTabProps {
  localMinRam: number;
  localMaxRam: number;
  localShowLogs: boolean;
  maxSystemRam: number;
  state: LauncherState;
  handlers: Pick<AppHandlers, 'handleCheckUpdate' | 'handleInstallUpdate'>;
  refs: {
    minRamRef: React.RefObject<HTMLElement>;
    maxRamRef: React.RefObject<HTMLElement>;
    showLogsRef: React.RefObject<HTMLElement>;
  };
}

const SettingsGeneralTab: React.FC<SettingsGeneralTabProps> = ({
  localMinRam,
  localMaxRam,
  localShowLogs,
  maxSystemRam,
  state,
  handlers,
  refs,
}) => {
  return (
    <motion.div
      key="general"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-8"
    >
      <div className="space-y-4">
        <div className="flex justify-between items-end">
          <label className="text-white font-black tracking-tight flex items-center gap-2">
            <sl-icon name="memory"></sl-icon> RAM Allocation
          </label>
          <span className="text-white/40 text-xs font-mono bg-white/5 px-2 py-1 rounded-lg border border-white/5">
            {localMinRam}MB - {localMaxRam}MB / {maxSystemRam}MB
          </span>
        </div>

        <div className="space-y-6 bg-white/5 p-6 rounded-3xl border border-white/5">
          <div className="space-y-2">
            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/30">
              <span>Minimum RAM</span>
              <span className="text-white">{localMinRam} MB</span>
            </div>
            <sl-range
              ref={refs.minRamRef as any}
              min="512"
              max={maxSystemRam}
              step="256"
              value={localMinRam}
            ></sl-range>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/30">
              <span>Maximum RAM</span>
              <span className="text-white">{localMaxRam} MB</span>
            </div>
            <sl-range
              ref={refs.maxRamRef as any}
              min="1024"
              max={maxSystemRam}
              step="256"
              value={localMaxRam}
            ></sl-range>
          </div>
        </div>
      </div>

      <div className="bg-white/5 p-6 rounded-3xl border border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white">
            <sl-icon name="terminal-fill" style={{ fontSize: '1.2rem' }}></sl-icon>
          </div>
          <div>
            <h4 className="text-white font-bold tracking-tight">Show Logs</h4>
            <p className="text-white/40 text-xs">Open terminal window on game start</p>
          </div>
        </div>
        <sl-switch
          ref={refs.showLogsRef as any}
          checked={localShowLogs}
        ></sl-switch>
      </div>

      <div className="bg-white/5 p-6 rounded-3xl border border-white/5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white">
              <sl-icon name="cloud-arrow-down-fill" style={{ fontSize: '1.2rem' }}></sl-icon>
            </div>
            <div>
              <h4 className="text-white font-bold tracking-tight">Launcher Updates</h4>
              <p className="text-white/55 text-xs">Version actuelle: v{state.appVersion}</p>
              <p className="text-white/40 text-xs">
                {state.updateManifest
                  ? `Nouvelle version disponible: v${state.updateManifest.version}`
                  : 'Aucune mise a jour detectee pour le moment'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                void handlers.handleCheckUpdate();
              }}
              disabled={state.isCheckingUpdate}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white/80 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {state.isCheckingUpdate ? 'Verification...' : 'Verifier'}
            </button>

            <button
              onClick={() => {
                void handlers.handleInstallUpdate();
              }}
              disabled={!state.updateManifest || state.isInstallingUpdate}
              className="rounded-2xl border border-emerald-200/25 bg-gradient-to-r from-emerald-400 to-lime-300 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-zinc-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {state.isInstallingUpdate ? 'Installation...' : 'Installer'}
            </button>
          </div>
        </div>

        {(state.isCheckingUpdate || state.isInstallingUpdate) && (
          <p className="text-xs text-white/55">
            {state.isInstallingUpdate
              ? `Telechargement en cours: ${Math.round(state.updateInstallProgress)}%`
              : 'Verification des mises a jour en cours...'}
          </p>
        )}

        {state.updateError && (
          <p className="text-xs text-red-200 bg-red-500/10 border border-red-400/30 rounded-xl px-3 py-2">
            {state.updateError}
          </p>
        )}
      </div>
    </motion.div>
  );
};

export default SettingsGeneralTab;
