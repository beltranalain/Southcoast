// Persistent browser STUDIO ENGINE (singleton, lives outside React so the
// broadcast survives navigation). It composites host camera + guests + on-air
// graphics onto one canvas, mixes audio, and publishes that program feed to
// Cloudflare Stream over WHIP - no OBS. Guests arrive over Cloudflare Realtime.

import { getIdToken } from "./firebase";
import { RealtimeSession, whipPublish } from "./realtimeClient";

const WS_BASE = process.env.NEXT_PUBLIC_CHAT_WS_URL || "";
const ROOM = "main";
const SIGNAL_ROOM = `rt-${ROOM}`;
const W = 1280, H = 720;

type Ingest = { whipUrl: string; rtmpsUrl: string; streamKey: string } | null;
export type Participant = { id: string; name: string; role: string; sessionId?: string; hasVideo: boolean; hasAudio: boolean };
type Banner = { title: string; subtitle: string } | null;
type Pinned = { name: string; text: string } | null;
export type Layout = "grid" | "spotlight";

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawCover(ctx: CanvasRenderingContext2D, v: HTMLVideoElement, x: number, y: number, w: number, h: number) {
  if (!v.videoWidth) { ctx.fillStyle = "#151110"; ctx.fillRect(x, y, w, h); return; }
  const vr = v.videoWidth / v.videoHeight, dr = w / h;
  let sw = v.videoWidth, sh = v.videoHeight, sx = 0, sy = 0;
  if (vr > dr) { sw = v.videoHeight * dr; sx = (v.videoWidth - sw) / 2; }
  else { sh = v.videoWidth / dr; sy = (v.videoHeight - sh) / 2; }
  ctx.drawImage(v, sx, sy, sw, sh, x, y, w, h);
}

const PIN_W = 560, PIN_H = 92;

class StudioEngine {
  live = false; connecting = false; error = ""; ingest: Ingest = null;
  layout: Layout = "grid";
  banner: Banner = null; pinned: Pinned = null;
  // Position (top-left, in canvas px) of the pinned comment - draggable.
  pinPos = { x: 48, y: H - 210 };
  readonly width = W; readonly height = H;
  roster: Participant[] = [];
  admitted = new Set<string>(); // guest sessionIds currently on the program
  realtimeReady = false; // true once the SFU session is established

  canvas: HTMLCanvasElement | null = null;
  private hostVideo: HTMLVideoElement | null = null;
  private hostStream: MediaStream | null = null;
  private guestVideos = new Map<string, HTMLVideoElement>();
  private guestAudio = new Map<string, MediaStreamAudioSourceNode>();
  private camId?: string; private micId?: string;

  private pc: RTCPeerConnection | null = null;
  private rtc: RealtimeSession | null = null;
  private ws: WebSocket | null = null;
  private subscribedGuests = new Set<string>();

  private audioCtx: AudioContext | null = null;
  private audioDest: MediaStreamAudioDestinationNode | null = null;
  private hostAudioSrc: MediaStreamAudioSourceNode | null = null;
  private raf = 0;
  private started = false;
  private subs = new Set<() => void>();

  subscribe(fn: () => void) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  private emit() { this.subs.forEach((f) => f()); }

  async init() {
    if (this.started) return;
    this.started = true;
    this.canvas = document.createElement("canvas");
    this.canvas.width = W; this.canvas.height = H;
    this.hostVideo = document.createElement("video");
    this.hostVideo.muted = true; (this.hostVideo as any).playsInline = true;
    this.audioCtx = new AudioContext();
    this.audioDest = this.audioCtx.createMediaStreamDestination();
    await this.ensureCamera();
    this.startCompositing();
    this.fetchIngest();
    this.connectStudio();
  }

