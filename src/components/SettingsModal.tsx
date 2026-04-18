import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { state as sourceState, type LauncherState } from '../state';
import type { AppHandlers, AppSettings, SessionSettings } from '../types';
import AccountSwitcher from './AccountSwitcher';

interface SettingsModalProps {
  isOpen: boolean;
  state: LauncherState;
  handlers: Pick<AppHandlers, 'handleSettingsToggle' | 'handleTabChange' | 'handleAccountSwap' | 'handleAccountRemove' | 'handleLoginAdd' | 'saveSettings' | 'handleCheckUpdate' | 'handleInstallUpdate'>;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  state,
  handlers
}) => {
  const { maxSystemRam, activeSettingsTab } = state;
  const activeSession = state.globalSessions[state.activeSessionIndex];
  const sessionName = activeSession?.name;

  const getSessionSettings = React.useCallback((settings: AppSettings, name: string | undefined): SessionSettings => {
    if (name && settings.sessions[name]) {
      return settings.sessions[name];
    }
    return settings.defaultSettings;
  }, []);

  const currentEffective = getSessionSettings(state.currentSettings, sessionName);

  const [localMinRam, setLocalMinRam] = React.useState(currentEffective.minRam);
  const [localMaxRam, setLocalMaxRam] = React.useState(currentEffective.maxRam);
  const [localShowLogs, setLocalShowLogs] = React.useState(currentEffective.showLogs);
  const [localJvmArgs, setLocalJvmArgs] = React.useState(currentEffective.jvmArgs);
  const [localWrapperCommand, setLocalWrapperCommand] = React.useState(currentEffective.wrapperCommand);

  const saveTimeoutRef = useRef<number | null>(null);
  const hasPendingSaveRef = useRef(false);

  const minRamRef = useRef<HTMLElement | null>(null);
  const maxRamRef = useRef<HTMLElement | null>(null);
  const showLogsRef = useRef<HTMLElement | null>(null);
  const jvmArgsRef = useRef<HTMLElement | null>(null);
  const wrapperCommandRef = useRef<HTMLElement | null>(null);

  const getEventValue = React.useCallback((e: Event): string => {
    const customDetailValue = (e as CustomEvent<{ value?: string | number }>).detail?.value;
    if (customDetailValue !== undefined && customDetailValue !== null) {
      return String(customDetailValue);
    }

    const targetValue = (e.target as { value?: string | number } | null)?.value;
    if (targetValue !== undefined && targetValue !== null) {
      return String(targetValue);
    }

    const currentTargetValue = (e.currentTarget as { value?: string | number } | null)?.value;
    if (currentTargetValue !== undefined && currentTargetValue !== null) {
      return String(currentTargetValue);
    }

    return '';
  }, []);

  const syncCurrentInputsToState = React.useCallback((): boolean => {
    if (!sessionName) {
      return false;
    }

    if (!sourceState.currentSettings.sessions[sessionName]) {
      sourceState.currentSettings.sessions[sessionName] = JSON.parse(JSON.stringify(sourceState.currentSettings.defaultSettings));
    }

    const sessionSettings = sourceState.currentSettings.sessions[sessionName];
    let changed = false;

    const minRaw = (minRamRef.current as { value?: string | number } | null)?.value;
    const minValue = Number(minRaw);
    if (Number.isFinite(minValue) && sessionSettings.minRam !== minValue) {
      sessionSettings.minRam = minValue;
      changed = true;
    }

    const maxRaw = (maxRamRef.current as { value?: string | number } | null)?.value;
    const maxValue = Number(maxRaw);
    if (Number.isFinite(maxValue) && sessionSettings.maxRam !== maxValue) {
      sessionSettings.maxRam = maxValue;
      changed = true;
    }

    const logsRaw = (showLogsRef.current as { checked?: boolean } | null)?.checked;
    if (typeof logsRaw === 'boolean' && sessionSettings.showLogs !== logsRaw) {
      sessionSettings.showLogs = logsRaw;
      changed = true;
    }

    const jvmRaw = (jvmArgsRef.current as { value?: string } | null)?.value;
    if (typeof jvmRaw === 'string' && sessionSettings.jvmArgs !== jvmRaw) {
      sessionSettings.jvmArgs = jvmRaw;
      changed = true;
    }

    const wrapperRaw = (wrapperCommandRef.current as { value?: string } | null)?.value;
    if (typeof wrapperRaw === 'string' && sessionSettings.wrapperCommand !== wrapperRaw) {
      sessionSettings.wrapperCommand = wrapperRaw;
      changed = true;
    }

    return changed;
  }, [sessionName]);

  const flushSave = React.useCallback(() => {
    if (syncCurrentInputsToState()) {
      hasPendingSaveRef.current = true;
    }

    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    if (hasPendingSaveRef.current) {
      hasPendingSaveRef.current = false;
      void handlers.saveSettings();
    }
  }, [handlers, syncCurrentInputsToState]);

  const scheduleSave = React.useCallback((immediate = false) => {
    hasPendingSaveRef.current = true;

    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    if (immediate) {
      flushSave();
      return;
    }

    saveTimeoutRef.current = window.setTimeout(() => {
      flushSave();
    }, 250);
  }, [flushSave]);

  const updateSetting = React.useCallback(<K extends keyof SessionSettings>(key: K, value: SessionSettings[K], persist = false) => {
    if (!sessionName) return;

    // Ensure the session entry exists in the proxy state
    if (!sourceState.currentSettings.sessions[sessionName]) {
      // Initialize with a copy of default settings if it's the first override
      sourceState.currentSettings.sessions[sessionName] = JSON.parse(JSON.stringify(sourceState.currentSettings.defaultSettings));
    }

    sourceState.currentSettings.sessions[sessionName][key] = value;

    if (persist) {
      scheduleSave(true);
    } else {
      scheduleSave();
    }
  }, [sessionName, scheduleSave]);

  useEffect(() => {
    if (!isOpen) {
      flushSave();
    }
  }, [isOpen, flushSave]);

  useEffect(() => {
    return () => flushSave();
  }, [flushSave]);

  // Sync local state when the tab becomes active or modal opens
  useEffect(() => {
    if (isOpen) {
      const current = getSessionSettings(state.currentSettings, sessionName);
      setLocalMinRam(current.minRam);
      setLocalMaxRam(current.maxRam);
      setLocalShowLogs(current.showLogs);
      setLocalJvmArgs(current.jvmArgs);
      setLocalWrapperCommand(current.wrapperCommand);
    }
  }, [isOpen, activeSettingsTab, state.currentSettings, sessionName, getSessionSettings]);

  // Handle Shoelace events via refs
  useEffect(() => {
    if (!isOpen) return;

    const handlers_map = [
      {
        ref: minRamRef,
        onInput: (e: Event) => {
          const val = parseInt(getEventValue(e), 10);
          if (!isNaN(val)) {
            setLocalMinRam(val);
            updateSetting('minRam', val);
          }
        }
      },
      {
        ref: maxRamRef,
        onInput: (e: Event) => {
          const val = parseInt(getEventValue(e), 10);
          if (!isNaN(val)) {
            setLocalMaxRam(val);
            updateSetting('maxRam', val);
          }
        }
      },
      {
        ref: showLogsRef,
        onChange: (e: Event) => {
          const val = (e.target as HTMLInputElement).checked;
          setLocalShowLogs(val);
          updateSetting('showLogs', val, true);
        }
      },
      {
        ref: jvmArgsRef,
        onInput: (e: Event) => {
          const val = (e.target as HTMLTextAreaElement).value;
          setLocalJvmArgs(val);
          updateSetting('jvmArgs', val);
        }
      },
      {
        ref: wrapperCommandRef,
        onInput: (e: Event) => {
          const val = (e.target as HTMLInputElement).value;
          setLocalWrapperCommand(val);
          updateSetting('wrapperCommand', val);
        }
      }
    ];

    const cleanups: (() => void)[] = [];

    handlers_map.forEach(({ ref, onInput, onChange }) => {
      const el = ref.current;
      if (!el) return;

      if (onInput) {
        el.addEventListener('input', onInput);
        el.addEventListener('sl-input', onInput);
        cleanups.push(() => el.removeEventListener('input', onInput));
        cleanups.push(() => el.removeEventListener('sl-input', onInput));
      }
      if (onChange) {
        el.addEventListener('change', onChange);
        el.addEventListener('sl-change', onChange);
        cleanups.push(() => el.removeEventListener('change', onChange));
        cleanups.push(() => el.removeEventListener('sl-change', onChange));
      }
    });

    return () => cleanups.forEach(c => c());
  }, [isOpen, activeSettingsTab, sessionName, updateSetting, handlers, getEventValue]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-8"
          onClick={() => handlers.handleSettingsToggle(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="sl-theme-dark bg-neutral-900/80 border border-white/10 rounded-[2.5rem] overflow-hidden max-w-2xl w-full shadow-[0_50px_100px_rgba(0,0,0,0.5)] flex flex-col max-h-[85vh] text-white"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-8 pb-4 flex justify-between items-center border-b border-white/5 bg-white/5">
              <div>
                <h2 className="text-3xl font-black text-white tracking-tight">Settings</h2>
                <p className="text-white/40 text-xs font-bold uppercase tracking-[0.2em] mt-1">Configure your experience</p>
              </div>
              <button
                onClick={() => handlers.handleSettingsToggle(false)}
                className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white transition-all cursor-pointer border border-white/5"
              >
                <sl-icon name="x-lg" style={{ fontSize: '1.2rem' }}></sl-icon>
              </button>
            </div>

            {/* Navigation */}
            <div className="px-8 py-4 flex gap-2 bg-black/20 border-b border-white/5">
              {[
                { id: 'account', label: 'Accounts', icon: 'person-fill' },
                { id: 'general', label: 'General', icon: 'gear-wide-connected' },
                { id: 'advanced', label: 'Advanced', icon: 'braces' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handlers.handleTabChange(tab.id)}
                  className={`flex items-center gap-3 px-6 py-3 rounded-2xl font-bold transition-all cursor-pointer ${state.activeSettingsTab === tab.id
                      ? '!bg-white !text-zinc-950 shadow-xl scale-105'
                      : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                    }`}
                >
                  <sl-icon name={tab.icon}></sl-icon>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <AnimatePresence mode="wait">
                {activeSettingsTab === 'account' && (
                  <motion.div
                    key="account"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <AccountSwitcher
                      accounts={state.allAccounts}
                      activeUuid={state.authCache?.uuid}
                      onSwap={handlers.handleAccountSwap}
                      onRemove={handlers.handleAccountRemove}
                      onAdd={handlers.handleLoginAdd}
                    />
                  </motion.div>
                )}

                {activeSettingsTab === 'general' && (
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
                            ref={minRamRef}
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
                            ref={maxRamRef}
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
                        ref={showLogsRef}
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
                )}

                {activeSettingsTab === 'advanced' && (
                  <motion.div
                    key="advanced"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div className="space-y-3">
                      <label className="text-white font-black tracking-tight flex items-center gap-2">
                        <sl-icon name="braces"></sl-icon> JVM Arguments
                      </label>
                      <sl-textarea
                        ref={jvmArgsRef}
                        placeholder="-Xmx4G -XX:+UseG1GC..."
                        rows={6}
                        value={localJvmArgs}
                        style={{ '--sl-input-background-color': 'rgba(255,255,255,0.05)', '--sl-input-border-color': 'rgba(255,255,255,0.1)' }}
                      ></sl-textarea>
                    </div>

                    <div className="space-y-3">
                      <label className="text-white font-black tracking-tight flex items-center gap-2">
                        <sl-icon name="command"></sl-icon> Wrapper Command
                      </label>
                      <sl-input
                        ref={wrapperCommandRef}
                        placeholder="e.g. optirun"
                        value={localWrapperCommand}
                      ></sl-input>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="p-6 bg-white/5 border-t border-white/5 flex justify-between items-center text-[10px] font-black uppercase tracking-[0.3em] text-white/20">
              <span>Launched v{state.appVersion}</span>
              <span>All changes saved automatically</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SettingsModal;
