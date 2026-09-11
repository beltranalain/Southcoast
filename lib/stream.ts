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

const LIVE_INPUT_UID = process.env.CLOUDFLARE_STREAM_LIVE_INPUT_UID || "";

// ---- Input B: the playback/recording input --------------------------------
// The browser studio ingests over WebRTC (WHIP). Cloudflare does not produce
// HLS *or* a VOD recording from a WHIP input, and will not forward it to Live
// Outputs. So the relay pushes an RTMPS copy of the program into a SECOND live
// input. That input behaves like a normal RTMPS broadcast: the site player gets
// HLS, recording works, and the archive fills itself.
//
//   studio --WHIP--> input A --WHEP--> relay --RTMP--> YouTube / Facebook
//                                            --RTMPS-> input B --> site + VOD
const PLAYBACK_INPUT_UID = process.env.CLOUDFLARE_STREAM_PLAYBACK_INPUT_UID || "";

export const playbackInputConfigured = Boolean(PLAYBACK_INPUT_UID);

// UID the public site should play. Falls back to the WHIP input so an
// unconfigured deployment degrades instead of breaking.
export function playbackInputUid(): string {
  return PLAYBACK_INPUT_UID || LIVE_INPUT_UID;
}

export type PlaybackIngest = { uid: string; url: string };

