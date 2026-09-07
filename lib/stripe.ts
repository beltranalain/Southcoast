import "server-only";

import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;

export const stripeConfigured = Boolean(key);
export const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

let client: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!key) return null;
  if (!client) client = new Stripe(key);
  return client;
}
