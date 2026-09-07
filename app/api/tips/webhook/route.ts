import { NextResponse } from "next/server";
import { getStripe, stripeConfigured, stripeWebhookSecret } from "@/lib/stripe";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";

const WS = process.env.NEXT_PUBLIC_CHAT_WS_URL || "";
const WORKER_HTTP = WS.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
const CHAT_SECRET = process.env.CHAT_ADMIN_SECRET || "";

// Stripe calls this after a tip is paid. Verify the signature, then fan the tip
// out to the room (on-air alert + highlighted chat) and record it.
export async function POST(request: Request) {
  const stripe = getStripe();
  if (!stripeConfigured || !stripe || !stripeWebhookSecret) {
    return NextResponse.json({ error: "Not configured." }, { status: 400 });
  }

  const sig = request.headers.get("stripe-signature") || "";
  const raw = await request.text();

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, stripeWebhookSecret);
  } catch {
    return NextResponse.json({ error: "Bad signature." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    const amount = (s.amount_total ?? 0) / 100;
    const md = s.metadata || {};
    const name = String(md.name || "A viewer");
    const message = String(md.message || "");
    const room = String(md.room || "live");
    const uid = String(md.uid || "");

    // Fan out to the room (on-air alert + highlighted chat message).
    if (WORKER_HTTP && CHAT_SECRET) {
      try {
        await fetch(`${WORKER_HTTP}/room/${room}/tip`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${CHAT_SECRET}` },
          body: JSON.stringify({ name, amount, message }),
        });
      } catch { /* don't fail the webhook if the relay hiccups */ }
    }

    // Record it for the admin.
    try {
      const db = getAdminDb();
      await db?.collection("tips").add({ name, amount, message, uid, ts: Date.now(), sessionId: s.id });
    } catch { /* ignore */ }
  }

  return NextResponse.json({ received: true });
}
