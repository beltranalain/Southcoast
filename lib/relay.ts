import "server-only";

// Client for the simulcast relay service (see /relay). The relay pulls the
// Cloudflare HLS broadcast and pushes it to YouTube/etc. over RTMP, which is how
// the browser studio simulcasts without OBS.

const RELAY_URL = (process.env.RELAY_URL || "").replace(/\/+$/, "");
const RELAY_SECRET = process.env.RELAY_SECRET || "";

export const relayConfigured = Boolean(RELAY_URL);

function headers() {
  return { "Content-Type": "application/json", ...(RELAY_SECRET ? { Authorization: `Bearer ${RELAY_SECRET}` } : {}) };
}

export type RelayDest = { id: string; url: string; key: string };

export async function relayStart(whepUrl: string, destinations: RelayDest[]): Promise<{ ok: boolean; error?: string }> {
  if (!relayConfigured) return { ok: false, error: "Simulcast relay not configured." };
  if (!destinations.length) return { ok: false, error: "No active destinations." };
  try {
    const res = await fetch(`${RELAY_URL}/start`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ whepUrl, destinations }),
      cache: "no-store",
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: d.error || `Relay responded ${res.status}.` };
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not reach the simulcast relay." };
  }
}

export async function relayStop(): Promise<{ ok: boolean }> {
  if (!relayConfigured) return { ok: true };
  try {
    await fetch(`${RELAY_URL}/stop`, { method: "POST", headers: headers(), cache: "no-store" });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function relayStatus(): Promise<any> {
  if (!relayConfigured) return { configured: false, live: false, destinations: [] };
  try {
    const res = await fetch(`${RELAY_URL}/status`, { headers: headers(), cache: "no-store" });
    if (!res.ok) return { configured: true, reachable: false, live: false, destinations: [] };
    const d = await res.json();
    return { configured: true, reachable: true, ...d };
  } catch {
    return { configured: true, reachable: false, live: false, destinations: [] };
  }
}
