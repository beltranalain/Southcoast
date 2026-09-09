"use client";

import Link from "next/link";
import { useEffect, useReducer, useRef, useState } from "react";
import { broadcast } from "@/lib/broadcast";
import { getIdToken } from "@/lib/firebase";
import SimulcastManager from "@/components/SimulcastManager";

const WS_BASE = process.env.NEXT_PUBLIC_CHAT_WS_URL || "";
type Tab = "onair" | "chat" | "guests" | "sources" | "scene" | "intro" | "sounds";
type ChatMessage = { id: string; name: string; text: string; uid?: string; tip?: number };
type SceneCfg = { enabled: boolean; mode: "none" | "chroma" | "ml"; chroma: string; background: string; frame: string; logo: string; tickerOn: boolean; tickerLabel: string; ticker: string };
type BumperCfg = { enabled: boolean; mode: "card" | "video"; headline: string; subtext: string; background: string; videoUrl: string; startsAt: number };
type SoundPad = { id: string; label: string; url: string };
type ScheduleItem = { when: string; title: string; note: string; startsAt?: number };

// Resize a picked image for a scene layer (cover fill or contain). Frame/logo
// keep transparency (PNG); background uses WebP.
function resizeScene(file: File, w: number, h: number, cover: boolean, png: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        const ctx = c.getContext("2d"); if (!ctx) throw new Error("no ctx");
        const scale = cover ? Math.max(w / img.width, h / img.height) : Math.min(w / img.width, h / img.height);
        const dw = img.width * scale, dh = img.height * scale;
        ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
        resolve(png ? c.toDataURL("image/png") : c.toDataURL("image/webp", 0.8));
      } catch (e) { reject(e); } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
    img.src = url;
  });
}

