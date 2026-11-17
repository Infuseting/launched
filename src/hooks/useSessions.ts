import { useLauncherSelector } from '../state';
import type { Session } from '../types';

interface SessionsState {
  globalSessions: Session[];
  activeSessionIndex: number;
  activeSession: Session | undefined;
  sessionsLoading: boolean;
  sessionsError: string | null;
}

export function useSessions(): SessionsState {
  return useLauncherSelector(
    state => ({
      globalSessions: state.globalSessions,
      activeSessionIndex: state.activeSessionIndex,
      activeSession: state.globalSessions[state.activeSessionIndex],
      sessionsLoading: state.sessionsLoading,
      sessionsError: state.sessionsError,
    }),
    (prev, next) =>
      prev.globalSessions === next.globalSessions &&
      prev.activeSessionIndex === next.activeSessionIndex &&
      prev.activeSession === next.activeSession &&
      prev.sessionsLoading === next.sessionsLoading &&
      prev.sessionsError === next.sessionsError
  );
}