// Ingest URL for input B, so the relay can push a copy into it. We prefer SRT:
// this ffmpeg build cannot complete an RTMPS/TLS handshake to Cloudflare (it
// resets every time), but SRT ingests cleanly. Falls back to RTMPS if SRT is
// somehow absent. Returns a single ready-to-push URL (secret embedded).
export async function getPlaybackIngest(): Promise<PlaybackIngest | null> {
  if (!streamConfigured || !PLAYBACK_INPUT_UID) return null;
  try {
    const res = await fetch(`${BASE}/live_inputs/${PLAYBACK_INPUT_UID}`, {
      headers: headers(),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const r = (await res.json()).result ?? {};
    const srt = r.srt ?? {};
    if (srt.url && srt.streamId && srt.passphrase) {
      const url = `${srt.url}?streamid=${srt.streamId}&passphrase=${srt.passphrase}&pkt_size=1316`;
      return { uid: PLAYBACK_INPUT_UID, url };
    }
    const rtmpsUrl = r.rtmps?.url ?? "";
    const streamKey = r.rtmps?.streamKey ?? "";
    if (rtmpsUrl && streamKey) {
      return { uid: PLAYBACK_INPUT_UID, url: `${rtmpsUrl.replace(/\/+$/, "")}/${streamKey}` };
    }
    return null;
  } catch {
    return null;
  }
}

export type StreamIngest = {
  uid: string;
  whipUrl: string; // WebRTC publish endpoint - browser "Go Live"
  whepUrl: string; // WebRTC playback endpoint
  rtmpsUrl: string; // OBS "pro mode"
  streamKey: string; // OBS stream key
};

async function resolveInputUid(): Promise<string | null> {
  if (LIVE_INPUT_UID) return LIVE_INPUT_UID;
  if (!streamConfigured) return null;
  try {
    const res = await fetch(`${BASE}/live_inputs`, { headers: headers(), cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return data.result?.[0]?.uid ?? null;
  } catch {
    return null;
  }
}

// Full ingest + playback details for the configured (or first) live input.
export async function getLiveInput(): Promise<StreamIngest | null> {
  if (!streamConfigured) return null;
  const uid = await resolveInputUid();
  if (!uid) return null;
  try {
    const res = await fetch(`${BASE}/live_inputs/${uid}`, { headers: headers(), cache: "no-store" });
    if (!res.ok) return null;
    const r = (await res.json()).result ?? {};
    return {
      uid,
      whipUrl: r.webRTC?.url ?? "",
      whepUrl: r.webRTCPlayback?.url ?? "",
      rtmpsUrl: r.rtmps?.url ?? "",
      streamKey: r.rtmps?.streamKey ?? "",
    };
  } catch {
    return null;
  }
}

// Public HLS playback URL. A WHIP input has no HLS, so this reads input B
// (fed by the relay) whenever it is configured.
export async function liveHlsUrl(): Promise<string | null> {
  if (!streamConfigured) return null;
  const uid = PLAYBACK_INPUT_UID || (await resolveInputUid());
  if (!uid) return null;
  const host = CF_CUSTOMER_CODE
    ? `https://customer-${CF_CUSTOMER_CODE}.cloudflarestream.com`
    : "https://videodelivery.net";
  return `${host}/${uid}/manifest/video.m3u8`;
}

// WebRTC (WHEP) playback URL for the live broadcast. The browser studio ingests
// over WebRTC, which has no HLS - so the simulcast relay pulls THIS and pushes
// it to YouTube/Facebook/Twitch. Returns null if it can't be resolved.
export async function liveWhepUrl(): Promise<string | null> {
  const input = await getLiveInput();
  if (input?.whepUrl) return input.whepUrl;
  // Fallback: construct the standard Cloudflare WHEP play URL.
  if (!CF_CUSTOMER_CODE) return null;
  const uid = await resolveInputUid();
  if (!uid) return null;
  return `https://customer-${CF_CUSTOMER_CODE}.cloudflarestream.com/${uid}/webRTC/play`;
}

// ---- Simulcast (Live) Outputs: fan the input out to YouTube etc. ----
export async function listOutputs(): Promise<any[]> {
  if (!streamConfigured) return [];
  const uid = await resolveInputUid();
  if (!uid) return [];
  try {
    const res = await fetch(`${BASE}/live_inputs/${uid}/outputs`, { headers: headers(), cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json()).result ?? [];
  } catch {
    return [];
  }
}

export async function createOutput(url: string, streamKey: string): Promise<{ ok: boolean; error?: string }> {
  if (!streamConfigured) return { ok: false, error: "Cloudflare Stream not configured." };
  const uid = await resolveInputUid();
  if (!uid) return { ok: false, error: "No live input." };
  try {
    const res = await fetch(`${BASE}/live_inputs/${uid}/outputs`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ url, streamKey, enabled: true }),
    });
    const d = await res.json();
    if (!d.success) return { ok: false, error: d.errors?.[0]?.message || "Could not add destination." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Request failed." };
  }
}

export async function deleteOutput(outputId: string): Promise<boolean> {
  if (!streamConfigured) return false;
  const uid = await resolveInputUid();
  if (!uid) return false;
  try {
    const res = await fetch(`${BASE}/live_inputs/${uid}/outputs/${outputId}`, { method: "DELETE", headers: headers() });
    return res.ok;
  } catch {
    return false;
  }
}

// Pause/resume a destination by flipping its enabled flag (Cloudflare supports PUT on an output).
export async function updateOutput(outputId: string, enabled: boolean): Promise<boolean> {
  if (!streamConfigured) return false;
  const uid = await resolveInputUid();
  if (!uid) return false;
  try {
    const res = await fetch(`${BASE}/live_inputs/${uid}/outputs/${outputId}`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({ enabled }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---- Auto-recording: keep every broadcast as a VOD in the Library ----
export async function getRecordingMode(): Promise<"automatic" | "off" | null> {
  if (!streamConfigured) return null;
  // Recording lives on input B (a WHIP input never produces a VOD asset).
  const uid = PLAYBACK_INPUT_UID || (await resolveInputUid());
  if (!uid) return null;
  try {
    const res = await fetch(`${BASE}/live_inputs/${uid}`, { headers: headers(), cache: "no-store" });
    if (!res.ok) return null;
    const r = (await res.json()).result ?? {};
    return r.recording?.mode === "automatic" ? "automatic" : "off";
  } catch {
    return null;
  }
}

export async function setRecordingMode(enabled: boolean): Promise<boolean> {
  if (!streamConfigured) return false;
  const uid = PLAYBACK_INPUT_UID || (await resolveInputUid());
  if (!uid) return false;
  try {
    const res = await fetch(`${BASE}/live_inputs/${uid}`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({ recording: { mode: enabled ? "automatic" : "off" } }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Create a one-time direct-upload URL so the browser can upload a video file
// straight to Cloudflare Stream (no file passes through our server).
export async function createDirectUpload(maxDurationSeconds = 21600): Promise<{ uploadURL: string; uid: string } | null> {
  if (!streamConfigured) return null;
  try {
    const res = await fetch(`${BASE}/direct_upload`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ maxDurationSeconds }),
    });
    const d = await res.json();
    if (!d.success || !d.result?.uploadURL) return null;
    return { uploadURL: d.result.uploadURL, uid: d.result.uid };
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