export default function ControlRoom() {
  const [, force] = useReducer((x) => x + 1, 0);
  const [tab, setTab] = useState<Tab>("onair");
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [reveal, setReveal] = useState(false);
  const [scene, setScene] = useState<SceneCfg>({ enabled: false, mode: "chroma", chroma: "#00b140", background: "", frame: "", logo: "", tickerOn: false, tickerLabel: "", ticker: "" });
  const [sceneMsg, setSceneMsg] = useState("");
  const [bumper, setBumper] = useState<BumperCfg>({ enabled: false, mode: "card", headline: "Starting soon", subtext: "", background: "", videoUrl: "", startsAt: 0 });
  const [bumperMsg, setBumperMsg] = useState("");
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [sounds, setSounds] = useState<SoundPad[]>([]);
  const [soundLabel, setSoundLabel] = useState("");
  const [soundMsg, setSoundMsg] = useState("");
  const [pressed, setPressed] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const overlayWs = useRef<WebSocket | null>(null);
  const chatWs = useRef<WebSocket | null>(null);
  const sceneBgInput = useRef<HTMLInputElement | null>(null);
  const sceneFrameInput = useRef<HTMLInputElement | null>(null);
  const sceneLogoInput = useRef<HTMLInputElement | null>(null);
  const soundInput = useRef<HTMLInputElement | null>(null);
  const bumperBgInput = useRef<HTMLInputElement | null>(null);

  // Load the saved scene + sounds and apply them to the engine.
  useEffect(() => {
    fetch("/api/site-config", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.scene) { const sc = { tickerOn: false, tickerLabel: "", ticker: "", ...d.scene }; setScene(sc); broadcast.setScene(sc); }
        if (d?.bumper) { const bm = { enabled: false, mode: "card", headline: "Starting soon", subtext: "", background: "", videoUrl: "", startsAt: 0, ...d.bumper } as BumperCfg; setBumper(bm); broadcast.setBumper(bm); }
        if (Array.isArray(d?.schedule)) setSchedule(d.schedule);
        if (Array.isArray(d?.sounds)) {
          setSounds(d.sounds);
          d.sounds.forEach((p: SoundPad) => { if (p?.id && p?.url) broadcast.loadSound(p.id, p.url); });
        }
      })
      .catch(() => {});
  }, []);

  async function saveSounds(items: SoundPad[]) {
    try {
      const token = await getIdToken();
      const res = await fetch("/api/site-config", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ section: "sounds", data: { items } }),
      });
      const d = await res.json();
      setSoundMsg(d.saved ? "Saved." : d.error || "Preview only - connect Firebase to save.");
    } catch { setSoundMsg("Could not save."); }
  }

  function pickSound(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setSoundMsg("");
    if (file.size > 240_000) { setSoundMsg("That clip is too large. Use a shorter or smaller sound (under ~240KB)."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || "");
      if (!url.startsWith("data:audio")) { setSoundMsg("That doesn't look like an audio file."); return; }
      const label = soundLabel.trim() || file.name.replace(/\.[^.]+$/, "").slice(0, 30) || "Sound";
      const id = (crypto as any)?.randomUUID?.() || Date.now() + "";
      const pad: SoundPad = { id, label, url };
      broadcast.loadSound(id, url);
      const next = [...sounds, pad];
      setSounds(next);
      setSoundLabel("");
      saveSounds(next);
    };
    reader.onerror = () => setSoundMsg("Could not read that file.");
    reader.readAsDataURL(file);
  }

  function removeSound(id: string) {
    broadcast.unloadSound(id);
    const next = sounds.filter((p) => p.id !== id);
    setSounds(next);
    saveSounds(next);
  }

  function tapPad(id: string) {
    broadcast.playSound(id);
    setPressed(id);
    setTimeout(() => setPressed((p) => (p === id ? null : p)), 180);
  }

  function updateScene(patch: Partial<SceneCfg>) {
    setScene((s) => { const next = { ...s, ...patch }; broadcast.setScene(next); return next; });
  }
  async function pickSceneImg(e: React.ChangeEvent<HTMLInputElement>, kind: "background" | "frame" | "logo") {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    try {
      const url = kind === "background" ? await resizeScene(file, 1280, 720, true, false)
        : kind === "frame" ? await resizeScene(file, 1280, 720, true, true)
        : await resizeScene(file, 400, 160, false, true);
      updateScene({ [kind]: url } as Partial<SceneCfg>);
    } catch { setSceneMsg("Could not read that image."); }
  }
  async function saveScene() {
    setSceneMsg("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/site-config", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ section: "scene", data: scene }),
      });
      const d = await res.json();
      setSceneMsg(d.saved ? "Scene saved." : d.error || "Preview only - connect Firebase to save.");
    } catch { setSceneMsg("Could not save."); }
  }

  // ---- Intro / "starting soon" bumper ----
  function updateBumper(patch: Partial<BumperCfg>) {
    setBumper((b) => { const next = { ...b, ...patch }; broadcast.setBumper(next); return next; });
  }
  async function pickBumperBg(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    try { updateBumper({ background: await resizeScene(file, 1280, 720, true, false) }); }
    catch { setBumperMsg("Could not read that image."); }
  }
  // Tie the countdown to the soonest future scheduled show (or clear it).
  function toggleCountdown(on: boolean) {
    if (!on) { updateBumper({ startsAt: 0 }); return; }
    const now = Date.now();
    const next = schedule
      .map((s) => Number(s.startsAt) || 0)
      .filter((t) => t > now)
      .sort((a, b) => a - b)[0] || 0;
    if (!next) { setBumperMsg("No upcoming scheduled show found. Add one in Schedule first."); updateBumper({ startsAt: 0 }); return; }
    setBumperMsg("");
    updateBumper({ startsAt: next });
  }
  async function saveBumper() {
    setBumperMsg("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/site-config", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ section: "bumper", data: bumper }),
      });
      const d = await res.json();
      setBumperMsg(d.saved ? "Intro saved." : d.error || "Preview only - connect Firebase to save.");
    } catch { setBumperMsg("Could not save."); }
  }

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

    // Drag the pinned comment, banner, or PIP camera around with a grab cursor.
    let drag: null | "pin" | "banner" | "pip" = null, ox = 0, oy = 0;
    const toCanvas = (e: PointerEvent) => {
      const r = el!.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (broadcast.width / r.width), y: (e.clientY - r.top) * (broadcast.height / r.height) };
    };
    const onDown = (e: PointerEvent) => {
      if (!el) return;
      const p = toCanvas(e);
      if (broadcast.hitPin(p.x, p.y)) { drag = "pin"; const b = broadcast.pinBox(); ox = p.x - b.x; oy = p.y - b.y; }
      else if (broadcast.hitBanner(p.x, p.y)) { drag = "banner"; const b = broadcast.bannerBox(); ox = p.x - b.x; oy = p.y - b.y; }
      else if (broadcast.hitPip(p.x, p.y)) { drag = "pip"; const b = broadcast.pipBox(); ox = p.x - b.x; oy = p.y - b.y; }
      if (drag) { el.style.cursor = "grabbing"; el.setPointerCapture?.(e.pointerId); e.preventDefault(); }
    };
    const onMove = (e: PointerEvent) => {
      if (!el) return;
      const p = toCanvas(e);
      if (drag === "pin") broadcast.setPinPos(p.x - ox, p.y - oy);
      else if (drag === "banner") broadcast.setBannerPos(p.x - ox, p.y - oy);
      else if (drag === "pip") broadcast.setPipPos(p.x - ox, p.y - oy);
      else el.style.cursor = broadcast.hitPin(p.x, p.y) || broadcast.hitBanner(p.x, p.y) || broadcast.hitPip(p.x, p.y) ? "grab" : "default";
    };
    const onUp = () => { if (drag) { drag = null; if (el) el.style.cursor = "grab"; } };
    el?.addEventListener("pointerdown", onDown);
    el?.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    return () => {
      el?.removeEventListener("pointerdown", onDown);
      el?.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (el && el.parentElement) el.parentElement.removeChild(el);
    };
  }, []);

  // Chat (monitor + pin source) + overlay (OBS mirror) sockets.
  useEffect(() => {
    if (!WS_BASE) return;
    const ow = new WebSocket(`${WS_BASE}/room/overlay/ws`); overlayWs.current = ow;
    const cw = new WebSocket(`${WS_BASE}/room/live/ws`);
    cw.onmessage = (e) => { let d: any; try { d = JSON.parse(e.data); } catch { return; }
      if (d.type === "history" && Array.isArray(d.messages)) setChat(d.messages.slice(-60));
      else if (d.type === "clear") setChat([]);
      else if (d.type === "chat") setChat((p) => [...p.slice(-59), d]);
      else if (d.type === "tip") broadcast.showTipAlert(d.name, d.amount, d.message); };
    chatWs.current = cw;
    return () => { ow.close(); cw.close(); };
  }, []);

  // Push graphics to BOTH the browser composite (engine) and the OBS overlay.
  const pushOverlay = (cmd: Record<string, unknown>) => overlayWs.current?.send(JSON.stringify({ type: "overlay", ...cmd }));
  const showBanner = () => { if (!title.trim()) return; broadcast.setBanner(title, subtitle); pushOverlay({ action: "banner", title, subtitle }); };
  const hideBanner = () => { broadcast.hideBanner(); pushOverlay({ action: "hideBanner" }); };
  const clearAll = () => { broadcast.clearGraphics(); pushOverlay({ action: "clear" }); };
  const pin = (m: ChatMessage) => { broadcast.setPinned(m.name, m.text); pushOverlay({ action: "comment", name: m.name, text: m.text }); };
  const unpin = () => { broadcast.clearPinned(); pushOverlay({ action: "hideComment" }); };
  const [modMsg, setModMsg] = useState("");
  const moderate = async (action: "ban" | "timeout" | "unban", m: ChatMessage, seconds?: number) => {
    if (!m.uid) { setModMsg("This viewer isn't signed in, so they can't be moderated."); return; }
    setModMsg("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/chat/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action, room: "live", uid: m.uid, name: m.name, seconds }),
      });
      setModMsg(res.ok ? `${m.name} ${action === "ban" ? "removed" : action === "timeout" ? "timed out" : "restored"}.` : "Could not apply that.");
    } catch { setModMsg("Moderation request failed."); }
  };
  const isPinned = (m: ChatMessage) => !!broadcast.pinned && broadcast.pinned.name === m.name && broadcast.pinned.text === m.text;

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
            {broadcast.screenSharing ? (
              <div className="filters" style={{ margin: 0 }}>
                <button className={`filter-btn${broadcast.screenLayout === "full" ? " active" : ""}`} type="button" onClick={() => broadcast.setScreenLayout("full")}>Full</button>
                <button className={`filter-btn${broadcast.screenLayout === "pip" ? " active" : ""}`} type="button" onClick={() => broadcast.setScreenLayout("pip")}>PIP</button>
                <button className={`filter-btn${broadcast.screenLayout === "split" ? " active" : ""}`} type="button" onClick={() => broadcast.setScreenLayout("split")}>Split</button>
              </div>
            ) : (
              <div className="filters" style={{ margin: 0 }}>
                <button className={`filter-btn${broadcast.layout === "grid" ? " active" : ""}`} type="button" onClick={() => broadcast.setLayout("grid")}>Grid</button>
                <button className={`filter-btn${broadcast.layout === "spotlight" ? " active" : ""}`} type="button" onClick={() => broadcast.setLayout("spotlight")}>Spotlight</button>
              </div>
            )}
            {broadcast.screenSharing ? (
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => broadcast.stopScreenShare()}>Stop sharing</button>
            ) : (
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => broadcast.startScreenShare()}>Share screen</button>
            )}
            {broadcast.recording ? (
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => broadcast.stopRecording()}><span className="rec-dot" />Stop recording</button>
            ) : (
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => broadcast.startRecording()}>Record locally</button>
            )}
            <Link className="btn btn-ghost btn-sm" href="/live" target="_blank">Open live page</Link>
          </div>
          {ingest === null && <div className="notice" style={{ marginTop: 14 }}><strong>Cloudflare Stream not connected.</strong> Preview works; Go Live turns on once the Stream keys are set.</div>}
          {broadcast.error && <p className="form-error" style={{ marginTop: 10 }}>{broadcast.error}</p>}
          {live && <p className="form-ok" style={{ marginTop: 10 }}>Live on your site and simulcasting to YouTube.</p>}
        </div>

        {/* ---- Show controls ---- */}
        <div>
          <div className="filters" style={{ marginBottom: 16 }}>
            {([["onair", "On air"], ["chat", "Chat"], ["guests", "Guests"], ["scene", "Scene"], ["intro", "Intro"], ["sounds", "Sounds"], ["sources", "Sources"]] as [Tab, string][]).map(([k, label]) => (
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
              <p className="form-note" style={{ marginTop: -8, marginBottom: 16 }}>Drag the banner on the program preview to place it anywhere.</p>
              <div className="panel-sub">Pin a message onto the broadcast, then drag it anywhere on the program preview.</div>
              <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                {chat.length === 0 && <p className="muted" style={{ fontSize: "13px" }}>Chat appears here during a broadcast.</p>}
                {chat.slice().reverse().map((m) => {
                  const pinned = isPinned(m);
                  return (
                    <div className="dest-row" key={m.id} style={{ padding: "9px 0" }}>
                      <div style={{ minWidth: 0 }}><div className="dest-name" style={{ color: "var(--amber)" }}>{m.name}</div><div className="dest-meta" style={{ whiteSpace: "normal" }}>{m.text}</div></div>
                      <button className={`btn btn-sm ${pinned ? "btn-primary" : "btn-ghost"}`} type="button" onClick={() => (pinned ? unpin() : pin(m))}>{pinned ? "Pinned" : "Pin"}</button>
                    </div>
                  );
                })}
              </div>
              {broadcast.pinned && (
                <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span className="dest-meta">Pinned: <strong style={{ color: "var(--amber)" }}>{broadcast.pinned.name}</strong> - drag it on the preview to reposition.</span>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={unpin}>Unpin</button>
                </div>
              )}
            </div>
          )}

          {tab === "chat" && (
            <div className="panel">
              <div className="mod-row" style={{ alignItems: "center", marginBottom: 4 }}>
                <h3 style={{ margin: 0 }}>Live chat</h3>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => { if (confirm("Clear the live chat for everyone?")) { broadcast.clearChat(); setModMsg("Chat cleared."); } }}>Clear chat</button>
              </div>
              <div className="panel-sub">Site + YouTube, merged. Timeout or remove a signed-in viewer from here.</div>
              <div className="dest-row" style={{ marginTop: 6 }}>
                <div><div className="dest-name">Reset chat when I go live</div><div className="dest-meta">Start each broadcast with a clean chat</div></div>
                <label className="toggle"><input type="checkbox" checked={broadcast.autoClearChat} onChange={(e) => broadcast.setAutoClearChat(e.target.checked)} /><span className="track" /></label>
              </div>
              {modMsg && <p className="form-ok" style={{ fontSize: "12.5px", marginBottom: 10 }}>{modMsg}</p>}
              <div style={{ maxHeight: 460, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
                {chat.length === 0 && <p className="muted" style={{ fontSize: "13px" }}>No messages yet.</p>}
                {chat.map((m) => (
                  <div className="mod-row" key={m.id}>
                    <div className={`msg${m.tip ? " tipmsg" : ""}`} style={{ minWidth: 0 }}>
                      {m.tip ? <><span className="tipamt">${m.tip.toFixed(2)}</span><b>{m.name}</b>{m.text ? <span> {m.text}</span> : null}</> : <><span className="src">Site</span><b>{m.name}</b> {m.text}</>}
                    </div>
                    {m.uid && (
                      <div className="mod-actions">
                        <button className="btn btn-ghost btn-xs" type="button" title="5 minute timeout" onClick={() => moderate("timeout", m, 300)}>Timeout</button>
                        <button className="btn btn-ghost btn-xs" type="button" title="Remove from chat" onClick={() => moderate("ban", m)}>Ban</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "guests" && (
            <div className="panel">
              <h3>Invite a guest</h3>
              <div className="panel-sub">Send this link - they join in the browser (video, audio, both, or neither), then you Admit them to the program.</div>
              <div className="copybox" style={{ marginBottom: 16 }}>
                <input type="text" readOnly value={broadcast.inviteUrl()} />
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => navigator.clipboard?.writeText(broadcast.inviteUrl())}>Copy</button>
              </div>
              <div className="mod-row" style={{ alignItems: "center", marginBottom: 4 }}>
                <div className="panel-sub" style={{ marginBottom: 0 }}>In the room</div>
                {(() => {
                  const audioGuests = broadcast.roster.filter((p) => p.sessionId && broadcast.admitted.has(p.sessionId) && p.hasAudio);
                  if (audioGuests.length === 0) return null;
                  const anyUnmuted = audioGuests.some((p) => !broadcast.mutedGuests.has(p.sessionId!));
                  return (
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => (anyUnmuted ? broadcast.muteAllGuests() : broadcast.unmuteAllGuests())}>
                      {anyUnmuted ? "Mute all" : "Unmute all"}
                    </button>
                  );
                })()}
              </div>
              <div className="dest-row"><div><div className="dest-name">South Coast Cane (you)</div><div className="dest-meta">host</div></div><span className="pill published">On</span></div>
              {broadcast.roster.length === 0 && <p className="muted" style={{ fontSize: "13px", marginTop: 10 }}>No guests yet. Share the link above.</p>}
              {broadcast.roster.map((p) => {
                const onStage = Boolean(p.sessionId && broadcast.admitted.has(p.sessionId));
                return (
                  <div className="dest-row" key={p.id}>
                    <div style={{ minWidth: 0 }}>
                      <div className="dest-name">{p.name}{onStage && <span className="pill published" style={{ marginLeft: 8 }}>On air</span>}{onStage && p.sessionId && broadcast.isGuestMuted(p.sessionId) && <span className="pill draft" style={{ marginLeft: 6 }}>Muted</span>}</div>
                      <div className="dest-meta">{p.hasVideo ? "video" : "no video"} · {p.hasAudio ? "audio" : "muted"}</div>
                    </div>
                    {onStage ? (
                      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                        {p.hasAudio && (
                          <button className="btn btn-ghost btn-sm" type="button" onClick={() => broadcast.toggleGuestMute(p.sessionId!)}>
                            {broadcast.isGuestMuted(p.sessionId!) ? "Unmute" : "Mute"}
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => broadcast.removeGuest(p.sessionId!)}>Remove</button>
                      </div>
                    ) : (
                      <button className="btn btn-primary btn-sm" type="button" disabled={!p.sessionId || !broadcast.realtimeReady} onClick={() => broadcast.admitGuest(p.sessionId!)}>Admit</button>
                    )}
                  </div>
                );
              })}
              {!broadcast.realtimeReady && (
                <p className="notice" style={{ marginTop: 14 }}><strong>Connecting to Cloudflare Realtime...</strong> Guests can join now; once the studio connection is up you can admit them to the program.</p>
              )}
            </div>
          )}

          {tab === "scene" && (
            <div className="panel">
              <h3>Branded scene</h3>
              <div className="panel-sub">Put the host over a background (green-screen), with a frame + logo - a TV-broadcast look. The Program preview updates live.</div>
              <input ref={sceneBgInput} type="file" accept="image/*" hidden onChange={(e) => pickSceneImg(e, "background")} />
              <input ref={sceneFrameInput} type="file" accept="image/*" hidden onChange={(e) => pickSceneImg(e, "frame")} />
              <input ref={sceneLogoInput} type="file" accept="image/*" hidden onChange={(e) => pickSceneImg(e, "logo")} />

              <div className="dest-row">
                <div><div className="dest-name">Enable scene</div><div className="dest-meta">Overrides the normal camera view</div></div>
                <label className="toggle"><input type="checkbox" checked={scene.enabled} onChange={(e) => updateScene({ enabled: e.target.checked })} /><span className="track" /></label>
              </div>

              <div className="form-field" style={{ marginTop: 12 }}>
                <label>Background removal</label>
                <select value={scene.mode} onChange={(e) => updateScene({ mode: e.target.value as SceneCfg["mode"] })}>
                  <option value="none">None (host fills the frame)</option>
                  <option value="ml">AI virtual background (no green screen)</option>
                  <option value="chroma">Green screen (chroma key)</option>
                </select>
              </div>

              {scene.mode === "ml" && (
                <p className="form-note" style={{ marginTop: -4, marginBottom: 8 }}>In-browser AI removes your background - no green screen. First time, give it a few seconds to load the model, then upload a background below.</p>
              )}
              {scene.mode === "chroma" && (
                <div className="form-field">
                  <label>Green-screen color</label>
                  <div className="color-row">
                    <input type="color" value={scene.chroma} onChange={(e) => updateScene({ chroma: e.target.value })} />
                    <input type="text" value={scene.chroma} onChange={(e) => updateScene({ chroma: e.target.value })} />
                  </div>
                </div>
              )}

              <div className="scene-uploads">
                <div className="scene-up">
                  <div className="scene-prev" style={scene.background ? { backgroundImage: `url(${scene.background})` } : undefined}>{!scene.background && "Background"}</div>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => sceneBgInput.current?.click()}>{scene.background ? "Change" : "Upload"}</button>
                </div>
                <div className="scene-up">
                  <div className="scene-prev" style={scene.frame ? { backgroundImage: `url(${scene.frame})` } : undefined}>{!scene.frame && "Frame"}</div>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => sceneFrameInput.current?.click()}>{scene.frame ? "Change" : "Upload"}</button>
                </div>
                <div className="scene-up">
                  <div className="scene-prev logo" style={scene.logo ? { backgroundImage: `url(${scene.logo})` } : undefined}>{!scene.logo && "Logo"}</div>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => sceneLogoInput.current?.click()}>{scene.logo ? "Change" : "Upload"}</button>
                </div>
              </div>

              <div className="dest-row" style={{ marginTop: 18 }}>
                <div><div className="dest-name">Rotating ticker</div><div className="dest-meta">News-style scroll along the bottom (works in any mode)</div></div>
                <label className="toggle"><input type="checkbox" checked={scene.tickerOn} onChange={(e) => updateScene({ tickerOn: e.target.checked })} /><span className="track" /></label>
              </div>
              {scene.tickerOn && (
                <>
                  <div className="form-field">
                    <label>Label (optional)</label>
                    <input type="text" value={scene.tickerLabel} maxLength={40} placeholder="e.g. CWTV" onChange={(e) => updateScene({ tickerLabel: e.target.value })} />
                  </div>
                  <div className="form-field">
                    <label>Messages (one per line)</label>
                    <textarea rows={3} value={scene.ticker} maxLength={2000} placeholder={"Welcome to the show\nFollow us @southcoastcane\nNew episode every week"} onChange={(e) => updateScene({ ticker: e.target.value })} />
                  </div>
                </>
              )}

              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 16 }}>
                <button className="btn btn-primary btn-sm" type="button" onClick={saveScene}>Save scene</button>
                {sceneMsg && <span className="form-ok" style={{ margin: 0 }}>{sceneMsg}</span>}
              </div>
              <p className="form-note" style={{ marginTop: 12 }}>Frame should be a transparent 16:9 PNG. For green-screen, light the screen evenly and pick the exact green.</p>
            </div>
          )}

          {tab === "intro" && (
            <div className="panel">
              <h3>Intro / starting-soon screen</h3>
              <div className="panel-sub">A branded holding screen that goes out on the broadcast before your show starts, so early viewers see something professional instead of a cold open. The Program preview updates live.</div>
              <input ref={bumperBgInput} type="file" accept="image/*" hidden onChange={pickBumperBg} />

              <div className="dest-row">
                <div><div className="dest-name">Show the starting-soon screen on air</div><div className="dest-meta">The program feed shows the bumper instead of the camera</div></div>
                <label className="toggle"><input type="checkbox" checked={bumper.enabled} onChange={(e) => updateBumper({ enabled: e.target.checked })} /><span className="track" /></label>
              </div>

              <div className="form-field" style={{ marginTop: 12 }}>
                <label>Mode</label>
                <select value={bumper.mode} onChange={(e) => updateBumper({ mode: e.target.value as BumperCfg["mode"] })}>
                  <option value="card">Starting-soon card</option>
                  <option value="video">Intro video</option>
                </select>
              </div>

              <div className="form-field"><label>Headline</label><input type="text" value={bumper.headline} maxLength={80} placeholder="Starting soon" onChange={(e) => updateBumper({ headline: e.target.value })} /></div>
              <div className="form-field"><label>Subtext (optional)</label><input type="text" value={bumper.subtext} maxLength={160} placeholder="The show begins shortly - stay tuned." onChange={(e) => updateBumper({ subtext: e.target.value })} /></div>

              {bumper.mode === "card" && (
                <div className="scene-uploads">
                  <div className="scene-up">
                    <div className="scene-prev" style={bumper.background ? { backgroundImage: `url(${bumper.background})` } : undefined}>{!bumper.background && "Background"}</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => bumperBgInput.current?.click()}>{bumper.background ? "Change" : "Upload"}</button>
                      {bumper.background && <button className="btn btn-ghost btn-sm" type="button" onClick={() => updateBumper({ background: "" })}>Clear</button>}
                    </div>
                  </div>
                </div>
              )}

              {bumper.mode === "video" && (
                <div className="form-field">
                  <label>Intro video URL</label>
                  <input type="text" value={bumper.videoUrl} maxLength={500} placeholder="https://..." onChange={(e) => updateBumper({ videoUrl: e.target.value })} />
                  <p className="form-note" style={{ marginTop: 6 }}>Paste a CORS-enabled MP4 URL (e.g. a Cloudflare Stream download link). Other URLs may not play in the broadcast. The card look shows while the video buffers.</p>
                </div>
              )}

              <div className="dest-row" style={{ marginTop: 18 }}>
                <div><div className="dest-name">Count down to the next scheduled show</div><div className="dest-meta">Shows a live "Starting in..." timer{bumper.startsAt > 0 ? " (set)" : ""}</div></div>
                <label className="toggle"><input type="checkbox" checked={bumper.startsAt > 0} onChange={(e) => toggleCountdown(e.target.checked)} /><span className="track" /></label>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 16 }}>
                <button className="btn btn-primary btn-sm" type="button" onClick={saveBumper}>Save intro</button>
                {bumperMsg && <span className="form-ok" style={{ margin: 0 }}>{bumperMsg}</span>}
              </div>
              <p className="form-note" style={{ marginTop: 12 }}>Turn this on before you go live, then turn it off to reveal the show. The card mode is always safe; the video mode needs a CORS-enabled URL.</p>
            </div>
          )}

          {tab === "sounds" && (
            <div className="panel">
              <h3>Soundboard</h3>
              <div className="panel-sub">Tap a pad to fire a sound effect. It goes out on the broadcast (viewers hear it) and in your monitor.</div>
              <input ref={soundInput} type="file" accept="audio/*" hidden onChange={pickSound} />

              {sounds.length === 0 ? (
                <p className="muted" style={{ fontSize: "13px" }}>No pads yet. Add a sound below.</p>
              ) : (
                <div className="sound-grid">
                  {sounds.map((p) => (
                    <div className={`sound-pad${pressed === p.id ? " pressed" : ""}`} key={p.id} role="button" tabIndex={0}
                      onClick={() => tapPad(p.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tapPad(p.id); } }}>
                      <button className="sound-x" type="button" title="Remove pad" onClick={(e) => { e.stopPropagation(); removeSound(p.id); }}>×</button>
                      <span className="sound-label">{p.label}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => broadcast.stopSounds()}>Stop all</button>
              </div>

              <div className="panel-sub" style={{ marginTop: 22 }}>Add a sound</div>
              <div className="form-field"><label>Label</label><input type="text" value={soundLabel} maxLength={30} placeholder="Airhorn" onChange={(e) => setSoundLabel(e.target.value)} /></div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn btn-primary btn-sm" type="button" onClick={() => soundInput.current?.click()}>Choose audio file</button>
                {soundMsg && <span className="form-ok" style={{ margin: 0 }}>{soundMsg}</span>}
              </div>
              <p className="form-note" style={{ marginTop: 12 }}>Short clips only (under ~240KB) so they load instantly and stay under the storage limit. Up to 12 pads.</p>
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
