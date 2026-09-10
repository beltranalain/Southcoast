"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getIdToken } from "@/lib/firebase";
import { RealtimeSession, whipPublish } from "@/lib/realtimeClient";

const WS_BASE = process.env.NEXT_PUBLIC_CHAT_WS_URL || "";
const ROOM_ID = "main";
const SIGNAL_ROOM = `rt-${ROOM_ID}`;

// The host's browser decodes and composites every guest ON STAGE, so this is a
// hardware limit, not a policy one. Guests beyond it wait backstage: they are in
// the room, but their media is never pulled, so they cost the host nothing.
// Six is safe on a normal laptop; raise it only after testing on the machine
// that will actually run the show.
const MAX_ON_STAGE = Number(process.env.NEXT_PUBLIC_MAX_ON_STAGE || 6);

// Program canvas. Drawing faster than we capture just burns CPU the encoder needs.
const FPS = 30;
const FRAME_MS = 1000 / FPS;

type Participant = {
  id: string;
  name: string;
  role: string;
  sessionId?: string;
  hasVideo: boolean;
  hasAudio: boolean;
};
type Layout = "grid" | "spotlight";
type DestHealth = { id: string; target: string; alive: boolean; restarts: number; lastError?: string };
type RelayState = {
  configured?: boolean;
  reachable?: boolean;
  live?: boolean;
  vcodec?: string;
  destinations?: DestHealth[];
};

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
  const [warning, setWarning] = useState("");
  const [roster, setRoster] = useState<Participant[]>([]);
  const [stage, setStage] = useState<string[]>([]);
  const [layout, setLayout] = useState<Layout>("grid");
  const [streamReady, setStreamReady] = useState<boolean | null>(null);
  const [relay, setRelay] = useState<RelayState | null>(null);
  const [inviteUrl, setInviteUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostVideo = useRef<HTMLVideoElement | null>(null);
  const hostStream = useRef<MediaStream | null>(null);
  const rtc = useRef<RealtimeSession | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const whipPc = useRef<RTCPeerConnection | null>(null);
  const ingest = useRef<{ whipUrl: string } | null>(null);

  const guestVideos = useRef<Map<string, HTMLVideoElement>>(new Map());
  const guestAudio = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());
  const pulled = useRef<Set<string>>(new Set());
  const audioCtx = useRef<AudioContext | null>(null);
  const audioDest = useRef<MediaStreamAudioDestinationNode | null>(null);
  const rafRef = useRef<number>(0);
  const lastFrame = useRef<number>(0);
  const layoutRef = useRef<Layout>("grid");
  const stageRef = useRef<string[]>([]);
  const rosterRef = useRef<Participant[]>([]);
  layoutRef.current = layout;
  stageRef.current = stage;
  rosterRef.current = roster;

  async function post(path: string, body?: unknown) {
    try {
      const token = await getIdToken();
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
      return await res.json().catch(() => ({}));
    } catch { return {}; }
  }

  useEffect(() => {
    setInviteUrl(window.location.origin + "/join/" + ROOM_ID);
    // Wake the relay early so Go Live never races a cold start.
    void post("/api/simulcast/warm");
    setup();
    return () => {
      cancelAnimationFrame(rafRef.current);
      ws.current?.close();
      rtc.current?.close();
      whipPc.current?.close();
      hostStream.current?.getTracks().forEach((t) => t.stop());
      void post("/api/simulcast/stop"); // never leave a relay session running
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function setup() {
    hostVideo.current = document.createElement("video");
    hostVideo.current.muted = true;
    (hostVideo.current as any).playsInline = true;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      hostStream.current = s;
      hostVideo.current.srcObject = s;
      await hostVideo.current.play().catch(() => {});
    } catch {
      setStatus("error"); setMessage("Camera and mic access is required to run the studio."); return;
    }

    audioCtx.current = new AudioContext();
    audioDest.current = audioCtx.current.createMediaStreamDestination();
    try { audioCtx.current.createMediaStreamSource(hostStream.current).connect(audioDest.current); } catch {}

    try {
      const session = new RealtimeSession((sid, track) => onRemoteTrack(sid, track));
      rtc.current = session;
      await session.create();
      await session.publish(hostStream.current);
    } catch { /* Realtime not configured; studio still previews the host */ }

    if (WS_BASE) {
      const sock = new WebSocket(`${WS_BASE}/room/${SIGNAL_ROOM}/ws`);
      ws.current = sock;
      const me: Participant = { id: "host", name: "South Coast Cane", role: "host", sessionId: rtc.current?.sessionId, hasVideo: true, hasAudio: true };
      sock.onopen = () => sock.send(JSON.stringify({ type: "studio", action: "join", participant: me }));
      sock.onmessage = (e) => {
        let d: any; try { d = JSON.parse(e.data); } catch { return; }
        if (d.type === "studio" && d.action === "roster") {
          const guests: Participant[] = d.participants.filter((p: Participant) => p.role === "guest");
          setRoster(guests);
          reconcileStage(guests);
        }
      };
    }

    await checkStream();
    setStatus("ready");
    startCompositing();
  }

  // Guests arrive backstage. Auto-promote up to MAX_ON_STAGE so a solo host
  // doesn't click for every guest; the rest wait.
  const reconcileStage = useCallback((guests: Participant[]) => {
    setStage((prev) => {
      const present = new Set(guests.map((g) => g.id));
      const next = prev.filter((id) => present.has(id));
      for (const g of guests) {
        if (next.length >= MAX_ON_STAGE) break;
        if (!next.includes(g.id)) next.push(g.id);
      }
      syncSubscriptions(next, guests);
      return next;
    });
  }, []);

  // Pull media ONLY for guests on stage. This is the whole reason ten guests can
  // be in the room: backstage guests cost no decode, no bandwidth, no canvas work.
  function syncSubscriptions(stageIds: string[], guests: Participant[]) {
    const wanted = new Set(guests.filter((g) => stageIds.includes(g.id) && g.sessionId).map((g) => g.sessionId as string));

    for (const g of guests) {
      const sid = g.sessionId;
      if (!sid || !wanted.has(sid) || pulled.current.has(sid) || !rtc.current) continue;
      pulled.current.add(sid);
      const names: string[] = [];
      if (g.hasVideo) names.push("video");
      if (g.hasAudio) names.push("audio");
      if (names.length) rtc.current.pull(sid, names).catch(() => pulled.current.delete(sid));
    }

    for (const sid of Array.from(pulled.current)) {
      if (wanted.has(sid)) continue;
      pulled.current.delete(sid);
      const v = guestVideos.current.get(sid);
      if (v) {
        (v.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
        v.srcObject = null;
        guestVideos.current.delete(sid);
      }
      const node = guestAudio.current.get(sid);
      if (node) { try { node.disconnect(); } catch {} guestAudio.current.delete(sid); }
    }
  }

  function setStageFor(id: string, on: boolean) {
    setStage((prev) => {
      if (on && !prev.includes(id) && prev.length >= MAX_ON_STAGE) {
        setWarning(`Stage is full at ${MAX_ON_STAGE}. Take someone off first.`);
        return prev;
      }
      const next = on ? [...prev.filter((x) => x !== id), id] : prev.filter((x) => x !== id);
      if (on) setWarning("");
      syncSubscriptions(next, rosterRef.current);
      return next;
    });
  }

  function onRemoteTrack(sid: string, track: MediaStreamTrack) {
    if (track.kind === "video") {
      let v = guestVideos.current.get(sid);
      if (!v) { v = document.createElement("video"); v.muted = true; v.autoplay = true; (v as any).playsInline = true; guestVideos.current.set(sid, v); }
      const ms = (v.srcObject as MediaStream) || new MediaStream();
      ms.addTrack(track); v.srcObject = ms; v.play().catch(() => {});
    } else if (track.kind === "audio" && audioCtx.current && audioDest.current) {
      try {
        const node = audioCtx.current.createMediaStreamSource(new MediaStream([track]));
        node.connect(audioDest.current);
        guestAudio.current.set(sid, node);
      } catch {}
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

  function stagedVideos(): HTMLVideoElement[] {
    const byId = new Map(rosterRef.current.map((p) => [p.id, p]));
    const out: HTMLVideoElement[] = [];
    for (const id of stageRef.current) {
      const sid = byId.get(id)?.sessionId;
      const v = sid ? guestVideos.current.get(sid) : null;
      if (v) out.push(v);
    }
    return out;
  }

  function startCompositing() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d", { alpha: false })!;
    const draw = (now: number) => {
      rafRef.current = requestAnimationFrame(draw);
      if (now - lastFrame.current < FRAME_MS) return; // hold to 30fps
      lastFrame.current = now;

      ctx.fillStyle = "#0A0908";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const sources = [hostVideo.current, ...stagedVideos()].filter(Boolean) as HTMLVideoElement[];
      const n = sources.length;
      if (!n) return;
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
    };
    rafRef.current = requestAnimationFrame(draw);
  }

  async function goLive() {
    if (!ingest.current?.whipUrl || !canvasRef.current || busy) return;
    setBusy(true); setMessage(""); setWarning("");
    try {
      const canvasStream = canvasRef.current.captureStream(FPS);
      const mixed = new MediaStream([...canvasStream.getVideoTracks()]);
      if (audioDest.current) audioDest.current.stream.getAudioTracks().forEach((t) => mixed.addTrack(t));
      whipPc.current = await whipPublish(ingest.current.whipUrl, mixed);
      setStatus("live");
      setMessage("Publishing to Cloudflare. Starting the simulcast...");

      // THIS is what actually puts the show on YouTube and on the public site.
      // Without it the browser only publishes to a WebRTC input nobody watches.
      const r = await post("/api/simulcast/start");
      if (r?.ok) {
        const bits: string[] = [];
        if (r.playback) bits.push("your site");
        if (r.external) bits.push(`${r.external} external destination${r.external === 1 ? "" : "s"}`);
        setMessage(bits.length ? `On air to ${bits.join(" and ")}.` : "On air.");
      } else {
        setWarning(r?.error || r?.warning || "Publishing to Cloudflare, but the simulcast did not start. YouTube and the site player may be dark.");
      }
      pollRelay();
    } catch (e: any) {
      setStatus("error"); setMessage(e?.message || "Could not go live.");
    } finally { setBusy(false); }
  }

  async function stopLive() {
    setBusy(true);
    whipPc.current?.close(); whipPc.current = null;
    await post("/api/simulcast/stop");
    setRelay(null); setStatus("ready");
    setMessage("Broadcast stopped. The recording is being filed to your library.");
    setWarning(""); setBusy(false);
  }

  // Poll while live so the host sees whether YouTube is really receiving,
  // instead of trusting a button that claimed it worked.
  function pollRelay() {
    const tick = async () => {
      try {
        const token = await getIdToken();
        const res = await fetch("/api/simulcast/status", { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
        setRelay(await res.json());
      } catch {}
    };
    tick();
    const id = setInterval(() => { if (whipPc.current) tick(); else clearInterval(id); }, 5000);
  }

  function removeGuest(id: string) {
    ws.current?.send(JSON.stringify({ type: "studio", action: "control", target: id, command: "remove" }));
  }

  const live = status === "live";
  const onStage = roster.filter((p) => stage.includes(p.id));
  const backstage = roster.filter((p) => !stage.includes(p.id));
  const transcoding = Boolean(relay?.vcodec && relay.vcodec !== "h264");

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
            <div className="panel-sub">Host plus everyone on stage, composited live in your browser. Backstage guests are not in the shot and cost your machine nothing.</div>
            <div className="player-wrap"><canvas ref={canvasRef} width={1280} height={720} style={{ width: "100%", height: "100%" }} /></div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
              {!live ? (
                <button className="btn btn-live" type="button" onClick={goLive} disabled={streamReady !== true || busy}>{busy ? "Starting..." : "Go Live"}</button>
              ) : (
                <button className="btn btn-ghost" type="button" onClick={stopLive} disabled={busy}>Stop broadcast</button>
              )}
              <div className="filters" style={{ margin: 0 }}>
                <button className={`filter-btn${layout === "grid" ? " active" : ""}`} type="button" onClick={() => setLayout("grid")}>Grid</button>
                <button className={`filter-btn${layout === "spotlight" ? " active" : ""}`} type="button" onClick={() => setLayout("spotlight")}>Spotlight</button>
              </div>
              <span className="dest-meta" style={{ marginLeft: "auto" }}>{onStage.length + 1} on stage &middot; {backstage.length} waiting</span>
            </div>

            {streamReady === false && (
              <div className="notice" style={{ marginTop: 16 }}>
                <strong>Cloudflare Stream not connected.</strong> The studio previews and composites now; Go Live turns on once the Stream Live Input is set.
              </div>
            )}
            {warning && <div className="notice" style={{ marginTop: 16 }}><strong>Heads up.</strong> {warning}</div>}
            {message && <p className={status === "error" ? "form-error" : "form-ok"} style={{ marginTop: 12 }}>{message}</p>}
          </div>

          {live && (
            <div className="panel">
              <h3>Where it is actually going</h3>
              <div className="panel-sub">Live health from the relay. If a row is down, that platform is not receiving.</div>
              {!relay?.reachable && <p className="form-error">Relay unreachable - nothing is being forwarded.</p>}
              {(relay?.destinations || []).map((d) => (
                <div className="dest-row" key={d.id}>
                  <div>
                    <div className="dest-name">{d.id === "cf-playback" ? "Your site + recording" : d.target}</div>
                    <div className="dest-meta">
                      {d.alive ? "receiving" : "down"}
                      {d.restarts ? ` \u00b7 ${d.restarts} restart${d.restarts === 1 ? "" : "s"}` : ""}
                      {d.lastError ? ` \u00b7 ${d.lastError}` : ""}
                    </div>
                  </div>
                  <span className={`pill ${d.alive ? "published" : ""}`}>{d.alive ? "On" : "Off"}</span>
                </div>
              ))}
              {transcoding && (
                <div className="notice" style={{ marginTop: 12 }}>
                  <strong>Transcoding, not copying.</strong> Cloudflare is sending {relay?.vcodec} rather than H.264, so the relay is re-encoding. Expect higher CPU and softer video.
                </div>
              )}
            </div>
          )}
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
            <h3>On stage</h3>
            <div className="panel-sub">In the shot. Limit {MAX_ON_STAGE} - your machine does the mixing.</div>
            <div className="dest-row">
              <div><div className="dest-name">South Coast Cane (you)</div><div className="dest-meta">host</div></div>
              <span className="pill published">On</span>
            </div>
            {onStage.map((p) => (
              <div className="dest-row" key={p.id}>
                <div><div className="dest-name">{p.name}</div><div className="dest-meta">{p.hasVideo ? "video" : "no video"} &middot; {p.hasAudio ? "audio" : "muted"}</div></div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => setStageFor(p.id, false)}>Backstage</button>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => removeGuest(p.id)}>Remove</button>
                </div>
              </div>
            ))}
          </div>

          <div className="panel">
            <h3>Backstage ({backstage.length})</h3>
            <div className="panel-sub">In the room and waiting. Not in the shot, not using your CPU or bandwidth.</div>
            {backstage.length === 0 && <p className="muted" style={{ fontSize: "13px", marginTop: 12 }}>Nobody waiting. Share the invite link.</p>}
            {backstage.map((p) => (
              <div className="dest-row" key={p.id}>
                <div><div className="dest-name">{p.name}</div><div className="dest-meta">{p.hasVideo ? "video" : "no video"} &middot; {p.hasAudio ? "audio" : "muted"}</div></div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => setStageFor(p.id, true)} disabled={onStage.length >= MAX_ON_STAGE}>Bring on</button>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => removeGuest(p.id)}>Remove</button>
                </div>
              </div>
            ))}
          </div>

          {!WS_BASE && <div className="notice"><strong>Chat/studio backend not connected.</strong> Set NEXT_PUBLIC_CHAT_WS_URL.</div>}
        </div>
      </div>
    </>
  );
}
