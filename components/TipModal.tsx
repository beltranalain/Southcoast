"use client";

import { useState } from "react";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { getStripePromise } from "@/lib/stripeClient";

// Dark, on-brand appearance so the Stripe form matches the site (amber/near-black).
const appearance = {
  theme: "night" as const,
  variables: {
    colorPrimary: "#F5A524",
    colorBackground: "#141110",
    colorText: "#F3EFE7",
    colorTextSecondary: "#9A9287",
    colorDanger: "#E8402A",
    fontFamily: "Inter, system-ui, sans-serif",
    borderRadius: "10px",
    spacingUnit: "4px",
  },
  rules: {
    ".Input": { border: "1px solid rgba(243,239,231,.14)", backgroundColor: "#0A0908" },
    ".Input:focus": { border: "1px solid #F5A524", boxShadow: "none" },
    ".Tab": { border: "1px solid rgba(243,239,231,.14)", backgroundColor: "#0A0908" },
    ".Tab--selected": { border: "1px solid #F5A524" },
    ".Label": { color: "#9A9287" },
  },
};

function PayForm({ amount, onSuccess, onClose }: { amount: number; onSuccess: () => void; onClose: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true); setErr("");
    const { error } = await stripe.confirmPayment({
      elements,
      // Only redirects for methods that require it (cards stay on-page).
      confirmParams: { return_url: `${window.location.origin}/live?tip=thanks` },
      redirect: "if_required",
    });
    if (error) { setErr(error.message || "Payment failed. Try again."); setBusy(false); }
    else onSuccess();
  }

  return (
    <form onSubmit={submit} className="tipm-form">
      <PaymentElement options={{ layout: "tabs" }} />
      {err && <p className="form-error" style={{ fontSize: 13 }}>{err}</p>}
      <div className="tipm-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={!stripe || busy}>
          {busy ? "Processing..." : `Tip $${amount}`}
        </button>
      </div>
      <p className="tipm-foot">Powered by <strong>Stripe</strong></p>
    </form>
  );
}

export default function TipModal({
  clientSecret,
  amount,
  onSuccess,
  onClose,
}: {
  clientSecret: string;
  amount: number;
  onSuccess: () => void;
  onClose: () => void;
}) {
  return (
    <div className="tipm-overlay" onClick={onClose}>
      <div className="tipm-card" onClick={(e) => e.stopPropagation()}>
        <div className="tipm-head">
          <b>Send a tip</b>
          <button type="button" aria-label="Close" onClick={onClose} className="tipm-x">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3l10 10M13 3L3 13" /></svg>
          </button>
        </div>
        {process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ? (
          <Elements stripe={getStripePromise()} options={{ clientSecret, appearance }}>
            <PayForm amount={amount} onSuccess={onSuccess} onClose={onClose} />
          </Elements>
        ) : (
          <div className="tipm-form">
            <p className="form-error" style={{ fontSize: 13 }}>
              Card payments aren&apos;t fully configured yet. (Missing Stripe publishable key.)
            </p>
            <div className="tipm-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
