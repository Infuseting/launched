import { invoke } from "@tauri-apps/api/core";
import type { AuthResponse } from "../types";

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
