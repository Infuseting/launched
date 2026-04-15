import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export async function checkForAppUpdates() {
  return await check();
}

export async function relaunchApp() {
  await relaunch();
}
