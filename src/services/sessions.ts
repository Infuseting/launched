import { invoke } from "@tauri-apps/api/core";
import type { Session, AssetMetadata } from "../types";

export async function getSessions(): Promise<Session[]> {
  return await invoke<Session[]>("get_sessions");
}

export async function syncSession(session: Session): Promise<void> {
  await invoke("sync_session", { session });
}

export async function launchGame(session: Session, showLogs: boolean, crackPseudo?: string): Promise<void> {
  await invoke("launch_game", { session, showLogs, crackPseudo });
}

export async function fetchJson(url: string): Promise<AssetMetadata> {
  const metadata = await invoke<AssetMetadata>("fetch_json", { url });
  const protectedImage = (source: string): Promise<string> => {
    const imageUrl = new URL(source, url);
    if (imageUrl.origin !== new URL(url).origin || !imageUrl.pathname.startsWith('/api/sessions/')) {
      return Promise.resolve(imageUrl.toString());
    }
    return invoke<string>('fetch_session_image', { url: imageUrl.toString() });
  };
  const [background, logo, icon, links] = await Promise.all([
    Array.isArray(metadata.background) ? Promise.all(metadata.background.map(protectedImage)) : protectedImage(metadata.background),
    metadata.logo ? protectedImage(metadata.logo) : undefined,
    metadata.icon ? protectedImage(metadata.icon) : undefined,
    Promise.all((metadata.links ?? []).map(async link => ({ ...link, icon: await protectedImage(link.icon) }))),
  ]);
  return { background, logo, icon, links };
}

export async function getActiveSessionName(): Promise<string | null> {
  return await invoke<string | null>("get_active_session_name");
}

export async function setActiveSession(name: string): Promise<void> {
  await invoke("set_active_session", { name });
}
