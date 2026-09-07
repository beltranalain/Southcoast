"use client";

import { useEffect, useRef, useState } from "react";

// OBS browser-source overlay. Add this page as a Browser source in OBS at
// 1920x1080. It stays transparent until the admin pushes a banner or a pinned
// comment from Studio -> On Air, then shows it over the live video.

const WS_BASE = process.env.NEXT_PUBLIC_CHAT_WS_URL || "";
const ROOM = "overlay";

type Banner = { title: string; subtitle: string };
type Comment = { name: string; text: string };

export default function OverlayPage() {
  const [banner, setBanner] = useState<Banner | null>(null);
  const [comment, setComment] = useState<Comment | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Make the page (and OBS capture) transparent.
  useEffect(() => {
    const prevH = document.documentElement.style.background;
    const prevB = document.body.style.background;
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    return () => {
      document.documentElement.style.background = prevH;
      document.body.style.background = prevB;
    };
  }, []);

  useEffect(() => {
    if (!WS_BASE) return;
    let closed = false;
    function connect() {
      const ws = new WebSocket(`${WS_BASE}/room/${ROOM}/ws`);
      ws.onmessage = (e) => {
        let d: any;
        try { d = JSON.parse(e.data); } catch { return; }
        if (d.type !== "overlay") return;
        if (d.action === "banner") setBanner({ title: d.title || "", subtitle: d.subtitle || "" });
        else if (d.action === "hideBanner") setBanner(null);
        else if (d.action === "comment") setComment({ name: d.name || "", text: d.text || "" });
        else if (d.action === "hideComment") setComment(null);
        else if (d.action === "clear") { setBanner(null); setComment(null); }
      };
      ws.onclose = () => { if (!closed) retryRef.current = setTimeout(connect, 2000); };
      ws.onerror = () => ws.close();
    }
    connect();
    return () => { closed = true; if (retryRef.current) clearTimeout(retryRef.current); };
  }, []);

  return (
    <div className="onair-stage">
      {comment && (
        <div className="onair-comment">
          <span className="onair-comment-name">{comment.name}</span>
          <span className="onair-comment-text">{comment.text}</span>
        </div>
      )}
      {banner && (
        <div className="onair-l3">
          <span className="onair-l3a">{banner.title}</span>
          {banner.subtitle && <span className="onair-l3b">{banner.subtitle}</span>}
        </div>
      )}
    </div>
  );
}
