import { invoke } from '@tauri-apps/api/core';

export interface SkinEntry {
  id: string;
  name: string;
  textureB64: string;
  variant: 'classic' | 'slim';
  addedAt: string;
}

export interface MinecraftProfile {
  uuid: string;
  name: string;
  skinUrl: string | null;
  skinVariant: string | null;
}

export async function getMinecraftProfile(): Promise<MinecraftProfile> {
  return invoke<MinecraftProfile>('get_minecraft_profile');
}

export async function getSkinHistory(): Promise<SkinEntry[]> {
  return invoke<SkinEntry[]>('get_skin_history');
}

/** Returns a valid (auto-refreshed) Minecraft token for use in frontend HTTP calls. */
export async function getSkinToken(): Promise<string> {
  return invoke<string>('get_skin_token');
}

/** Serialize once in the browser; Rust sends the bytes to Mojang without CORS restrictions. */
async function uploadTexture(
  textureB64: string,
  variant: SkinEntry['variant'],
): Promise<void> {
  const binary = atob(textureB64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const form = new FormData();
  form.append('variant', variant.toUpperCase());
  form.append('file', new Blob([bytes], { type: 'image/png' }), 'skin.png');

  const request = new Request('https://multipart.invalid', {
    method: 'POST',
    body: form,
  });
  const contentType = request.headers.get('content-type');
  if (!contentType)
    throw new Error('Impossible de pr�parer le fichier de skin.');
  const body = Array.from(new Uint8Array(await request.arrayBuffer()));
  await invoke('upload_skin_raw', { contentType, body });
}

/** Apply a texture and only add it to the library after Mojang accepts it. */
export async function uploadSkin(
  name: string,
  textureB64: string,
  variant: SkinEntry['variant'],
): Promise<SkinEntry> {
  await uploadTexture(textureB64, variant);
  return invoke<SkinEntry>('save_skin_to_library', {
    name,
    textureB64,
    variant,
  });
}

export async function applySkinFromHistory(
  skinId: string,
  entry?: SkinEntry,
): Promise<void> {
  if (entry) {
    try {
      await uploadTexture(entry.textureB64, entry.variant);
      return;
    } catch {
      // Older library entries can still be applied through the backend path.
    }
  }
  return invoke<void>('apply_skin_from_history', { skinId });
}

export async function resetSkin(): Promise<void> {
  return invoke<void>('reset_skin');
}

export async function deleteSkinFromHistory(skinId: string): Promise<void> {
  return invoke<void>('delete_skin_from_history', { skinId });
}
