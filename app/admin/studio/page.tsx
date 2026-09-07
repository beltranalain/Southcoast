"use client";

import { useEffect, useRef, useState } from "react";
import { getIdToken } from "@/lib/firebase";
import { RealtimeSession, whipPublish } from "@/lib/realtimeClient";

const WS_BASE = process.env.NEXT_PUBLIC_CHAT_WS_URL || "";
const ROOM_ID = "main";
const SIGNAL_ROOM = `rt-${ROOM_ID}`;
type Participant = { id: string; name: string; role: string; sessionId?: string; hasVideo: boolean; hasAudio: boolean };
type Layout = "grid" | "spotlight";

function drawCover(ctx: CanvasRenderingContext2D, v: HTMLVideoElement, x: number, y: number, w: number, h: number) {
  if (!v.videoWidth) { ctx.fillStyle = "#151110"; ctx.fillRect(x, y, w, h); return; }
  const vr = v.videoWidth / v.videoHeight, dr = w / h;
  let sw = v.videoWidth, sh = v.videoHeight, sx = 0, sy = 0;
  if (vr > dr) { sw = v.videoHeight * dr; sx = (v.videoWidth - sw) / 2; }
  else { sh = v.videoWidth / dr; sy = (v.videoHeight - sh) / 2; }
  ctx.drawImage(v, sx, sy, sw, sh, x, y, w, h);
}

