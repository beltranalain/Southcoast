import "server-only";

import { getAdminDb } from "./firebaseAdmin";

// Server-only store for simulcast destinations. These live in Firestore at
// site/simulcast as { destinations: [{ id, platform, url, key, enabled }] }.
// The stream KEY is a secret and is never sent to the browser (see toPublic).
//
// This replaces Cloudflare "Live Outputs" because the browser studio ingests
// over WebRTC, which Cloudflare will not forward. Our own relay reads these
// destinations and pushes to YouTube/etc. over RTMP.

export type SimulcastDest = {
  id: string;
  platform: string; // "YouTube" | "Facebook" | "Twitch" | "Custom"
  url: string;
  key: string;
  enabled: boolean;
};

// What we expose to the client: never the key itself, just whether one is set.
export type SimulcastDestPublic = Omit<SimulcastDest, "key"> & { hasKey: boolean };

export function toPublic(d: SimulcastDest): SimulcastDestPublic {
  const { key, ...rest } = d;
  return { ...rest, hasKey: Boolean(key) };
}

function newId(existing: SimulcastDest[]): string {
  // Deterministic, collision-checked id (no Math.random needed).
  let n = existing.length + 1;
  const ids = new Set(existing.map((d) => d.id));
  while (ids.has(`dest-${n}`)) n += 1;
  return `dest-${n}`;
}

export async function listDestinations(): Promise<SimulcastDest[]> {
  try {
    const db = getAdminDb();
    if (!db) return [];
    const snap = await db.collection("site").doc("simulcast").get();
    const raw = snap.exists ? snap.data()?.destinations : null;
    if (!Array.isArray(raw)) return [];
    const out: SimulcastDest[] = [];
    for (const d of raw) {
      const url = typeof d?.url === "string" ? d.url.trim() : "";
      if (!url) continue;
      out.push({
        id: typeof d?.id === "string" ? d.id : newId(out),
        platform: typeof d?.platform === "string" ? d.platform : "Custom",
        url,
        key: typeof d?.key === "string" ? d.key : "",
        enabled: d?.enabled !== false,
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function write(destinations: SimulcastDest[]): Promise<void> {
  const db = getAdminDb();
  if (!db) throw new Error("no db");
  await db.collection("site").doc("simulcast").set({ destinations });
}

export async function addDestination(input: { platform: string; url: string; key: string }): Promise<{ ok: boolean; error?: string; destinations: SimulcastDestPublic[] }> {
  const url = String(input.url || "").trim();
  const key = String(input.key || "").trim();
  if (!url || !key) return { ok: false, error: "URL and stream key are required.", destinations: (await listDestinations()).map(toPublic) };
  const list = await listDestinations();
  list.push({ id: newId(list), platform: String(input.platform || "Custom"), url, key, enabled: true });
  await write(list);
  return { ok: true, destinations: list.map(toPublic) };
}

export async function removeDestination(id: string): Promise<{ ok: boolean; destinations: SimulcastDestPublic[] }> {
  const list = await listDestinations();
  const next = list.filter((d) => d.id !== id);
  if (next.length !== list.length) await write(next);
  return { ok: true, destinations: next.map(toPublic) };
}

export async function setDestinationEnabled(id: string, enabled: boolean): Promise<{ ok: boolean; destinations: SimulcastDestPublic[] }> {
  const list = await listDestinations();
  const idx = list.findIndex((d) => d.id === id);
  if (idx >= 0 && list[idx].enabled !== enabled) {
    list[idx].enabled = enabled;
    await write(list);
  }
  return { ok: true, destinations: list.map(toPublic) };
}

// The destinations the relay should push to right now (enabled + have a key).
export async function activeDestinations(): Promise<SimulcastDest[]> {
  return (await listDestinations()).filter((d) => d.enabled && d.key);
}
