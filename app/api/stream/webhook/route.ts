import { NextResponse } from "next/server";
import { getAdminDb, adminConfigured } from "@/lib/firebaseAdmin";

// POST /api/stream/webhook
// Cloudflare Stream calls this when a live input connects/disconnects or a
// recording is ready. We record live status + new VODs in Firestore so the
// public site can flip to "live" and the library can pick up saved broadcasts.
//
// Configure the webhook URL and signing secret in the Cloudflare dashboard.
export async function POST(request: Request) {
  const payload = await request.text();

  // TODO: verify the Webhook-Signature header against CLOUDFLARE_STREAM_WEBHOOK_SECRET
  // before trusting the payload in production.

  let event: any;
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  if (!adminConfigured) {
    console.log("[stream webhook] received (Firebase admin not configured):", event?.eventType ?? "unknown");
    return NextResponse.json({ ok: true, stored: false });
  }

  try {
    const db = getAdminDb();
    if (db) {
      await db.collection("streamEvents").add({
        receivedAt: new Date().toISOString(),
        event,
      });

      // Keep a simple live-status doc the public site can read.
      const state = event?.data?.status?.current?.state ?? event?.status ?? null;
      if (state) {
        await db.collection("site").doc("liveStatus").set(
          { state, updatedAt: new Date().toISOString() },
          { merge: true }
        );
      }
    }
    return NextResponse.json({ ok: true, stored: true });
  } catch (err) {
    console.error("[stream webhook] store failed", err);
    return NextResponse.json({ error: "Store failed." }, { status: 500 });
  }
}
