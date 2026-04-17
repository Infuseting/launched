import { invoke } from "@tauri-apps/api/core";
import type { Session, AssetMetadata } from "../types";

export async function getSessions(): Promise<Session[]> {
  return await invoke<Session[]>("get_sessions");
}

export async function syncSession(session: Session): Promise<void> {
  await invoke("sync_session", { session });
}

export async function launchGame(session: Session, showLogs: boolean): Promise<void> {
  await invoke("launch_game", { session, showLogs });
}

export async function fetchJson(url: string): Promise<AssetMetadata> {
  return await invoke<AssetMetadata>("fetch_json", { url });
}

export async function getActiveSessionName(): Promise<string | null> {
  return await invoke<string | null>("get_active_session_name");
}

export async function setActiveSession(name: string): Promise<void> {
  await invoke("set_active_session", { name });
}
