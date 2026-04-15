import { invoke } from "@tauri-apps/api/core";

export async function pingService(url: string): Promise<boolean> {
  return await invoke<boolean>("ping_service", { url });
}

export async function fetchServerStatus(hostname: string): Promise<any> {
  const res = await fetch(`https://api.mcsrvstat.us/3/${hostname}`);
  if (!res.ok) throw new Error("Status API fail");
  return await res.json();
}
