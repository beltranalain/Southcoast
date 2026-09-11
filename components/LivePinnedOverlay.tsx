"use client";

import { useEffect, useRef, useState } from "react";

// Crisp DOM overlay of the host's pinned comment on the public /live player.
// The studio broadcasts pins to the "overlay" room (Studio -> On air -> Pin);
// this shows them clearly over the video for every visitor, independent of
// the video's latency/quality. Transparent until a comment is pinned.

const WS_BASE = process.env.NEXT_PUBLIC_CHAT_WS_URL || "";
type Comment = { name: string; text: string };

export default function LivePinnedOverlay() {
  const [comment, setComment] = useState<Comment | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!WS_BASE) return;
    let closed = false;
    function connect() {
      const ws = new WebSocket(`${WS_BASE}/room/overlay/ws`);
      ws.onmessage = (e) => {
        let d: any;
        try { d = JSON.parse(e.data); } catch { return; }
        if (d.type !== "overlay") return;
        if (d.action === "comment") setComment({ name: d.name || "", text: d.text || "" });
        else if (d.action === "hideComment") setComment(null);
        else if (d.action === "clear") setComment(null);
      };
      ws.onclose = () => { if (!closed) retryRef.current = setTimeout(connect, 2000); };
      ws.onerror = () => ws.close();
    }
    connect();
    return () => { closed = true; if (retryRef.current) clearTimeout(retryRef.current); };
  }, []);

  if (!comment) return null;
  return (
    <div className="live-pin">
      <span className="live-pin-name">{comment.name}</span>
      <span className="live-pin-text">{comment.text}</span>
    </div>
  );
}
