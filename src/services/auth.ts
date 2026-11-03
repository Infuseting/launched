import { invoke } from "@tauri-apps/api/core";
import type { AuthResponse, DiscordUser } from "../types";

export const getDiscordAuth = () => invoke<DiscordUser | null>('get_discord_auth');
export const continueWithoutDiscord = () => invoke<void>('continue_without_discord');
export const loginDiscord = () => invoke<DiscordUser>('login_discord');
export const logoutDiscord = () => invoke<void>('logout_discord');
export const cancelDiscordLogin = () => invoke<void>('cancel_discord_login');

export async function getAuth(): Promise<AuthResponse | null> {
  return await invoke<AuthResponse | null>("get_auth");
}

export async function loginMicrosoft(): Promise<AuthResponse> {
  return await invoke<AuthResponse>("login_microsoft");
}

export async function getAllAccounts(): Promise<AuthResponse[]> {
  return await invoke<AuthResponse[]>("get_all_accounts");
}

export async function removeAccount(uuid: string): Promise<void> {
  await invoke("remove_account", { uuid });
}

export async function setActiveAccount(uuid: string): Promise<void> {
  await invoke("set_active_account", { uuid });
}

export async function logout(): Promise<void> {
  await invoke("logout");
}

/**
 * Validates the stored Minecraft token and silently refreshes it if expired.
 * Returns the fresh AuthResponse. Throws if not logged in or refresh fails.
 */
export async function refreshActiveToken(): Promise<AuthResponse> {
  return await invoke<AuthResponse>("refresh_active_token");
}
