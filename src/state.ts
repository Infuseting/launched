import React from 'react';
import type { LauncherStateModel } from './types';

const rawState: LauncherStateModel = {
  discordUser: null,
  discordSkipped: false,
  discordChecking: true,
  discordBusy: false,
  discordError: null,
  sessionsLoading: false,
  sessionsError: null,
  sessionLinkError: null,
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
      showLogs: false,
    },
  },
  authCache: null,
  allAccounts: [],
  deviceCodeModalOpen: false,
  deviceCodePayload: null,
  deviceCodeError: null,
  isSettingsOpen: false,
  isServerSelectOpen: false,
  activeSettingsTab: 'account',
  maxSystemRam: 8192,
  isSyncing: false,
  isPreparingLaunch: false,
  deletingSessionName: null,
  syncProgress: {
    current_file: '',
    files_done: 0,
    total_files: 0,
    percentage: 0,
  },
  appVersion: '1.0.0',
  mojangStatus: {
    auth: true,
    session: true,
    api: true,
  },
  serverStatus: null,
  isCheckingUpdate: false,
  updateManifest: null,
  isInstallingUpdate: false,
  updateInstallProgress: 0,
  updateError: null,
  dismissedUpdateVersion: null,
  serverStatusInterval: null,
  crackModalOpen: false,
  crackModalDefaultPseudo: '',
  optionalModsModalOpen: false,
  optionalModsModalSession: null,
  optionalModsPrefetchedFiles: null,
  optionalModsIsFirstSync: false,
  optionalModsHasUpdates: false,
  noticeDialog: null,
};

/** Keep previous snapshots immutable while preserving unchanged branch identities. */
function createSnapshot<T>(source: T, previous?: T): T {
  if (!isObject(source)) return source;

  const previousObject = isObject(previous) ? previous : undefined;
  const entries = Object.entries(source);
  let unchanged =
    previousObject !== undefined &&
    entries.length === Object.keys(previousObject).length &&
    Array.isArray(source) === Array.isArray(previousObject) &&
    (!Array.isArray(source) || source.length === previousObject.length);
  const next = Array.isArray(source) ? new Array<unknown>(source.length) : {};

  for (const [key, value] of entries) {
    const snapshot = createSnapshot(value, previousObject?.[key]);
    Reflect.set(next, key, snapshot);
    unchanged =
      unchanged &&
      Object.hasOwn(previousObject ?? {}, key) &&
      Object.is(snapshot, previousObject?.[key]);
  }

  return (unchanged ? previous : next) as T;
}

const listeners = new Set<() => void>();
let lastSnapshot: LauncherStateModel = createSnapshot(rawState);

function notify() {
  lastSnapshot = createSnapshot(rawState, lastSnapshot);
  listeners.forEach((l) => l());
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const proxyCache = new WeakMap<object, object>();
const rawObjects = new WeakMap<object, object>();

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
      // Assigning one reactive branch to another must not wrap a proxy again.
      if (isObject(value)) value = rawObjects.get(value) ?? value;
      const currentValue = Reflect.get(target, prop, receiver);
      if (Object.is(currentValue, value)) {
        return true;
      }

      const result = Reflect.set(target, prop, value, receiver);
      notify();
      return result;
    },
    deleteProperty(target, prop) {
      if (!Reflect.has(target, prop)) return true;
      const result = Reflect.deleteProperty(target, prop);
      if (result) notify();
      return result;
    },
  });

  proxyCache.set(obj, proxy);
  rawObjects.set(proxy, obj);
  return proxy as T;
}

/**
 * Unwraps reactive state proxies into plain objects suitable for Tauri IPC.
 */
export function unwrapState<T>(value: T): T {
  const raw: unknown = isObject(value)
    ? (rawObjects.get(value) ?? value)
    : value;
  if (!isObject(raw)) return raw as T;
  if (Array.isArray(raw)) {
    return raw.map((item) => unwrapState(item)) as T;
  }
  const plain: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(raw)) {
    if (entry !== undefined) {
      plain[key] = unwrapState(entry);
    }
  }
  return plain as T;
}

/**
 * Global mutable launcher state exposed through a reactive proxy.
 */
export const state = createRecursiveProxy(rawState);

export type LauncherState = LauncherStateModel;

const subscribeToState = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Subscribes React to launcher state mutations through `useSyncExternalStore`.
 */
export function useLauncherState(): LauncherState {
  return React.useSyncExternalStore(subscribeToState, () => lastSnapshot);
}

/**
 * Fine-grained selector hook subscribing to launcher state slices via useSyncExternalStore.
 */
export function useLauncherSelector<T>(
  selector: (state: LauncherStateModel) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const getSelection = React.useMemo(() => {
    let snapshot: LauncherStateModel | undefined;
    let selected: T;
    return () => {
      if (snapshot === lastSnapshot) return selected;
      const next = selector(lastSnapshot);
      if (snapshot === undefined || !isEqual(selected, next)) selected = next;
      snapshot = lastSnapshot;
      return selected;
    };
  }, [selector, isEqual]);

  return React.useSyncExternalStore(subscribeToState, getSelection);
}
