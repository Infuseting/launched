import React from 'react';
import type { LauncherStateModel } from './types';

const rawState: LauncherStateModel = {
  activeSessionIndex: 0,
  globalSessions: [],
  currentSettings: {
    gameResolution: '400x300',
    activeAccountUuid: null,
    sessions: {},
    defaultSettings: {
      minRam: 1024,
      maxRam: 4096,
      jvmArgs: '',
      wrapperCommand: '',
      showLogs: false
    }
  },
  authCache: null,
  allAccounts: [],
  deviceCodeModalOpen: false,
  deviceCodePayload: null,
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
  serverStatus: null,
  isCheckingUpdate: false,
  updateManifest: null,
  serverStatusInterval: null
};

const listeners = new Set<() => void>();
let lastSnapshot = JSON.parse(JSON.stringify(rawState));

function notify() {
  lastSnapshot = JSON.parse(JSON.stringify(rawState));
  listeners.forEach(l => l());
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const proxyCache = new WeakMap<object, object>();

function createRecursiveProxy<T extends object>(obj: T): T {
  const existing = proxyCache.get(obj);
  if (existing) {
    return existing as T;
  }

  const proxy = new Proxy(obj, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (isObject(value)) {
        return createRecursiveProxy(value);
      }
      return value;
    },
    set(target, prop, value, receiver) {
      const currentValue = Reflect.get(target, prop, receiver);
      if (Object.is(currentValue, value)) {
        return true;
      }

      const result = Reflect.set(target, prop, value, receiver);
      notify();
      return result;
    }
  });

  proxyCache.set(obj, proxy);
  return proxy as T;
}

/**
 * Global mutable launcher state exposed through a reactive proxy.
 *
 * React components must read it through `useLauncherState` to receive updates.
 */
export const state = createRecursiveProxy(rawState);

export type LauncherState = LauncherStateModel;

/**
 * Subscribes React to launcher state mutations through `useSyncExternalStore`.
 */
export function useLauncherState(): LauncherState {
  const subscribe = React.useCallback((listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);

  const getSnapshot = React.useCallback(() => {
    return lastSnapshot;
  }, []);

  return React.useSyncExternalStore(subscribe, getSnapshot);
}
