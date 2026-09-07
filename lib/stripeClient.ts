"use client";

import { loadStripe, type Stripe } from "@stripe/stripe-js";

// Client-side Stripe.js singleton (publishable key). Returns null if unset.
let promise: Promise<Stripe | null> | null = null;

export function getStripePromise(): Promise<Stripe | null> {
  if (!promise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    promise = key ? loadStripe(key) : Promise.resolve(null);
  }
  return promise;
}
