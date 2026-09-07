import { NextResponse } from "next/server";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { getSiteConfig } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

// POST { amount (dollars), message?, name?, uid? } -> a Stripe Checkout URL.
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

  const { branding } = await getSiteConfig();
  const origin = new URL(request.url).origin;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(dollars * 100),
            product_data: { name: `Tip to ${branding.siteName}` },
          },
          quantity: 1,
        },
      ],
      metadata: { name, message, uid, room },
      success_url: `${origin}/live?tip=thanks`,
      cancel_url: `${origin}/live?tip=cancel`,
    });
    return NextResponse.json({ url: session.url });
  } catch {
    return NextResponse.json({ error: "Could not start checkout." }, { status: 502 });
  }
}
