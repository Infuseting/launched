import { useSyncExternalStore } from 'react';
import { getSnapshot, subscribe } from '../state';
import type { LauncherState } from '../state';

/**
 * A hook to access and subscribe to the launcher state.
 * It will trigger a re-render whenever any state property is updated.
 * 
 * @returns The current launcher state snapshot.
 */
export function useLauncherState(): LauncherState {
  return useSyncExternalStore(subscribe, getSnapshot);
}
