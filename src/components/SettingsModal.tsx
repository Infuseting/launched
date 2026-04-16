import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { LauncherState } from '../state';
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
  const { currentSettings, maxSystemRam, activeSettingsTab } = state;

  const updateSetting = (key: keyof typeof currentSettings, value: any) => {
    (currentSettings as any)[key] = value;
    handlers.saveSettings();
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
            className="bg-neutral-900/80 border border-white/10 rounded-[2.5rem] overflow-hidden max-w-2xl w-full shadow-[0_50px_100px_rgba(0,0,0,0.5)] flex flex-col max-h-[85vh]"
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
            <div className="px-8 py-4 flex gap-2 bg-white/2">
              {[
                { id: 'account', label: 'Accounts', icon: 'person-fill' },
                { id: 'general', label: 'General', icon: 'gear-wide-connected' },
                { id: 'advanced', label: 'Advanced', icon: 'braces' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handlers.handleTabChange(tab.id)}
                  className={`flex items-center gap-3 px-6 py-3 rounded-2xl font-bold transition-all cursor-pointer ${
                    activeSettingsTab === tab.id
                      ? 'bg-white text-black shadow-xl scale-105'
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
                          {currentSettings.minRam}MB - {currentSettings.maxRam}MB / {maxSystemRam}MB
                        </span>
                      </div>
                      
                      <div className="space-y-6 bg-white/5 p-6 rounded-3xl border border-white/5">
                        <div className="space-y-2">
                          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/30">
                            <span>Minimum RAM</span>
                            <span>{currentSettings.minRam} MB</span>
                          </div>
                          <sl-range
                            min="512"
                            max={maxSystemRam}
                            step="256"
                            value={currentSettings.minRam}
                            onSlInput={(e: any) => updateSetting('minRam', parseInt(e.target.value))}
                          ></sl-range>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/30">
                            <span>Maximum RAM</span>
                            <span>{currentSettings.maxRam} MB</span>
                          </div>
                          <sl-range
                            min="1024"
                            max={maxSystemRam}
                            step="256"
                            value={currentSettings.maxRam}
                            onSlInput={(e: any) => updateSetting('maxRam', parseInt(e.target.value))}
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
                        checked={currentSettings.showLogs}
                        onSlChange={(e: any) => updateSetting('showLogs', e.target.checked)}
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
                        placeholder="-Xmx4G -XX:+UseG1GC..."
                        rows={6}
                        value={currentSettings.jvmArgs}
                        onSlInput={(e: any) => updateSetting('jvmArgs', e.target.value)}
                        style={{ '--sl-input-background-color': 'rgba(255,255,255,0.05)', '--sl-input-border-color': 'rgba(255,255,255,0.1)' }}
                      ></sl-textarea>
                      <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest px-2">
                        CAUTION: Modified arguments may cause the game to crash.
                      </p>
                    </div>

                    <div className="space-y-3">
                      <label className="text-white font-black tracking-tight flex items-center gap-2">
                        <sl-icon name="command"></sl-icon> Wrapper Command
                      </label>
                      <sl-input
                        placeholder="e.g. optirun"
                        value={currentSettings.wrapperCommand}
                        onSlInput={(e: any) => updateSetting('wrapperCommand', e.target.value)}
                      ></sl-input>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            {/* Footer */}
            <div className="p-6 bg-white/5 border-t border-white/5 flex justify-between items-center text-[10px] font-black uppercase tracking-[0.3em] text-white/20">
              <span>Launched Material v{state.appVersion}</span>
              <span>All changes saved automatically</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SettingsModal;
