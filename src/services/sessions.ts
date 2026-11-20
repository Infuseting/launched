import { invoke } from "@tauri-apps/api/core";
import type { Session, AssetMetadata, OptionalFileItem } from "../types";

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
  const protectedImage = async (source?: string): Promise<string> => {
    if (!source) return "";
    try {
      const imageUrl = new URL(source, url);
      if (imageUrl.origin !== new URL(url).origin || !imageUrl.pathname.startsWith('/api/sessions/')) {
        return imageUrl.toString();
      }
      return await invoke<string>('fetch_session_image', { url: imageUrl.toString() });
    } catch {
      return source;
    }
  };
  const [background, logo, icon, links] = await Promise.all([
    Array.isArray(metadata.background)
      ? Promise.all(metadata.background.map(img => protectedImage(img)))
      : (metadata.background ? protectedImage(metadata.background) : Promise.resolve("")),
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

export async function getDeepLinkUrl(): Promise<string | null> {
  try {
    return await invoke<string | null>("get_deep_link_url");
  } catch (e) {
    console.error("Failed to get deep link URL:", e);
    return null;
  }
}

export function extractSessionSlugFromDeepLink(url: string): string | null {
  if (!url || !url.startsWith("launched://")) return null;
  let path = url.slice("launched://".length);
  path = path.split("?")[0].split("#")[0].replace(/\/+$/, "");
  if (path.startsWith("session/")) {
    path = path.slice("session/".length);
  }
  path = decodeURIComponent(path).trim();
  return path || null;
}

export async function getSessionOptionalFiles(session: Session): Promise<OptionalFileItem[]> {
  return await invoke<OptionalFileItem[]>("get_session_optional_files", { session });
}

export async function setSessionOptionalFiles(
  session: Session,
  enabledFiles: string[],
  allOptionalFiles: string[] = []
): Promise<void> {
  await invoke("set_session_optional_files", { session, enabledFiles, allOptionalFiles });
}
