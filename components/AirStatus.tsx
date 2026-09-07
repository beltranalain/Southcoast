"use client";

import { useEffect, useState } from "react";

// Header "On air / Off air" indicator driven by the real Cloudflare live-input
// status (matches the player, which may be live before a YouTube simulcast is).
export default function AirStatus({ initial = false }: { initial?: boolean }) {
  const [live, setLive] = useState(initial);

  useEffect(() => {
    let stop = false;
    const check = async () => {
      try {
        const r = await fetch("/api/stream/status", { cache: "no-store" });
        const d = await r.json();
        if (!stop) setLive(Boolean(d.live));
      } catch {
        /* keep last known state */
      }
    };
    check();
    const id = setInterval(check, 5000);
    return () => { stop = true; clearInterval(id); };
  }, []);

  return <b>{live ? "On air" : "Off air"}</b>;
}
