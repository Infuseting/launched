import { useModalFocus } from '../../hooks/useModalFocus';
import React, { Suspense, lazy, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { state as sourceState, type LauncherState } from '../../state';
import type { AppHandlers, AppSettings, SessionSettings } from '../../types';
import AccountsTab from './AccountsTab';
import SettingsGeneralTab from './SettingsGeneralTab';
import SettingsAdvancedTab from './SettingsAdvancedTab';
import {
  ArrowLeft,
  Users,
  Palette,
  Sliders,
  Terminal,
  Layers,
} from 'lucide-react';

// The WebGL preview is only needed when the skin studio is opened.
const SkinTab = lazy(() => import('../skin/SkinTab'));

interface SettingsModalProps {
  isOpen: boolean;
  state: LauncherState;
  handlers: Pick<
    AppHandlers,
    | 'handleSettingsToggle'
    | 'handleTabChange'
    | 'handleAccountSwap'
    | 'handleAccountRemove'
    | 'handleLoginAdd'
    | 'saveSettings'
    | 'handleCheckUpdate'
    | 'handleInstallUpdate'
    | 'handleDiscordLogout'
    | 'handleDiscordLogin'
  >;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  state,
  handlers,
}) => {
  const dialogRef = useModalFocus(isOpen, 10);
  const { maxSystemRam, activeSettingsTab } = state;
  const activeSession = state.globalSessions[state.activeSessionIndex];
  const sessionName = activeSession?.name;

  const getSessionSettings = React.useCallback(
    (settings: AppSettings, name: string | undefined): SessionSettings => {
      if (name && settings.sessions[name]) {
        return settings.sessions[name];
      }
      return settings.defaultSettings;
    },
    [],
  );

  const currentEffective = getSessionSettings(
    state.currentSettings,
    sessionName,
  );

  const toGb = React.useCallback((val: number): number => {
    if (val <= 0) return 1;
    return val < 64 ? val : Math.max(1, Math.round(val / 1024));
  }, []);

  const [localMinRam, setLocalMinRam] = React.useState(
    toGb(currentEffective.minRam),
  );
  const [localMaxRam, setLocalMaxRam] = React.useState(
    toGb(currentEffective.maxRam),
  );
  const [localShowLogs, setLocalShowLogs] = React.useState(
    currentEffective.showLogs,
  );
  const [localJvmArgs, setLocalJvmArgs] = React.useState(
    currentEffective.jvmArgs,
  );
  const [localWrapperCommand, setLocalWrapperCommand] = React.useState(
    currentEffective.wrapperCommand,
  );

  const saveTimeoutRef = useRef<number | null>(null);
  const hasPendingSaveRef = useRef(false);

  const flushSave = React.useCallback(() => {
    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    if (hasPendingSaveRef.current) {
      hasPendingSaveRef.current = false;
      void handlers.saveSettings();
    }
  }, [handlers]);

  const scheduleSave = React.useCallback(
    (immediate = false) => {
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
    },
    [flushSave],
  );

  const updateSetting = React.useCallback(
    <K extends keyof SessionSettings>(
      key: K,
      value: SessionSettings[K],
      persist = false,
    ) => {
      if (!sessionName) return;

      if (!sourceState.currentSettings.sessions[sessionName]) {
        sourceState.currentSettings.sessions[sessionName] = {
          ...sourceState.currentSettings.defaultSettings,
        };
      }

      sourceState.currentSettings.sessions[sessionName][key] = value;

      if (persist) {
        scheduleSave(true);
      } else {
        scheduleSave();
      }
    },
    [sessionName, scheduleSave],
  );

  useEffect(() => {
    if (!isOpen) {
      flushSave();
    }
  }, [isOpen, flushSave]);

  useEffect(() => {
    return () => flushSave();
  }, [flushSave]);

  useEffect(() => {
    if (isOpen) {
      const current = getSessionSettings(state.currentSettings, sessionName);
      setLocalMinRam(toGb(current.minRam));
      setLocalMaxRam(toGb(current.maxRam));
      setLocalShowLogs(current.showLogs);
      setLocalJvmArgs(current.jvmArgs);
      setLocalWrapperCommand(current.wrapperCommand);
    }
  }, [
    isOpen,
    activeSettingsTab,
    state.currentSettings,
    sessionName,
    getSessionSettings,
    toGb,
  ]);

  const handleMinRamChange = (valGb: number) => {
    setLocalMinRam(valGb);
    updateSetting('minRam', valGb * 1024);
    if (valGb > localMaxRam) {
      setLocalMaxRam(valGb);
      updateSetting('maxRam', valGb * 1024);
    }
  };

  const handleMaxRamChange = (valGb: number) => {
    setLocalMaxRam(valGb);
    updateSetting('maxRam', valGb * 1024);
    if (valGb < localMinRam) {
      setLocalMinRam(valGb);
      updateSetting('minRam', valGb * 1024);
    }
  };

  const handleShowLogsChange = (val: boolean) => {
    setLocalShowLogs(val);
    updateSetting('showLogs', val, true);
  };

  const handleJvmArgsChange = (val: string) => {
    setLocalJvmArgs(val);
    updateSetting('jvmArgs', val);
  };

  const handleWrapperCommandChange = (val: string) => {
    setLocalWrapperCommand(val);
    updateSetting('wrapperCommand', val);
  };

  const tabs = [
    {
      id: 'account',
      label: 'Comptes',
      icon: Users,
      desc: 'Minecraft et Discord',
    },
    {
      id: 'skin',
      label: 'Skin Studio 3D',
      icon: Palette,
      desc: 'Aperçu 3D, bibliothèque et personnalisation',
    },
    {
      id: 'general',
      label: 'Général & RAM',
      icon: Sliders,
      desc: 'Mémoire allouée, logs et mises à jour',
    },
    {
      id: 'advanced',
      label: 'Options Avancées',
      icon: Terminal,
      desc: 'Arguments JVM et commande wrapper',
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="fixed inset-x-0 bottom-0 top-8 z-50 bg-neutral-950/98 backdrop-blur-3xl flex flex-col text-white select-none overflow-hidden"
        >
          {/* Top Bar Header */}
          <header className="h-16 px-8 border-b border-white/10 flex items-center justify-between gap-4 bg-black/40 flex-shrink-0">
            <div className="flex min-w-0 items-center gap-4">
              <button
                onClick={() => handlers.handleSettingsToggle(false)}
                className="group flex shrink-0 items-center gap-2.5 whitespace-nowrap px-4 py-2 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-xs font-bold text-white transition-all cursor-pointer shadow-md"
              >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                <span>Retour au Launcher</span>
              </button>

              <div className="h-4 w-px shrink-0 bg-white/10" />

              <div className="flex min-w-0 items-center gap-2">
                <span
                  id="settings-title"
                  className="shrink-0 text-sm font-black tracking-tight"
                >
                  Paramètres
                </span>
                {sessionName && activeSettingsTab !== 'account' && (
                  <span
                    title={sessionName}
                    className="min-w-0 text-[11px] font-medium text-white/50 bg-white/5 px-2.5 py-0.5 rounded-lg border border-white/5 flex items-center gap-1.5"
                  >
                    <Layers className="w-3 h-3 shrink-0 text-emerald-400" />
                    <span className="truncate">Session : {sessionName}</span>
                  </span>
                )}
              </div>
            </div>

            <div
              className={`shrink-0 items-center gap-2 text-[11px] text-white/40 font-medium ${activeSettingsTab === 'account' ? 'hidden' : 'sr-only lg:not-sr-only lg:flex'}`}
            >
              <span>Modifications sauvegardées automatiquement</span>
            </div>
          </header>

          {/* Main Full-Page Body */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left Sidebar Navigation */}
            <aside className="w-56 lg:w-64 border-r border-white/10 bg-black/20 p-4 lg:p-5 flex flex-col justify-between flex-shrink-0">
              <nav className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/30 px-3 block mb-3">
                  Navigation
                </span>

                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = state.activeSettingsTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => handlers.handleTabChange(tab.id)}
                      className={`
                        w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-left transition-all duration-200 cursor-pointer border
                        ${
                          isActive
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.1)]'
                            : 'bg-transparent border-transparent text-white/60 hover:bg-white/5 hover:text-white'
                        }
                      `}
                    >
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          isActive
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-white/5 text-white/40'
                        }`}
                      >
                        <Icon className="w-4.5 h-4.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-xs block truncate">
                          {tab.label}
                        </span>
                        <span className="text-[10px] text-white/35 block truncate mt-0.5">
                          {tab.desc}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </nav>

              {/* Version pill */}
              <div className="pt-4 border-t border-white/5 flex items-center justify-between text-[11px] text-white/40 font-medium px-2">
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Launched Client
                </span>
                <span className="font-mono text-white/50">
                  v{state.appVersion}
                </span>
              </div>
            </aside>

            {/* Right Content Area */}
            <main className="flex-1 min-w-0 overflow-y-auto p-6 xl:p-10 custom-scrollbar">
              <div className="max-w-4xl mx-auto">
                <AnimatePresence mode="wait">
                  {activeSettingsTab === 'account' && (
                    <motion.div
                      key="account"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-6"
                    >
                      <AccountsTab state={state} handlers={handlers} />
                    </motion.div>
                  )}

                  {activeSettingsTab === 'skin' && (
                    <motion.div
                      key="skin"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-6"
                    >
                      <div>
                        <h2 className="text-2xl font-black tracking-tight">
                          Studio de Skin 3D
                        </h2>
                        <p className="text-white/40 text-xs mt-1">
                          Visualisez votre personnage en 3D en temps réel,
                          changez de modèle et appliquez vos skins
                          personnalisés.
                        </p>
                      </div>

                      <Suspense
                        fallback={
                          <p
                            role="status"
                            className="py-12 text-center text-sm text-white/60"
                          >
                            Chargement du studio de skins…
                          </p>
                        }
                      >
                        <SkinTab />
                      </Suspense>
                    </motion.div>
                  )}

                  {activeSettingsTab === 'general' && (
                    <motion.div
                      key="general"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-6"
                    >
                      <div>
                        <h2 className="text-2xl font-black tracking-tight">
                          Options Générales & Mémoire
                        </h2>
                        <p className="text-white/40 text-xs mt-1">
                          Configurez les performances d'exécution et les
                          préférences du launcher.
                        </p>
                      </div>

                      <SettingsGeneralTab
                        localMinRam={localMinRam}
                        localMaxRam={localMaxRam}
                        localShowLogs={localShowLogs}
                        maxSystemRam={Math.max(
                          2,
                          Math.round(maxSystemRam / 1024),
                        )}
                        state={state}
                        handlers={handlers}
                        onMinRamChange={handleMinRamChange}
                        onMaxRamChange={handleMaxRamChange}
                        onShowLogsChange={handleShowLogsChange}
                      />
                    </motion.div>
                  )}

                  {activeSettingsTab === 'advanced' && (
                    <motion.div
                      key="advanced"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-6"
                    >
                      <div>
                        <h2 className="text-2xl font-black tracking-tight">
                          Paramètres Avancés
                        </h2>
                        <p className="text-white/40 text-xs mt-1">
                          Options techniques avancées pour la JVM et les
                          commandes de lancement.
                        </p>
                      </div>

                      <SettingsAdvancedTab
                        localJvmArgs={localJvmArgs}
                        localWrapperCommand={localWrapperCommand}
                        onJvmArgsChange={handleJvmArgsChange}
                        onWrapperCommandChange={handleWrapperCommandChange}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </main>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SettingsModal;
