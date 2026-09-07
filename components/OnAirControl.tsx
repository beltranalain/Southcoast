"use client";

import { useEffect, useRef, useState } from "react";

const WS_BASE = process.env.NEXT_PUBLIC_CHAT_WS_URL || "";
type ChatMessage = { id: string; name: string; text: string };

export default function OnAirControl() {
  const [connected, setConnected] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [overlayUrl, setOverlayUrl] = useState("/overlay");

  const overlayWs = useRef<WebSocket | null>(null);
  const liveWs = useRef<WebSocket | null>(null);

  useEffect(() => {
    setOverlayUrl(window.location.origin + "/overlay");
  }, []);

  useEffect(() => {
    if (!WS_BASE) return;
    // Send channel (overlay commands)
    const ow = new WebSocket(`${WS_BASE}/room/overlay/ws`);
    ow.onopen = () => setConnected(true);
    ow.onclose = () => setConnected(false);
    overlayWs.current = ow;

    // Read channel (live chat, to pin comments)
    const lw = new WebSocket(`${WS_BASE}/room/live/ws`);
    lw.onmessage = (e) => {
      let d: any;
      try { d = JSON.parse(e.data); } catch { return; }
      if (d.type === "history" && Array.isArray(d.messages)) setChat(d.messages.slice(-40));
      else if (d.type === "chat") setChat((p) => [...p.slice(-39), d]);
    };
    liveWs.current = lw;

    return () => { ow.close(); lw.close(); };
  }, []);

  function send(cmd: Record<string, unknown>) {
    overlayWs.current?.send(JSON.stringify({ type: "overlay", ...cmd }));
  }

  const showBanner = () => title.trim() && send({ action: "banner", title, subtitle });
  const hideBanner = () => send({ action: "hideBanner" });
  const pin = (m: ChatMessage) => send({ action: "comment", name: m.name, text: m.text });
  const clearAll = () => send({ action: "clear" });

  const enabled = Boolean(WS_BASE);

  return (
    <>
      <div className="admin-topbar">
        <div>
          <h1>On Air</h1>
          <div className="sub">Push banners and comments onto the live stream in real time.</div>
        </div>
        <div className="admin-actions">
          <span className={`live-pill${connected ? " is-live" : ""}`}>
            <span className="dot" /><span>{enabled ? (connected ? "Overlay connected" : "Connecting") : "Not configured"}</span>
          </span>
          <button className="btn btn-ghost btn-sm" type="button" onClick={clearAll}>Clear stream</button>
        </div>
      </div>

      {!enabled && (
        <div className="notice" style={{ marginBottom: 22 }}>
          <strong>Chat/overlay backend not connected.</strong> Set NEXT_PUBLIC_CHAT_WS_URL to enable on-air graphics.
        </div>
      )}

      <div className="notice" style={{ marginBottom: 22 }}>
        <strong>OBS setup:</strong> add a <em>Browser</em> source in OBS pointing to
        {" "}<code style={{ color: "var(--amber)" }}>{overlayUrl}</code> at 1920 x 1080. Whatever you push below appears over the video.
      </div>

      <div className="two-col">
        <div className="panel">
          <h3>Lower-third banner</h3>
          <div className="panel-sub">A headline that sits at the bottom of the broadcast.</div>
          <div className="form-field"><label>Title</label><input type="text" value={title} placeholder="South Coast Cane" onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="form-field"><label>Subtitle (optional)</label><input type="text" value={subtitle} placeholder="Segment 2 - what the tape showed" onChange={(e) => setSubtitle(e.target.value)} /></div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary btn-sm" type="button" onClick={showBanner} disabled={!connected}>Show on stream</button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={hideBanner} disabled={!connected}>Hide banner</button>
          </div>
        </div>

        <div className="panel">
          <h3>Pin a comment to the stream</h3>
          <div className="panel-sub">Click a live message to show it on the broadcast.</div>
          <div style={{ maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {chat.length === 0 && <p className="muted" style={{ fontSize: "13px" }}>Live chat messages will appear here during a broadcast.</p>}
            {chat.slice().reverse().map((m) => (
              <div key={m.id} className="dest-row" style={{ padding: "10px 0" }}>
                <div style={{ minWidth: 0 }}>
                  <div className="dest-name" style={{ color: "var(--amber)" }}>{m.name}</div>
                  <div className="dest-meta" style={{ whiteSpace: "normal" }}>{m.text}</div>
                </div>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => pin(m)} disabled={!connected}>Pin</button>
              </div>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => send({ action: "hideComment" })} disabled={!connected} style={{ marginTop: 14 }}>
            Remove pinned comment
          </button>
        </div>
      </div>
    </>
  );
}
