import { invoke } from "@tauri-apps/api/core";

export interface SkinEntry {
  id: string;
  name: string;
  textureB64: string;
  variant: "classic" | "slim";
  addedAt: string;
}

export interface MinecraftProfile {
  uuid: string;
  name: string;
  skinUrl: string | null;
  skinVariant: string | null;
}

export async function getMinecraftProfile(): Promise<MinecraftProfile> {
  return invoke<MinecraftProfile>("get_minecraft_profile");
}

export async function getSkinHistory(): Promise<SkinEntry[]> {
  return invoke<SkinEntry[]>("get_skin_history");
}

/** Returns a valid (auto-refreshed) Minecraft token for use in frontend HTTP calls. */
export async function getSkinToken(): Promise<string> {
  return invoke<string>("get_skin_token");
}

/**
 * Uploads skin to Mojang using the browser's native fetch + FormData.
 * This guarantees correct multipart encoding (same as minecraft.net).
 * Then saves the skin to the local library via Rust.
 */
export async function uploadSkin(
  name: string,
  textureB64: string,
  variant: "classic" | "slim"
): Promise<SkinEntry> {
  // Convert base64 → Blob
  const binary = atob(textureB64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: "image/png" });

  // Let the browser serialize FormData (guaranteed-correct multipart encoding).
  // We use Request.arrayBuffer() to extract the raw bytes WITHOUT sending,
  // then pass them to Rust which sends them via reqwest (bypasses CORS).
  const form = new FormData();
  form.append("variant", variant.toUpperCase());
  form.append("file", blob, "skin.png");

  const dummyReq = new Request("https://dummy", { method: "POST", body: form });
  const contentType = dummyReq.headers.get("content-type")!;
  const buffer = await dummyReq.arrayBuffer();
  const body = Array.from(new Uint8Array(buffer));

  // Rust sends the raw bytes to Mojang (no reqwest multipart, no CORS)
  await invoke("upload_skin_raw", { contentType, body });

  // Persist to local library
  return invoke<SkinEntry>("save_skin_to_library", { name, textureB64, variant });
}

export async function applySkinFromHistory(skinId: string): Promise<void> {
  return invoke<void>("apply_skin_from_history", { skinId });
}

export async function resetSkin(): Promise<void> {
  return invoke<void>("reset_skin");
}

export async function deleteSkinFromHistory(skinId: string): Promise<void> {
  return invoke<void>("delete_skin_from_history", { skinId });
}
