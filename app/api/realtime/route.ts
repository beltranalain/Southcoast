import { NextResponse } from "next/server";
import { rtcFetch, realtimeConfigured } from "@/lib/realtime";

// POST { action, sessionId?, body? }
// Proxies the Cloudflare Realtime session/track APIs. action:
//   "session"      -> create a new session
//   "tracks"       -> add/pull tracks on a session
//   "renegotiate"  -> answer a server-initiated renegotiation
export async function POST(request: Request) {
  if (!realtimeConfigured) {
    return NextResponse.json({ configured: false });
  }
  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { action, sessionId, body } = payload;

  try {
    let res: Response;
    if (action === "session") {
      res = await rtcFetch("/sessions/new", { method: "POST", body: JSON.stringify(body || {}) });
    } else if (action === "tracks") {
      res = await rtcFetch(`/sessions/${sessionId}/tracks/new`, { method: "POST", body: JSON.stringify(body) });
    } else if (action === "renegotiate") {
      res = await rtcFetch(`/sessions/${sessionId}/renegotiate`, { method: "PUT", body: JSON.stringify(body) });
    } else {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Realtime request failed." }, { status: 502 });
  }
}