export default function StudioPage() {
  const [status, setStatus] = useState<"idle" | "ready" | "live" | "error">("idle");
  const [message, setMessage] = useState("");
  const [roster, setRoster] = useState<Participant[]>([]);
  const [layout, setLayout] = useState<Layout>("grid");
  const [streamReady, setStreamReady] = useState<boolean | null>(null);
  const [inviteUrl, setInviteUrl] = useState("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostVideo = useRef<HTMLVideoElement | null>(null);
  const hostStream = useRef<MediaStream | null>(null);
  const rtc = useRef<RealtimeSession | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const whipPc = useRef<RTCPeerConnection | null>(null);
  const ingest = useRef<{ whipUrl: string } | null>(null);

  const guestVideos = useRef<Map<string, HTMLVideoElement>>(new Map());
  const subscribed = useRef<Set<string>>(new Set());
  const audioCtx = useRef<AudioContext | null>(null);
  const audioDest = useRef<MediaStreamAudioDestinationNode | null>(null);
  const rafRef = useRef<number>(0);
  const layoutRef = useRef<Layout>("grid");
  layoutRef.current = layout;

  useEffect(() => {
    setInviteUrl(window.location.origin + "/join/" + ROOM_ID);
    setup();
    return () => {
      cancelAnimationFrame(rafRef.current);
      ws.current?.close();
      rtc.current?.close();
      whipPc.current?.close();
      hostStream.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function setup() {
    // host camera (create the offscreen <video> on the client)
    hostVideo.current = document.createElement("video");
    hostVideo.current.muted = true;
    (hostVideo.current as any).playsInline = true;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      hostStream.current = s;
      hostVideo.current.srcObject = s;
      await hostVideo.current.play().catch(() => {});
    } catch {
      setStatus("error"); setMessage("Camera/mic access is required to run the studio."); return;
    }

    // audio mixer
    audioCtx.current = new AudioContext();
    audioDest.current = audioCtx.current.createMediaStreamDestination();
    try { audioCtx.current.createMediaStreamSource(hostStream.current).connect(audioDest.current); } catch {}

    // realtime session (publish host, pull guests)
    try {
      const session = new RealtimeSession((sid, track) => onRemoteTrack(sid, track));
      rtc.current = session;
      await session.create();
      await session.publish(hostStream.current);
    } catch { /* Realtime not configured; studio still previews the host */ }

    // signaling (announce host + receive roster)
    if (WS_BASE) {
      const sock = new WebSocket(`${WS_BASE}/room/${SIGNAL_ROOM}/ws`);
      ws.current = sock;
      const me: Participant = { id: "host", name: "South Coast Cane", role: "host", sessionId: rtc.current?.sessionId, hasVideo: true, hasAudio: true };
      sock.onopen = () => sock.send(JSON.stringify({ type: "studio", action: "join", participant: me }));
      sock.onmessage = (e) => {
        let d: any; try { d = JSON.parse(e.data); } catch { return; }
        if (d.type === "studio" && d.action === "roster") {
          const guests = d.participants.filter((p: Participant) => p.role === "guest");
          setRoster(guests);
          guests.forEach((g: Participant) => {
            if (g.sessionId && !subscribed.current.has(g.sessionId) && rtc.current) {
              subscribed.current.add(g.sessionId);
              if (g.hasVideo) rtc.current.pull(g.sessionId!, "video").catch(() => {});
              if (g.hasAudio) rtc.current.pull(g.sessionId!, "audio").catch(() => {});
            }
          });
        }
      };
    }

    await checkStream();
    setStatus("ready");
    startCompositing();
  }

  function onRemoteTrack(sid: string, track: MediaStreamTrack) {
    if (track.kind === "video") {
      let v = guestVideos.current.get(sid);
      if (!v) { v = document.createElement("video"); v.muted = true; v.autoplay = true; (v as any).playsInline = true; guestVideos.current.set(sid, v); }
      const ms = (v.srcObject as MediaStream) || new MediaStream();
      ms.addTrack(track); v.srcObject = ms; v.play().catch(() => {});
    } else if (track.kind === "audio" && audioCtx.current && audioDest.current) {
      const ms = new MediaStream([track]);
      try { audioCtx.current.createMediaStreamSource(ms).connect(audioDest.current); } catch {}
    }
  }

  async function checkStream() {
    try {
      const token = await getIdToken();
      const res = await fetch("/api/stream/ingest", { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
      const d = await res.json();
      if (d.configured && d.ingest?.whipUrl) { ingest.current = { whipUrl: d.ingest.whipUrl }; setStreamReady(true); }
      else setStreamReady(false);
    } catch { setStreamReady(false); }
  }

  function startCompositing() {
    const canvas = canvasRef.current!; const ctx = canvas.getContext("2d")!;
    const draw = () => {
      ctx.fillStyle = "#0A0908"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const sources: HTMLVideoElement[] = [hostVideo.current, ...Array.from(guestVideos.current.values())].filter(Boolean) as HTMLVideoElement[];
      const n = sources.length;
      const W = canvas.width, H = canvas.height, gap = 8;
      if (layoutRef.current === "spotlight" && n > 1) {
        const stripW = 300;
        drawCover(ctx, sources[0], 0, 0, W - stripW - gap, H);
        const cellH = (H - gap * (n - 2)) / (n - 1);
        sources.slice(1).forEach((v, i) => drawCover(ctx, v, W - stripW, i * (cellH + gap), stripW, cellH));
      } else {
        const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
        const cw = (W - gap * (cols - 1)) / cols, ch = (H - gap * (rows - 1)) / rows;
        sources.forEach((v, i) => { const c = i % cols, r = Math.floor(i / cols); drawCover(ctx, v, c * (cw + gap), r * (ch + gap), cw, ch); });
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
  }

  async function goLive() {
    if (!ingest.current?.whipUrl || !canvasRef.current) return;
    setMessage("");
    try {
      const canvasStream = canvasRef.current.captureStream(30);
      const mixed = new MediaStream([...canvasStream.getVideoTracks()]);
      if (audioDest.current) audioDest.current.stream.getAudioTracks().forEach((t) => mixed.addTrack(t));
      whipPc.current = await whipPublish(ingest.current.whipUrl, mixed);
      setStatus("live");
      setMessage("You are live on your site and simulcasting to YouTube.");
    } catch (e: any) {
      setStatus("error"); setMessage(e.message || "Could not go live.");
    }
  }

  function stopLive() {
    whipPc.current?.close(); whipPc.current = null;
    setStatus("ready"); setMessage("Broadcast stopped. The recording was saved to your library.");
  }

  function removeGuest(id: string) {
    ws.current?.send(JSON.stringify({ type: "studio", action: "control", target: id, command: "remove" }));
  }

  const live = status === "live";

  return (
    <>
      <div className="admin-topbar">
        <div>
          <h1>Studio</h1>
          <div className="sub">Invite guests, arrange the shot, and go live - all in the browser.</div>
        </div>
        <div className="admin-actions">
          <span className={`live-pill${live ? " is-live" : ""}`}><span className="dot" /><span>{live ? "On air" : "Off air"}</span></span>
        </div>
      </div>

      <div className="two-col">
        <div>
          <div className="panel">
            <h3>Program (what goes on air)</h3>
            <div className="panel-sub">Host + guests, composited live in your browser.</div>
            <div className="player-wrap"><canvas ref={canvasRef} width={1280} height={720} style={{ width: "100%", height: "100%" }} /></div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
              {!live ? (
                <button className="btn btn-live" type="button" onClick={goLive} disabled={streamReady !== true}>Go Live</button>
              ) : (
                <button className="btn btn-ghost" type="button" onClick={stopLive}>Stop broadcast</button>
              )}
              <div className="filters" style={{ margin: 0 }}>
                <button className={`filter-btn${layout === "grid" ? " active" : ""}`} type="button" onClick={() => setLayout("grid")}>Grid</button>
                <button className={`filter-btn${layout === "spotlight" ? " active" : ""}`} type="button" onClick={() => setLayout("spotlight")}>Spotlight</button>
              </div>
            </div>
            {streamReady === false && (
              <div className="notice" style={{ marginTop: 16 }}>
                <strong>Cloudflare Stream not connected.</strong> The studio previews and composites now;
                Go Live turns on once the Stream Live Input is set.
              </div>
            )}
            {message && <p className={status === "error" ? "form-error" : "form-ok"} style={{ marginTop: 12 }}>{message}</p>}
          </div>
        </div>

        <div>
          <div className="panel">
            <h3>Invite a guest</h3>
            <div className="panel-sub">Send this link. They join in their browser - video, audio, both, or neither.</div>
            <div className="copybox">
              <input type="text" readOnly value={inviteUrl} />
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => navigator.clipboard?.writeText(inviteUrl)}>Copy</button>
            </div>
          </div>
          <div className="panel">
            <h3>In the room</h3>
            <div className="dest-row">
              <div><div className="dest-name">South Coast Cane (you)</div><div className="dest-meta">host</div></div>
              <span className="pill published">On</span>
            </div>
            {roster.length === 0 && <p className="muted" style={{ fontSize: "13px", marginTop: 12 }}>No guests yet. Share the invite link.</p>}
            {roster.map((p) => (
              <div className="dest-row" key={p.id}>
                <div><div className="dest-name">{p.name}</div><div className="dest-meta">{p.hasVideo ? "video" : "no video"} · {p.hasAudio ? "audio" : "muted"}</div></div>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => removeGuest(p.id)}>Remove</button>
              </div>
            ))}
          </div>
          {!WS_BASE && (
            <div className="notice"><strong>Chat/studio backend not connected.</strong> Set NEXT_PUBLIC_CHAT_WS_URL.</div>
          )}
        </div>
      </div>
    </>
  );
}
