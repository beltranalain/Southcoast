"use client";

import Link from "next/link";
import { useEffect, useReducer, useRef, useState } from "react";
import { broadcast } from "@/lib/broadcast";
import SimulcastManager from "@/components/SimulcastManager";

const WS_BASE = process.env.NEXT_PUBLIC_CHAT_WS_URL || "";
type Tab = "onair" | "chat" | "guests" | "sources";
type ChatMessage = { id: string; name: string; text: string };

export default function ControlRoom() {
  const [, force] = useReducer((x) => x + 1, 0);
  const [tab, setTab] = useState<Tab>("onair");
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [reveal, setReveal] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const overlayWs = useRef<WebSocket | null>(null);
  const chatWs = useRef<WebSocket | null>(null);

  useEffect(() => broadcast.subscribe(force), []);

  // Start the engine and mount its composited canvas as the program preview.
  useEffect(() => {
    broadcast.init().then(() => {
      navigator.mediaDevices.enumerateDevices().then((d) => {
        setCams(d.filter((x) => x.kind === "videoinput"));
        setMics(d.filter((x) => x.kind === "audioinput"));
      });
    });
    const el = broadcast.canvas;
    if (el && stageRef.current && el.parentElement !== stageRef.current) {
      el.style.width = "100%"; el.style.height = "100%"; el.style.objectFit = "cover"; el.style.display = "block";
      stageRef.current.appendChild(el);
    }
    return () => { if (el && el.parentElement) el.parentElement.removeChild(el); };
  }, []);

  // Chat (monitor + pin source) + overlay (OBS mirror) sockets.
  useEffect(() => {
    if (!WS_BASE) return;
    const ow = new WebSocket(`${WS_BASE}/room/overlay/ws`); overlayWs.current = ow;
    const cw = new WebSocket(`${WS_BASE}/room/live/ws`);
    cw.onmessage = (e) => { let d: any; try { d = JSON.parse(e.data); } catch { return; }
      if (d.type === "history" && Array.isArray(d.messages)) setChat(d.messages.slice(-60));
      else if (d.type === "chat") setChat((p) => [...p.slice(-59), d]); };
    chatWs.current = cw;
    return () => { ow.close(); cw.close(); };
  }, []);

  // Push graphics to BOTH the browser composite (engine) and the OBS overlay.
  const pushOverlay = (cmd: Record<string, unknown>) => overlayWs.current?.send(JSON.stringify({ type: "overlay", ...cmd }));
  const showBanner = () => { if (!title.trim()) return; broadcast.setBanner(title, subtitle); pushOverlay({ action: "banner", title, subtitle }); };
  const hideBanner = () => { broadcast.hideBanner(); pushOverlay({ action: "hideBanner" }); };
  const clearAll = () => { broadcast.clearGraphics(); pushOverlay({ action: "clear" }); };
  const pin = (m: ChatMessage) => { broadcast.setPinned(m.name, m.text); pushOverlay({ action: "comment", name: m.name, text: m.text }); };

  const live = broadcast.live;
  const ingest = broadcast.ingest;

  return (
    <>
      <div className="admin-topbar">
        <div>
          <h1>Go Live</h1>
          <div className="sub">Your whole show on one screen. Camera, guests, graphics - all composited in the browser.</div>
        </div>
        <div className="admin-actions">
          <span className={`live-pill${live ? " is-live" : ""}`}><span className="dot" /><span>{live ? "On air" : "Off air"}</span></span>
        </div>
      </div>

      <div className="two-col">
        {/* ---- Program ---- */}
        <div className="panel">
          <h3>Program</h3>
          <div className="panel-sub">Exactly what goes out - camera, guests, and on-air graphics burned in.</div>
          <div className="player-wrap" ref={stageRef} style={{ padding: 0, overflow: "hidden" }} />
          <div className="panel-split" style={{ marginTop: 14 }}>
            <div className="form-field">
              <label>Camera</label>
              <select onChange={(e) => broadcast.ensureCamera(e.target.value, undefined)}>
                {cams.map((c) => <option key={c.deviceId} value={c.deviceId}>{c.label || "Camera"}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Microphone</label>
              <select onChange={(e) => broadcast.ensureCamera(undefined, e.target.value)}>
                {mics.map((m) => <option key={m.deviceId} value={m.deviceId}>{m.label || "Microphone"}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {!live ? (
              <button className="btn btn-live" type="button" onClick={() => broadcast.goLive()} disabled={broadcast.connecting || ingest === null}>
                {broadcast.connecting ? "Connecting..." : "Go Live"}
              </button>
            ) : (
              <button className="btn btn-ghost" type="button" onClick={() => broadcast.stop()}>Stop broadcast</button>
            )}
            <div className="filters" style={{ margin: 0 }}>
              <button className={`filter-btn${broadcast.layout === "grid" ? " active" : ""}`} type="button" onClick={() => broadcast.setLayout("grid")}>Grid</button>
              <button className={`filter-btn${broadcast.layout === "spotlight" ? " active" : ""}`} type="button" onClick={() => broadcast.setLayout("spotlight")}>Spotlight</button>
            </div>
            <Link className="btn btn-ghost btn-sm" href="/live" target="_blank">Open live page</Link>
          </div>
          {ingest === null && <div className="notice" style={{ marginTop: 14 }}><strong>Cloudflare Stream not connected.</strong> Preview works; Go Live turns on once the Stream keys are set.</div>}
          {broadcast.error && <p className="form-error" style={{ marginTop: 10 }}>{broadcast.error}</p>}
          {live && <p className="form-ok" style={{ marginTop: 10 }}>Live on your site and simulcasting to YouTube.</p>}
        </div>

        {/* ---- Show controls ---- */}
        <div>
          <div className="filters" style={{ marginBottom: 16 }}>
            {([["onair", "On air"], ["chat", "Chat"], ["guests", "Guests"], ["sources", "Sources"]] as [Tab, string][]).map(([k, label]) => (
              <button key={k} className={`filter-btn${tab === k ? " active" : ""}`} type="button" onClick={() => setTab(k)}>{label}</button>
            ))}
          </div>

          {tab === "onair" && (
            <div className="panel">
              <h3>On-air graphics</h3>
              <div className="panel-sub">These appear on the broadcast itself (burned into the video).</div>
              <div className="form-field"><label>Banner title</label><input type="text" value={title} placeholder="South Coast Cane" onChange={(e) => setTitle(e.target.value)} /></div>
              <div className="form-field"><label>Subtitle (optional)</label><input type="text" value={subtitle} placeholder="Segment 2" onChange={(e) => setSubtitle(e.target.value)} /></div>
              <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
                <button className="btn btn-primary btn-sm" type="button" onClick={showBanner}>Show banner</button>
                <button className="btn btn-ghost btn-sm" type="button" onClick={hideBanner}>Hide banner</button>
                <button className="btn btn-ghost btn-sm" type="button" onClick={clearAll}>Clear all</button>
              </div>
              <div className="panel-sub">Click a message to pin it on the broadcast:</div>
              <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                {chat.length === 0 && <p className="muted" style={{ fontSize: "13px" }}>Chat appears here during a broadcast.</p>}
                {chat.slice().reverse().map((m) => (
                  <div className="dest-row" key={m.id} style={{ padding: "9px 0" }}>
                    <div style={{ minWidth: 0 }}><div className="dest-name" style={{ color: "var(--amber)" }}>{m.name}</div><div className="dest-meta" style={{ whiteSpace: "normal" }}>{m.text}</div></div>
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => pin(m)}>Pin</button>
                  </div>
                ))}
              </div>
              {broadcast.pinned && <button className="btn btn-ghost btn-sm" type="button" onClick={() => { broadcast.clearGraphics(); pushOverlay({ action: "hideComment" }); }} style={{ marginTop: 12 }}>Remove pinned comment</button>}
            </div>
          )}

          {tab === "chat" && (
            <div className="panel">
              <h3>Live chat</h3>
              <div className="panel-sub">Site + YouTube, merged.</div>
              <div style={{ maxHeight: 420, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
                {chat.length === 0 && <p className="muted" style={{ fontSize: "13px" }}>No messages yet.</p>}
                {chat.map((m) => <div className="msg" key={m.id}><span className="src">Site</span><b>{m.name}</b> {m.text}</div>)}
              </div>
            </div>
          )}

          {tab === "guests" && (
            <div className="panel">
              <h3>Invite a guest</h3>
              <div className="panel-sub">Send this link - they join in the browser (video, audio, both, or neither) and appear in the program.</div>
              <div className="copybox" style={{ marginBottom: 16 }}>
                <input type="text" readOnly value={broadcast.inviteUrl()} />
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => navigator.clipboard?.writeText(broadcast.inviteUrl())}>Copy</button>
              </div>
              <div className="panel-sub">In the room</div>
              <div className="dest-row"><div><div className="dest-name">South Coast Cane (you)</div><div className="dest-meta">host</div></div><span className="pill published">On</span></div>
              {broadcast.roster.length === 0 && <p className="muted" style={{ fontSize: "13px", marginTop: 10 }}>No guests yet. Share the link above.</p>}
              {broadcast.roster.map((p) => (
                <div className="dest-row" key={p.id}><div><div className="dest-name">{p.name}</div><div className="dest-meta">{p.hasVideo ? "video" : "no video"} · {p.hasAudio ? "audio" : "muted"}</div></div></div>
              ))}
              <p className="notice" style={{ marginTop: 14 }}><strong>Guest video needs Cloudflare Realtime connected.</strong> Once its keys are set, guests appear on screen automatically - no OBS.</p>
            </div>
          )}

          {tab === "sources" && (
            <>
              <div className="panel">
                <h3>OBS - optional pro mode</h3>
                <div className="panel-sub">Only if you want to stream from OBS instead of the browser. Paste into OBS -&gt; Settings -&gt; Stream (Custom).</div>
                {ingest ? (
                  <>
                    <label className="form-note" style={{ marginBottom: 6, display: "block" }}>Server (RTMPS)</label>
                    <div className="copybox" style={{ marginBottom: 14 }}><input type="text" readOnly value={ingest.rtmpsUrl} /><button className="btn btn-ghost btn-sm" type="button" onClick={() => navigator.clipboard?.writeText(ingest.rtmpsUrl)}>Copy</button></div>
                    <label className="form-note" style={{ marginBottom: 6, display: "block" }}>Stream key</label>
                    <div className="copybox"><input type={reveal ? "text" : "password"} readOnly value={ingest.streamKey} /><button className="btn btn-ghost btn-sm" type="button" onClick={() => setReveal((v) => !v)}>{reveal ? "Hide" : "Show"}</button><button className="btn btn-ghost btn-sm" type="button" onClick={() => navigator.clipboard?.writeText(ingest.streamKey)}>Copy</button></div>
                  </>
                ) : <p className="muted" style={{ fontSize: "13.5px" }}>Connect Cloudflare Stream to get your OBS keys.</p>}
              </div>
              <SimulcastManager />
            </>
          )}
        </div>
      </div>
    </>
  );
}
