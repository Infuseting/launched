import type { Session, AuthResponse, AppSettings } from "./types";

export const state = {
  globalSessions: [] as Session[],
  activeSessionIndex: 0,
  isSyncing: false,
  authCache: null as AuthResponse | null,
  currentSettings: {
    minRam: 1024,
    maxRam: 4096,
    gameResolution: "400x300",
    activeAccountUuid: null,
    jvmArgs: "",
    wrapperCommand: "",
    showLogs: false
  } as AppSettings,
  allAccounts: [] as AuthResponse[],
  maxSystemRam: 8192,
  serverStatusInterval: null as number | null,
  appVersion: "1.0.0",
  updateManifest: null as any,
  isCheckingUpdate: false,
  activeSettingsTab: "account",
  isSettingsOpen: false
};
