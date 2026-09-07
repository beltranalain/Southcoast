import "server-only";

// Cloudflare Stream helpers. Live ingest, simulcast, and VOD live here.
// Credentials stay server-side. Functions no-op gracefully without config.

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN = process.env.CLOUDFLARE_STREAM_API_TOKEN;
const BASE = ACCOUNT
  ? `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/stream`
  : "";

export const streamConfigured = Boolean(ACCOUNT && TOKEN);

// Public embed customer code (subdomain) for the Stream iframe player.
export const CF_CUSTOMER_CODE = process.env.NEXT_PUBLIC_CF_STREAM_CUSTOMER_CODE || "";

function headers() {
  return { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
}

// Build the iframe player URL for a Stream live input or video UID.
export function streamIframeSrc(uidOrInput: string): string {
  if (CF_CUSTOMER_CODE) {
    return `https://customer-${CF_CUSTOMER_CODE}.cloudflarestream.com/${uidOrInput}/iframe`;
  }
  return `https://iframe.videodelivery.net/${uidOrInput}`;
}

export type StreamLiveInput = {
  uid: string;
  status: string | null;
  connected: boolean;
};

// Check whether a live input is currently receiving a broadcast.
export async function getLiveInputStatus(
  inputUid: string
): Promise<StreamLiveInput | null> {
  if (!streamConfigured) return null;
  try {
    const res = await fetch(`${BASE}/live_inputs/${inputUid}`, {
      headers: headers(),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const state = data.result?.status?.current?.state ?? null;
    return {
      uid: inputUid,
      status: state,
      connected: state === "connected",
    };
  } catch {
    return null;
  }
}

// List recorded VOD videos from Stream (past broadcasts + uploads).
export async function listStreamVideos(): Promise<any[]> {
  if (!streamConfigured) return [];
  try {
    const res = await fetch(`${BASE}?limit=50`, {
      headers: headers(),
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.result ?? [];
  } catch {
    return [];
  }
}
