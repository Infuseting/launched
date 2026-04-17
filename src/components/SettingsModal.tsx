import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { state as sourceState, type LauncherState } from '../state';
import AccountSwitcher from './AccountSwitcher';

interface SettingsModalProps {
  isOpen: boolean;
  state: LauncherState;
  handlers: {
    handleSettingsToggle: (show: boolean) => void;
    handleTabChange: (tabId: string) => void;
    handleAccountSwap: (uuid: string) => Promise<void>;
    handleAccountRemove: (uuid: string) => Promise<void>;
    handleLoginAdd: () => Promise<void>;
    saveSettings: () => Promise<void>;
  };
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  state,
  handlers
}) => {
  const { maxSystemRam, activeSettingsTab } = state;
  const activeSession = state.globalSessions[state.activeSessionIndex];
  const sessionName = activeSession?.name;

  // Helper to get effective session settings
  const getSessionSettings = (settings: any, name: string | undefined) => {
    if (name && settings.sessions[name]) {
      return settings.sessions[name];
    }
    return settings.defaultSettings;
  };

  const currentEffective = getSessionSettings(state.currentSettings, sessionName);

  const [localMinRam, setLocalMinRam] = React.useState(currentEffective.minRam);
  const [localMaxRam, setLocalMaxRam] = React.useState(currentEffective.maxRam);
  const [localShowLogs, setLocalShowLogs] = React.useState(currentEffective.showLogs);
  const [localJvmArgs, setLocalJvmArgs] = React.useState(currentEffective.jvmArgs);
  const [localWrapperCommand, setLocalWrapperCommand] = React.useState(currentEffective.wrapperCommand);

  const minRamRef = useRef<any>(null);
  const maxRamRef = useRef<any>(null);
  const showLogsRef = useRef<any>(null);
  const jvmArgsRef = useRef<any>(null);
  const wrapperCommandRef = useRef<any>(null);

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
  }, [isOpen, activeSettingsTab, state.currentSettings, sessionName]);

  // Handle Shoelace events via refs
  useEffect(() => {
    if (!isOpen) return;

    const handlers_map = [
      {
        ref: minRamRef,
        onInput: (e: any) => {
          const val = parseInt(e.target.value);
          if (!isNaN(val)) {
            setLocalMinRam(val);
            updateSetting('minRam', val);
          }
        },
        onChange: () => handlers.saveSettings()
      },
      {
        ref: maxRamRef,
        onInput: (e: any) => {
          const val = parseInt(e.target.value);
          if (!isNaN(val)) {
            setLocalMaxRam(val);
            updateSetting('maxRam', val);
          }
        },
        onChange: () => handlers.saveSettings()
      },
      {
        ref: showLogsRef,
        onChange: (e: any) => {
          const val = e.target.checked;
          console.log("[Settings] showLogs changed:", val);
          setLocalShowLogs(val);
          updateSetting('showLogs', val, true);
        }
      },
      {
        ref: jvmArgsRef,
        onInput: (e: any) => {
          const val = e.target.value;
          console.log("[Settings] jvmArgs input:", val);
          setLocalJvmArgs(val);
          updateSetting('jvmArgs', val);
        },
        onChange: () => {
          console.log("[Settings] jvmArgs commit");
          handlers.saveSettings();
        }
      },
      {
        ref: wrapperCommandRef,
        onInput: (e: any) => {
          const val = e.target.value;
          console.log("[Settings] wrapperCommand input:", val);
          setLocalWrapperCommand(val);
          updateSetting('wrapperCommand', val);
        },
        onChange: () => {
          console.log("[Settings] wrapperCommand commit");
          handlers.saveSettings();
        }
      }
    ];

    const cleanups: (() => void)[] = [];

    handlers_map.forEach(({ ref, onInput, onChange }) => {
      const el = ref.current;
      if (!el) return;

      if (onInput) {
        el.addEventListener('sl-input', onInput);
        cleanups.push(() => el.removeEventListener('sl-input', onInput));
      }
      if (onChange) {
        el.addEventListener('sl-change', onChange);
        cleanups.push(() => el.removeEventListener('sl-change', onChange));
      }
    });

    return () => cleanups.forEach(c => c());
  }, [isOpen, activeSettingsTab]);

  const updateSetting = (key: string, value: any, persist = false) => {
    if (!sessionName) return;

    console.log(`[Settings] Updating ${key} for ${sessionName} to:`, value);

    // Ensure the session entry exists in the proxy state
    if (!sourceState.currentSettings.sessions[sessionName]) {
      // Initialize with a copy of default settings if it's the first override
      sourceState.currentSettings.sessions[sessionName] = JSON.parse(JSON.stringify(sourceState.currentSettings.defaultSettings));
    }

    (sourceState.currentSettings.sessions[sessionName] as any)[key] = value;

    if (persist) {
      console.log(`[Settings] Persisting session settings for ${sessionName} immediately...`);
      handlers.saveSettings();
    }
  };

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
