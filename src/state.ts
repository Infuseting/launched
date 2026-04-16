import type { Session, AuthResponse, AppSettings } from "./types";

export interface LauncherState {
  globalSessions: Session[];
  activeSessionIndex: number;
  isSyncing: boolean;
  authCache: AuthResponse | null;
  currentSettings: AppSettings;
  allAccounts: AuthResponse[];
  maxSystemRam: number;
  serverStatusInterval: number | null;
  appVersion: string;
  updateManifest: any;
  isCheckingUpdate: boolean;
  activeSettingsTab: string;
  isSettingsOpen: boolean;
}

const listeners = new Set<() => void>();

export function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

function notify() {
  // Update the snapshot before notifying
  lastSnapshot = {
    ...rawState,
    currentSettings: { ...rawState.currentSettings }
  };
  listeners.forEach(l => l());
}

function makeProxy<T extends object>(target: T): T {
  return new Proxy(target, {
    set(obj, prop, value) {
      const success = Reflect.set(obj, prop, value);
      if (success) notify();
      return success;
    }
  });
}

const rawState: LauncherState = {
  globalSessions: [],
  activeSessionIndex: 0,
  isSyncing: false,
  authCache: null,
  currentSettings: makeProxy({
    minRam: 1024,
    maxRam: 4096,
    gameResolution: "400x300",
    activeAccountUuid: null,
    jvmArgs: "",
    wrapperCommand: "",
    showLogs: false
  } as AppSettings),
  allAccounts: [],
  maxSystemRam: 8192,
  serverStatusInterval: null,
  appVersion: "1.0.0",
  updateManifest: null,
  isCheckingUpdate: false,
  activeSettingsTab: "account",
  isSettingsOpen: false
};

let lastSnapshot: LauncherState = {
  ...rawState,
  currentSettings: { ...rawState.currentSettings }
};

export function getSnapshot() {
  return lastSnapshot;
}

export const state = makeProxy(rawState);
