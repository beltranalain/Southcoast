import { NextResponse } from "next/server";
import { getStripe, stripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// POST { amount (dollars), message?, name?, uid?, room? } -> a PaymentIntent
// client secret. The tip is paid in an on-site modal (Stripe Payment Element),
// not a hosted redirect. The webhook (payment_intent.succeeded) fans it out.
export async function POST(request: Request) {
  if (!stripeConfigured) {
    return NextResponse.json({ error: "Tipping isn't set up yet." }, { status: 400 });
  }
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "Tipping isn't set up yet." }, { status: 400 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const dollars = Number(body.amount);
  if (!Number.isFinite(dollars) || dollars < 1 || dollars > 500) {
    return NextResponse.json({ error: "Enter an amount between $1 and $500." }, { status: 400 });
  }
  const name = String(body.name || "A viewer").slice(0, 40);
  const message = String(body.message || "").slice(0, 200);
  const uid = String(body.uid || "").slice(0, 128);
  const room = String(body.room || "live");

  try {
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(dollars * 100),
      currency: "usd",
      // `kind: "tip"` lets the webhook ignore any unrelated payments.
      metadata: { kind: "tip", name, message, uid, room },
      automatic_payment_methods: { enabled: true },
      description: "Tip",
    });
    return NextResponse.json({ clientSecret: intent.client_secret });
  } catch {
    return NextResponse.json({ error: "Could not start the tip." }, { status: 502 });
  }
}