  async ensureCamera(camId?: string, micId?: string) {
    if (camId) this.camId = camId; if (micId) this.micId = micId;
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        video: this.camId ? { deviceId: { exact: this.camId } } : true,
        audio: this.micId ? { deviceId: { exact: this.micId } } : true,
      });
      if (this.pc && this.live) {
        const senders = this.pc.getSenders();
        next.getAudioTracks().forEach((track) => { const s = senders.find((x) => x.track?.kind === "audio"); if (s) s.replaceTrack(track); });
      }
      this.hostStream?.getTracks().forEach((t) => t.stop());
      this.hostStream = next;
      if (this.hostVideo) { this.hostVideo.srcObject = next; this.hostVideo.play().catch(() => {}); }
      // (re)wire host audio into the mix
      if (this.audioCtx && this.audioDest) {
        try { this.hostAudioSrc?.disconnect(); } catch {}
        if (next.getAudioTracks().length) { this.hostAudioSrc = this.audioCtx.createMediaStreamSource(next); this.hostAudioSrc.connect(this.audioDest); }
      }
      // republish host video to guests if in realtime
      this.error = "";
      this.emit();
      return next;
    } catch { this.error = "Camera/microphone access is required."; this.emit(); return null; }
  }

  private startCompositing() {
    const canvas = this.canvas!; const ctx = canvas.getContext("2d")!;
    const draw = () => {
      ctx.fillStyle = "#0A0908"; ctx.fillRect(0, 0, W, H);
      const sources = [this.hostVideo, ...Array.from(this.guestVideos.values())].filter(Boolean) as HTMLVideoElement[];
      const n = sources.length || 1;
      const gap = 8;
      if (this.layout === "spotlight" && n > 1) {
        const strip = 300;
        drawCover(ctx, sources[0], 0, 0, W - strip - gap, H);
        const ch = (H - gap * (n - 2)) / (n - 1);
        sources.slice(1).forEach((v, i) => drawCover(ctx, v, W - strip, i * (ch + gap), strip, ch));
      } else {
        const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
        const cw = (W - gap * (cols - 1)) / cols, chh = (H - gap * (rows - 1)) / rows;
        sources.forEach((v, i) => { const c = i % cols, r = Math.floor(i / cols); drawCover(ctx, v, c * (cw + gap), r * (chh + gap), cw, chh); });
      }
      this.drawGraphics(ctx);
      this.raf = requestAnimationFrame(draw);
    };
    draw();
  }

  private drawGraphics(ctx: CanvasRenderingContext2D) {
    ctx.textBaseline = "middle";
    if (this.pinned) {
      const { x, y } = this.pinPos, w = PIN_W, h = PIN_H;
      // Pill-shaped lower-third (rounded capsule) with an amber outline.
      roundRectPath(ctx, x, y, w, h, h / 2);
      ctx.fillStyle = "rgba(10,9,8,.9)"; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = "#F5A524"; ctx.stroke();
      ctx.fillStyle = "#F5A524"; ctx.font = "700 20px Inter, sans-serif"; ctx.fillText(this.pinned.name.toUpperCase(), x + 34, y + 30);
      ctx.fillStyle = "#F3EFE7"; ctx.font = "400 22px Inter, sans-serif";
      ctx.fillText(this.pinned.text.slice(0, 46), x + 34, y + 62);
    }
    if (this.banner) {
      const y = H - 96, ph = 56;
      ctx.font = "400 34px Anton, sans-serif";
      const tw = ctx.measureText(this.banner.title.toUpperCase()).width + 44;
      ctx.fillStyle = "#F5A524"; ctx.fillRect(48, y, tw, ph);
      ctx.fillStyle = "#151107"; ctx.fillText(this.banner.title.toUpperCase(), 70, y + ph / 2 + 2);
      if (this.banner.subtitle) {
        ctx.font = "500 18px Inter, sans-serif";
        const sw = ctx.measureText(this.banner.subtitle).width + 40;
        ctx.fillStyle = "rgba(10,9,8,.9)"; ctx.fillRect(48 + tw, y, sw, ph);
        ctx.fillStyle = "#F3EFE7"; ctx.fillText(this.banner.subtitle, 68 + tw, y + ph / 2 + 1);
      }
    }
  }

  setBanner(title: string, subtitle: string) { this.banner = title.trim() ? { title, subtitle } : null; this.emit(); }
  hideBanner() { this.banner = null; this.emit(); }
  setPinned(name: string, text: string) { this.pinned = { name, text }; this.emit(); }
  clearPinned() { this.pinned = null; this.emit(); }
  clearGraphics() { this.banner = null; this.pinned = null; this.emit(); }
  setLayout(l: Layout) { this.layout = l; this.emit(); }

  // ---- Draggable pinned comment (canvas-space px) ----
  pinBox() { return { x: this.pinPos.x, y: this.pinPos.y, w: PIN_W, h: PIN_H }; }
  hitPin(cx: number, cy: number) {
    if (!this.pinned) return false;
    const b = this.pinBox();
    return cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h;
  }
  setPinPos(x: number, y: number) {
    this.pinPos = {
      x: Math.max(0, Math.min(W - PIN_W, x)),
      y: Math.max(0, Math.min(H - PIN_H, y)),
    };
    this.emit();
  }

  async fetchIngest(): Promise<Ingest> {
    try {
      const token = await getIdToken();
      const res = await fetch("/api/stream/ingest", { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
      const d = await res.json();
      this.ingest = d.configured && d.ingest?.whipUrl ? { whipUrl: d.ingest.whipUrl, rtmpsUrl: d.ingest.rtmpsUrl, streamKey: d.ingest.streamKey } : null;
    } catch { this.ingest = null; }
    this.emit(); return this.ingest;
  }

  private async connectStudio() {
    // Realtime: publish host, prepare to pull guests (no-op if not configured).
    try {
      const session = new RealtimeSession((sid, track) => this.onGuestTrack(sid, track));
      this.rtc = session;
      if (this.hostStream) await session.publish(this.hostStream); // creates the SFU session
      this.realtimeReady = Boolean(session.sessionId);
    } catch { this.rtc = null; this.realtimeReady = false; }
    this.emit();

    // Signaling: announce host, receive roster, subscribe to guests.
    if (!WS_BASE) return;
    const sock = new WebSocket(`${WS_BASE}/room/${SIGNAL_ROOM}/ws`);
    this.ws = sock;
    const me: Participant = { id: "host", name: "South Coast Cane", role: "host", sessionId: this.rtc?.sessionId, hasVideo: true, hasAudio: true };
    sock.onopen = () => sock.send(JSON.stringify({ type: "studio", action: "join", participant: me }));
    sock.onmessage = (e) => {
      let d: any; try { d = JSON.parse(e.data); } catch { return; }
      if (d.type === "studio" && d.action === "roster") {
        this.roster = d.participants.filter((p: Participant) => p.role === "guest");
        // Guests wait in the green room until the host admits them - no auto-pull.
        // Clean up anyone who was on the program but has since left the room.
        const present = new Set(this.roster.map((g) => g.sessionId).filter(Boolean) as string[]);
        Array.from(this.admitted).forEach((sid) => { if (!present.has(sid)) this.removeGuest(sid); });
        this.emit();
      }
    };
  }

  private onGuestTrack(sid: string, track: MediaStreamTrack) {
    if (track.kind === "video") {
      let v = this.guestVideos.get(sid);
      if (!v) { v = document.createElement("video"); v.muted = true; v.autoplay = true; (v as any).playsInline = true; this.guestVideos.set(sid, v); }
      const ms = (v.srcObject as MediaStream) || new MediaStream();
      ms.addTrack(track); v.srcObject = ms; v.play().catch(() => {});
      this.emit();
    } else if (track.kind === "audio" && this.audioCtx && this.audioDest) {
      try {
        const src = this.audioCtx.createMediaStreamSource(new MediaStream([track]));
        src.connect(this.audioDest);
        this.guestAudio.set(sid, src);
      } catch {}
    }
  }

  // ---- Green room: host admits/removes guests to/from the program ----
  admitGuest(sessionId: string) {
    if (!sessionId || !this.rtc || this.admitted.has(sessionId)) return;
    const g = this.roster.find((p) => p.sessionId === sessionId);
    if (!g) return;
    this.admitted.add(sessionId);
    this.subscribedGuests.add(sessionId);
    if (g.hasVideo) this.rtc.pull(sessionId, "video").catch(() => {});
    if (g.hasAudio) this.rtc.pull(sessionId, "audio").catch(() => {});
    this.emit();
  }

  removeGuest(sessionId: string) {
    this.admitted.delete(sessionId);
    this.subscribedGuests.delete(sessionId);
    const v = this.guestVideos.get(sessionId);
    if (v) { try { (v.srcObject as MediaStream)?.getTracks().forEach((t) => t.stop()); } catch {} v.srcObject = null; this.guestVideos.delete(sessionId); }
    const a = this.guestAudio.get(sessionId);
    if (a) { try { a.disconnect(); } catch {} this.guestAudio.delete(sessionId); }
    this.emit();
  }

  inviteUrl() { return typeof window !== "undefined" ? window.location.origin + "/join/" + ROOM : ""; }

  async goLive() {
    if (this.live || this.connecting) return;
    this.connecting = true; this.error = ""; this.emit();
    try {
      const ingest = this.ingest || (await this.fetchIngest());
      if (!ingest?.whipUrl) throw new Error("Cloudflare Stream is not connected.");
      const canvasStream = this.canvas!.captureStream(30);
      const out = new MediaStream(canvasStream.getVideoTracks());
      this.audioDest!.stream.getAudioTracks().forEach((t) => out.addTrack(t));
      this.pc = await whipPublish(ingest.whipUrl, out);
      this.pc.onconnectionstatechange = () => {
        if (this.pc && (this.pc.connectionState === "failed" || this.pc.connectionState === "disconnected")) { this.live = false; this.emit(); }
      };
      this.live = true;
    } catch (e: any) { this.error = e.message || "Could not go live."; this.pc?.close(); this.pc = null; }
    finally { this.connecting = false; this.emit(); }
  }

  stop() { this.pc?.close(); this.pc = null; this.live = false; this.emit(); }
}

declare global {
  // eslint-disable-next-line no-var
  var __sccBroadcast: StudioEngine | undefined;
}
export const broadcast: StudioEngine =
  typeof window !== "undefined" ? (globalThis.__sccBroadcast ??= new StudioEngine()) : new StudioEngine();
