import { invoke } from "@tauri-apps/api/core";
import type { AppSettings } from "../types";

export async function getSettings(): Promise<AppSettings> {
  return await invoke<AppSettings>("get_settings");
}

export async function saveSettingsInternal(settings: AppSettings): Promise<void> {
  await invoke("save_settings", { settings });
}

export async function getSystemRam(): Promise<number> {
  return await invoke<number>("get_system_ram");
}
