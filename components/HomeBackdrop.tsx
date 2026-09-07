"use client";

import { useEffect, useState } from "react";

const CODE = process.env.NEXT_PUBLIC_CF_STREAM_CUSTOMER_CODE || "";
const LIVE_UID = process.env.NEXT_PUBLIC_CF_STREAM_LIVE_INPUT_UID || "";

// Video layer behind the home hero. To keep Cloudflare delivery cost low, it
// ONLY streams while a broadcast is on air (the live feed plays in the
// background). Off air it renders nothing, so the gradient art shows through -
// no idle VOD streaming to every visitor.
export default function HomeBackdrop() {
  const [live, setLive] = useState(false);

  useEffect(() => {
    let stop = false;
    const check = async () => {
      try {
        const r = await fetch("/api/stream/status", { cache: "no-store" });
        const d = await r.json();
        if (!stop) setLive(Boolean(d.live));
      } catch { /* keep last */ }
    };
    check();
    const id = setInterval(check, 5000);
    return () => { stop = true; clearInterval(id); };
  }, []);

  if (!CODE || !LIVE_UID || !live) return null;

  const src = `https://customer-${CODE}.cloudflarestream.com/${LIVE_UID}/iframe?autoplay=true&muted=true&loop=true&controls=false&preload=auto`;

  return (
    <div className="home-bg" aria-hidden="true">
      <iframe key={LIVE_UID} src={src} title="" tabIndex={-1} allow="autoplay; encrypted-media; picture-in-picture" />
    </div>
  );
}
