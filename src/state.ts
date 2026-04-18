import React from 'react';

// Use standard objects for raw storage
const rawState = {
  activeSessionIndex: 0,
  globalSessions: [] as any[],
  currentSettings: {
    gameResolution: '400x300',
    activeAccountUuid: null as string | null,
    sessions: {} as Record<string, any>,
    defaultSettings: {
      minRam: 2048,
      maxRam: 4096,
      jvmArgs: '',
      wrapperCommand: '',
      showLogs: false
    }
  },
  authCache: null as any,
  allAccounts: [] as any[],
  deviceCodeModalOpen: false,
  deviceCodePayload: null as null | {
    user_code: string;
    verification_uri: string;
    message?: string;
  },
  isSettingsOpen: false,
  isServerSelectOpen: false,
  activeSettingsTab: 'account',
  maxSystemRam: 8192,
  isSyncing: false,
  syncProgress: {
    current_file: '',
    files_done: 0,
    total_files: 0,
    percentage: 0
  },
  appVersion: '1.0.0',
  mojangStatus: {
    auth: true,
    session: true,
    api: true
  },
  serverStatus: null as any,
  isCheckingUpdate: false,
  updateManifest: null as any,
  serverStatusInterval: null as any
};

const listeners = new Set<() => void>();
let lastSnapshot = JSON.parse(JSON.stringify(rawState));

function notify() {
  console.log("[State] Notifying changes. Snapshot updated.");
  // Update the snapshot with plain objects before notifying
  lastSnapshot = JSON.parse(JSON.stringify(rawState));
  listeners.forEach(l => l());
}

// Recursive Proxy Handler
function createRecursiveProxy(obj: any, path = ""): any {
  return new Proxy(obj, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === 'object' && value !== null) {
        return createRecursiveProxy(value, path ? `${path}.${String(prop)}` : String(prop));
      }
      return value;
    },
    set(target, prop, value, receiver) {
      console.log(`[Proxy] Setting ${path ? path + '.' : ''}${String(prop)} =`, value);
      const result = Reflect.set(target, prop, value, receiver);
      notify();
      return result;
    }
  });
}

// The global state proxy
export const state = createRecursiveProxy(rawState);

export type LauncherState = typeof rawState;

export function useLauncherState() {
  const subscribe = React.useCallback((listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);

  const getSnapshot = React.useCallback(() => {
    return lastSnapshot;
  }, []);

  return React.useSyncExternalStore(subscribe, getSnapshot);
}
