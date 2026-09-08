"use client";

import { useEffect, useRef, useState } from "react";

// Polls the Cloudflare live-input status so the player only mounts once a
// broadcast is actually flowing. Avoids the 404/spinner loop that happens when
// the Stream iframe loads before the stream is live, and starts automatically
// the moment the show goes on air.
export default function LivePlayer({ src, logo }: { src: string; logo?: string }) {
  const [live, setLive] = useState<boolean | null>(null);
  const [key, setKey] = useState(0);
  const was = useRef(false);

  useEffect(() => {
    let stop = false;
    const check = async () => {
      try {
        const r = await fetch("/api/stream/status", { cache: "no-store" });
        const d = await r.json();
        if (stop) return;
        const now = Boolean(d.live);
        setLive(now);
        if (now && !was.current) setKey((k) => k + 1); // fresh mount on going live
        was.current = now;
      } catch {
        /* keep last known state */
      }
    };
    check();
    const id = setInterval(check, 5000);
    return () => { stop = true; clearInterval(id); };
  }, []);

  if (live) {
    const sep = src.includes("?") ? "&" : "?";
    return (
      <>
        <span className="badge"><i />Live</span>
        <iframe
          key={key}
          src={`${src}${sep}autoplay=true&muted=true`}
          title="South Coast Cane live"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </>
    );
  }

  return (
    <div className="player-offair">
      <div className="offair-mark">
        {logo ? <img src={logo} alt="" /> : <span className="offair-dot" />}
      </div>
      {live === null ? (
        <span className="offair-check">One moment - getting the stream ready</span>
      ) : (
        <>
          <p>Off air</p>
          <span>The show streams here automatically the moment it goes live.</span>
        </>
      )}
    </div>
  );
}
