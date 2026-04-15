import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

export async function checkForAppUpdates() {
  return await check();
}

export async function relaunchApp() {
  await relaunch();
}

export async function appVersion() {
  return await getVersion();
}
