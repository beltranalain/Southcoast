"use client";

import { useEffect, useState } from "react";

// Live countdown to a broadcast start (epoch ms). SSR-safe: renders nothing
// until mounted so server and client agree.
export default function Countdown({ startsAt, className }: { startsAt: number; className?: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (now == null || !startsAt) return null;

  const diff = startsAt - now;
  if (diff <= 0) {
    return <span className={className}>{diff > -3 * 3600 * 1000 ? "Live now" : "Started"}</span>;
  }
  const d = Math.floor(diff / 86400000);
  const h = Math.floor(diff / 3600000) % 24;
  const m = Math.floor(diff / 60000) % 60;
  const s = Math.floor(diff / 1000) % 60;
  const label = d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
  return <span className={className}>in {label}</span>;
}
