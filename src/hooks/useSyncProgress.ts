import { useLauncherSelector } from '../state';
import type { SyncProgress } from '../types';

interface SyncProgressState {
  isSyncing: boolean;
  syncProgress: SyncProgress;
}

export function useSyncProgress(): SyncProgressState {
  return useLauncherSelector(
    (state) => ({
      isSyncing: state.isSyncing,
      syncProgress: state.syncProgress,
    }),
    (prev, next) =>
      prev.isSyncing === next.isSyncing &&
      prev.syncProgress.percentage === next.syncProgress.percentage &&
      prev.syncProgress.files_done === next.syncProgress.files_done &&
      prev.syncProgress.total_files === next.syncProgress.total_files &&
      prev.syncProgress.current_file === next.syncProgress.current_file,
  );
}
