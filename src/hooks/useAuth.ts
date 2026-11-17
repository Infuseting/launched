import { useLauncherState } from '../state';
import type { AuthResponse, DiscordUser } from '../types';

export interface AuthState {
  discordUser: DiscordUser | null;
  discordSkipped: boolean;
  discordChecking: boolean;
  discordBusy: boolean;
  discordError: string | null;
  authCache: AuthResponse | null;
  allAccounts: AuthResponse[];
}

export function useAuth(): AuthState {
  const state = useLauncherState();
  return {
    discordUser: state.discordUser,
    discordSkipped: state.discordSkipped,
    discordChecking: state.discordChecking,
    discordBusy: state.discordBusy,
    discordError: state.discordError,
    authCache: state.authCache,
    allAccounts: state.allAccounts,
  };
}
