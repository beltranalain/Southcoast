import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";

const WS = process.env.NEXT_PUBLIC_CHAT_WS_URL || "";
const HTTP = WS.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
const SECRET = process.env.CHAT_ADMIN_SECRET || "";

// POST { action: "ban"|"timeout"|"unban"|"clear", uid, name?, seconds?, room? }
// Host-only. Verifies the admin token, then relays to the chat Worker with the
// shared secret (so the secret never touches the browser).
export async function POST(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (!HTTP || !SECRET) {
    return NextResponse.json({ error: "Chat moderation is not configured." }, { status: 400 });
  }
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const room = String(body.room || "live");
  const action = String(body.action || "");
  const uid = String(body.uid || "");
  const name = String(body.name || "");
  const seconds = Number(body.seconds) || undefined;
  // "clear" wipes the room history (no uid); the rest target a viewer by uid.
  if (action !== "clear" && (!["ban", "timeout", "unban"].includes(action) || !uid)) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  try {
    const res = await fetch(`${HTTP}/room/${room}/moderate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({ action, uid, name, seconds }),
    });
    return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 502 });
  } catch {
    return NextResponse.json({ error: "Moderation request failed." }, { status: 502 });
  }
}
