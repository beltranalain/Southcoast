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

// Fit the whole source inside the box (letterboxed) - for screen shares so no
// content is cropped, since shared screens/tabs come in many aspect ratios.
function drawContain(ctx: CanvasRenderingContext2D, v: HTMLVideoElement, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "#000"; ctx.fillRect(x, y, w, h);
  if (!v.videoWidth) return;
  const vr = v.videoWidth / v.videoHeight, dr = w / h;
  let dw = w, dh = h;
  if (vr > dr) dh = w / vr; else dw = h * vr;
  ctx.drawImage(v, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

// Rounded-corner variants (match the site's rounded UI). r is corner radius px.
const TILE_R = 18;
function drawCoverRounded(ctx: CanvasRenderingContext2D, v: HTMLVideoElement, x: number, y: number, w: number, h: number, r = TILE_R) {
  ctx.save(); roundRectPath(ctx, x, y, w, h, r); ctx.clip(); drawCover(ctx, v, x, y, w, h); ctx.restore();
}
function drawContainRounded(ctx: CanvasRenderingContext2D, v: HTMLVideoElement, x: number, y: number, w: number, h: number, r = TILE_R) {
  ctx.save(); roundRectPath(ctx, x, y, w, h, r); ctx.clip(); drawContain(ctx, v, x, y, w, h); ctx.restore();
}

// Cover-draw any source (image or video) into a box, cropping to fill.
function coverDraw(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, x: number, y: number, w: number, h: number) {
  if (!sw || !sh) return;
  const vr = sw / sh, dr = w / h;
  let cw = sw, ch = sh, sx = 0, sy = 0;
  if (vr > dr) { cw = sh * dr; sx = (sw - cw) / 2; } else { ch = sw / dr; sy = (sh - ch) / 2; }
  ctx.drawImage(src, sx, sy, cw, ch, x, y, w, h);
}

function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 177, 64];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const PIN_W = 560, PIN_H = 92;

class StudioEngine {
  live = false; connecting = false; error = ""; ingest: Ingest = null;
  layout: Layout = "grid";
  screenSharing = false;
  screenLayout: "full" | "pip" | "split" = "pip";
  recording = false; // local (browser) recording of the program
  autoClearChat = true; // reset the live chat automatically on Go Live (host pref)
  cameraOn = true; // host camera live (off actually releases the device - light off)
  micOn = true; // host microphone live
  // Branded scene (background behind host + optional green-screen + frame/logo)
  sceneEnabled = false;
  sceneMode: "none" | "chroma" | "ml" = "chroma";
  chromaColor = "#00b140";
  // Rotating lower-third ticker (news-style scroll along the bottom)
  tickerOn = false;
  tickerLabel = "";
  private tickerText = "";
  private tickerX = 0;
  private tickerLast = 0;
  // Intro / "starting soon" bumper: a branded holding screen (or looping intro
  // video) that goes OUT on the broadcast before the live content starts.
  bumperEnabled = false;
  bumperMode: "card" | "video" = "card";
  private bumperHeadline = "Starting soon";
  private bumperSubtext = "";
  private bumperBg: HTMLImageElement | null = null;
  private bumperVideoUrl = "";
  private bumperStartsAt = 0; // epoch ms; 0 = no countdown
  private bumperVideo: HTMLVideoElement | null = null;
  private bumperAudioSrc: MediaElementAudioSourceNode | null = null;
  // Neutral display name for the host tile (kept generic, not client-specific).
  hostName = "Host";
  banner: Banner = null; pinned: Pinned = null;
  tipAlert: { name: string; amount: number; message: string } | null = null;
  private tipTimer: ReturnType<typeof setTimeout> | null = null;
  // Positions (top-left, canvas px) of the draggable on-air graphics.
  pinPos = { x: 48, y: H - 210 };
  bannerPos = { x: 48, y: H - 96 };
  private bannerRect = { x: 48, y: H - 96, w: 0, h: 56 };
  pipPos = { x: W - 320 - 22, y: H - 180 - 22 };
  private pipRect = { x: W - 320 - 22, y: H - 180 - 22, w: 320, h: 180 };
  readonly width = W; readonly height = H;
  roster: Participant[] = [];
  admitted = new Set<string>(); // guest sessionIds currently on the program
  realtimeReady = false; // true once the SFU session is established

  canvas: HTMLCanvasElement | null = null;
  private hostVideo: HTMLVideoElement | null = null;
  private hostStream: MediaStream | null = null;
  private guestVideos = new Map<string, HTMLVideoElement>();
  private guestAudio = new Map<string, MediaStreamAudioSourceNode>();
  // Per-guest gain node (host mute control) + the set of muted guests.
  private guestGain = new Map<string, GainNode>();
  mutedGuests = new Set<string>();
  // Active-speaker detection: one AnalyserNode per source (key "host" or sessionId),
  // tapped off the existing audio graph without disturbing the mix routing.
  private analysers = new Map<string, AnalyserNode>();
  private audioBuf: Uint8Array | null = null;   // reused time-domain scratch buffer
  private levels = new Map<string, number>();    // smoothed short-term level per key
  private activeKey: string | null = null;       // current active-speaker tile key
  private lastLevelAt = 0;                        // throttle for level sampling
  private screenStream: MediaStream | null = null;
  private screenVideo: HTMLVideoElement | null = null;
  private screenAudioSrc: MediaStreamAudioSourceNode | null = null;
  private camId?: string; private micId?: string;

  private pc: RTCPeerConnection | null = null;
  private rtc: RealtimeSession | null = null;
  private ws: WebSocket | null = null;
  private subscribedGuests = new Set<string>();

  private recorder: MediaRecorder | null = null;
  private recChunks: Blob[] = [];
  private sceneBg: HTMLImageElement | null = null;
  private sceneFrame: HTMLImageElement | null = null;
  private sceneLogo: HTMLImageElement | null = null;
  private brandLogo: HTMLImageElement | null = null; // shown on the "Camera off" card
  private keyCanvas: HTMLCanvasElement | null = null;
  private segmenter: any = null;
  private segReady = false;
  private segLoading = false;
  private inputCanvas: HTMLCanvasElement | null = null;
  private maskCanvas: HTMLCanvasElement | null = null;
  private audioCtx: AudioContext | null = null;
  private audioDest: MediaStreamAudioDestinationNode | null = null;
  private hostAudioSrc: MediaStreamAudioSourceNode | null = null;
  // Soundboard: decoded effect buffers (by pad id) + currently-playing sources.
  private soundBuffers = new Map<string, AudioBuffer>();
  private soundSources = new Set<AudioBufferSourceNode>();
  private raf = 0;
  private started = false;
  private subs = new Set<() => void>();
  private ctx2d: CanvasRenderingContext2D | null = null;
  private lastDraw = 0;
  private clock: ScriptProcessorNode | null = null;

  subscribe(fn: () => void) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  private emit() { this.subs.forEach((f) => f()); }

  async init() {
    if (this.started) return;
    this.started = true;
    try { this.autoClearChat = localStorage.getItem("cwac-autoclear-chat") !== "0"; } catch {}
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
        try { this.analysers.get("host")?.disconnect(); } catch {}
        this.analysers.delete("host");
        if (next.getAudioTracks().length) {
          this.hostAudioSrc = this.audioCtx.createMediaStreamSource(next);
          this.hostAudioSrc.connect(this.audioDest);
          this.attachAnalyser("host", this.hostAudioSrc);
        }
      }
      // republish host video to guests if in realtime
      this.error = "";
      this.emit();
      return next;
    } catch { this.error = "Camera/microphone access is required."; this.emit(); return null; }
  }

  // Turn the host camera off (stops the device so the light goes off) or back
  // on. The program shows a "Camera off" placeholder while off.
  async setCameraOn(on: boolean) {
    if (on === this.cameraOn) return;
    this.cameraOn = on; this.emit();
    if (!on) {
      this.hostStream?.getVideoTracks().forEach((t) => { t.stop(); this.hostStream?.removeTrack(t); });
      if (this.hostVideo) this.hostVideo.srcObject = this.hostStream;
      return;
    }
    try {
      const cam = await navigator.mediaDevices.getUserMedia({ video: this.camId ? { deviceId: { exact: this.camId } } : true });
      const track = cam.getVideoTracks()[0];
      if (track && this.hostStream) {
        this.hostStream.addTrack(track);
        if (this.hostVideo) { this.hostVideo.srcObject = this.hostStream; this.hostVideo.play().catch(() => {}); }
      }
      this.error = ""; this.emit();
    } catch { this.error = "Camera access is required."; this.cameraOn = false; this.emit(); }
  }

  // Turn the host microphone off (stops the device) or back on. Off = silence
  // in the program + monitor.
  async setMicOn(on: boolean) {
    if (on === this.micOn) return;
    this.micOn = on; this.emit();
    if (!on) {
      try { this.hostAudioSrc?.disconnect(); } catch {}
      this.hostStream?.getAudioTracks().forEach((t) => { t.stop(); this.hostStream?.removeTrack(t); });
      return;
    }
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: this.micId ? { deviceId: { exact: this.micId } } : true });
      const track = mic.getAudioTracks()[0];
      if (track && this.hostStream) {
        this.hostStream.addTrack(track);
        if (this.audioCtx && this.audioDest) {
          try { this.hostAudioSrc?.disconnect(); } catch {}
          try { this.analysers.get("host")?.disconnect(); } catch {}
          this.analysers.delete("host");
          this.hostAudioSrc = this.audioCtx.createMediaStreamSource(new MediaStream([track]));
          this.hostAudioSrc.connect(this.audioDest);
          this.attachAnalyser("host", this.hostAudioSrc);
        }
      }
      this.error = ""; this.emit();
    } catch { this.error = "Microphone access is required."; this.micOn = false; this.emit(); }
  }

  // The brand logo to show on the "Camera off" card (from branding config).
  setBrandLogo(url: string) { this.brandLogo = url ? this.loadImg(url) : null; }

  private startCompositing() {
    this.ctx2d = this.canvas!.getContext("2d");
    const loop = () => { this.renderFrame(); this.raf = requestAnimationFrame(loop); };
    loop();
    this.startBackgroundClock();
  }

  // Draw one composited frame. Called by both requestAnimationFrame (smooth
  // while the tab is focused) and an audio-clock (keeps firing when the tab is
  // backgrounded). The timestamp gate caps to ~30fps and de-dupes the two.
  private renderFrame() {
    const ctx = this.ctx2d; if (!ctx) return;
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    if (now - this.lastDraw < 1000 / 30) return;
    this.lastDraw = now;

    // Intro/"starting soon" bumper replaces the whole program visually when on.
    if (this.bumperEnabled) { this.drawBumper(ctx); return; }

    // Branded scene takes over the frame when enabled (host over a background).
    if (this.sceneEnabled) { this.drawScene(ctx); this.drawGraphics(ctx); return; }

    // Refresh audio levels / active-speaker (throttled internally to ~7x/sec).
    this.updateLevels();

    ctx.fillStyle = "#0A0908"; ctx.fillRect(0, 0, W, H);
    // Each tile carries its video, display name, and a stable key ("host" or the
    // guest sessionId) used for name labels and active-speaker highlighting.
    const tiles: { video: HTMLVideoElement; name: string; key: string }[] = [];
    if (this.hostVideo) tiles.push({ video: this.hostVideo, name: this.hostName, key: "host" });
    this.guestVideos.forEach((v, sid) => tiles.push({ video: v, name: this.guestName(sid), key: sid }));

    if (this.screenSharing && this.screenVideo && this.screenVideo.videoWidth) {
      this.drawScreenLayout(ctx, tiles);
    } else {
      const n = tiles.length || 1;
      const gap = 10;
      if (this.layout === "spotlight" && tiles.length > 1) {
        const strip = 300;
        const bigW = W - strip - gap;
        this.paintTile(ctx, tiles[0], 0, 0, bigW, H, false);
        this.drawTileLabel(ctx, tiles[0].name, tiles[0].key, 0, 0, bigW, H);
        const ch = (H - gap * (n - 2)) / (n - 1);
        tiles.slice(1).forEach((t, i) => {
          const ty = i * (ch + gap);
          this.paintTile(ctx, t, W - strip, ty, strip, ch, true);
          this.drawTileLabel(ctx, t.name, t.key, W - strip, ty, strip, ch);
        });
      } else if (tiles.length === 1) {
        this.paintTile(ctx, tiles[0], 0, 0, W, H, false); // single camera fills the frame
        this.drawTileLabel(ctx, tiles[0].name, tiles[0].key, 0, 0, W, H, 0);
      } else if (n === 1) {
        // No tiles yet (host video not ready) - keep the empty backdrop.
      } else {
        const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
        const cw = (W - gap * (cols - 1)) / cols, chh = (H - gap * (rows - 1)) / rows;
        tiles.forEach((t, i) => {
          const c = i % cols, r = Math.floor(i / cols);
          const tx = c * (cw + gap), ty = r * (chh + gap);
          this.paintTile(ctx, t, tx, ty, cw, chh, true);
          this.drawTileLabel(ctx, t.name, t.key, tx, ty, cw, chh);
        });
      }
    }
    this.drawGraphics(ctx);
  }

  // Draw a tile's video - or a "Camera off" placeholder for the host tile when
  // the camera is turned off - into the given box.
  private paintTile(ctx: CanvasRenderingContext2D, t: { video: HTMLVideoElement; key: string }, x: number, y: number, w: number, h: number, rounded: boolean) {
    if (t.key === "host" && !this.cameraOn) {
      ctx.save();
      if (rounded) { roundRectPath(ctx, x, y, w, h, TILE_R); ctx.clip(); }
      // Dark radial backdrop.
      const cx = x + w / 2;
      const g = ctx.createRadialGradient(cx, y + h * 0.42, 10, cx, y + h * 0.42, Math.max(w, h) * 0.6);
      g.addColorStop(0, "#1B1613"); g.addColorStop(1, "#0B0A09");
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);

      // Breathing pulse (drives the logo opacity + a soft ring).
      const now = typeof performance !== "undefined" ? performance.now() : 0;
      const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(now / 850));
      const unit = Math.min(w, h);
      const logo = this.brandLogo;
      const fs = Math.max(13, Math.round(unit * 0.055));
      let midY = y + h / 2;

      if (logo?.complete && logo.naturalWidth) {
        const aspect = logo.naturalHeight / logo.naturalWidth || 1;
        const baseLw = Math.min(unit * 0.30, 220);
        const baseLh = baseLw * aspect;
        const centerY = y + h / 2 - baseLh * 0.4;
        const scale = 1 + 0.05 * Math.sin(now / 700); // gentle breathing scale
        const lw = baseLw * scale, lh = baseLh * scale;
        // soft pulsing halo behind the logo
        ctx.save();
        const halo = ctx.createRadialGradient(cx, centerY, 4, cx, centerY, baseLw * 0.95);
        halo.addColorStop(0, `rgba(245,165,36,${0.18 * pulse})`);
        halo.addColorStop(1, "rgba(245,165,36,0)");
        ctx.fillStyle = halo; ctx.fillRect(cx - baseLw, centerY - baseLw, baseLw * 2, baseLw * 2);
        ctx.restore();
        // rounded logo (matches the platform's rounded tiles)
        ctx.save();
        roundRectPath(ctx, cx - lw / 2, centerY - lh / 2, lw, lh, Math.min(lw, lh) * 0.18);
        ctx.clip();
        ctx.globalAlpha = 0.75 + 0.25 * pulse;
        ctx.drawImage(logo, cx - lw / 2, centerY - lh / 2, lw, lh);
        ctx.restore();
        ctx.globalAlpha = 1;
        midY = centerY + baseLh * 0.6 + fs;
      } else {
        // No logo set: a pulsing amber ring as the mark.
        const r = unit * 0.09;
        midY = y + h / 2 - r * 0.4;
        ctx.beginPath(); ctx.arc(cx, midY, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(245,165,36,${0.5 + 0.5 * pulse})`;
        ctx.lineWidth = Math.max(2, unit * 0.012); ctx.stroke();
        midY = midY + r + fs * 1.4;
      }

      ctx.fillStyle = "#F3EFE7";
      ctx.font = `700 ${fs}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("Camera off", cx, midY);
      ctx.restore();
      return;
    }
    if (rounded) drawCoverRounded(ctx, t.video, x, y, w, h);
    else drawCover(ctx, t.video, x, y, w, h);
  }

  // A silent ScriptProcessorNode fires on the audio thread, which browsers do
  // NOT throttle when the tab is hidden - so the canvas keeps compositing (and
  // captureStream keeps producing frames) even after switching windows/tabs.
  private startBackgroundClock() {
    if (!this.audioCtx || this.clock) return;
    try {
      const sp = this.audioCtx.createScriptProcessor(1024, 1, 1);
      sp.onaudioprocess = () => this.renderFrame();
      const mute = this.audioCtx.createGain(); mute.gain.value = 0;
      sp.connect(mute); mute.connect(this.audioCtx.destination);
      this.clock = sp;
    } catch { /* ScriptProcessor unsupported - rAF still covers the visible case */ }
  }

  // ---- Active-speaker detection ----
  // Tap a small AnalyserNode off an existing source node. The source stays
  // connected to audioDest (the mix) untouched; the analyser is a passive
  // fan-out branch, so it never affects what listeners hear or what's recorded.
  private attachAnalyser(key: string, src: AudioNode) {
    if (!this.audioCtx) return;
    try {
      const an = this.audioCtx.createAnalyser();
      an.fftSize = 256;             // small FFT - we only need a coarse RMS
      an.smoothingTimeConstant = 0.5;
      src.connect(an);              // extra branch; does not replace src->dest
      this.analysers.set(key, an);
      if (!this.audioBuf || this.audioBuf.length < an.fftSize) this.audioBuf = new Uint8Array(an.fftSize);
    } catch { /* analyser unsupported - active-speaker just stays disabled */ }
  }

  // Sample every analyser a few times/sec, compute a smoothed RMS level, and pick
  // the loudest tile above a threshold as the active speaker (debounced via the
  // smoothing + hysteresis so the amber ring doesn't flicker between talkers).
  private updateLevels() {
    if (!this.analysers.size) { this.activeKey = null; return; }
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    if (now - this.lastLevelAt < 140) return; // ~7x/sec
    this.lastLevelAt = now;

    let buf = this.audioBuf;
    if (!buf || buf.length < 256) { buf = this.audioBuf = new Uint8Array(256); }

    let best: string | null = null, bestLvl = 0;
    this.analysers.forEach((an, key) => {
      const n = Math.min(an.fftSize, buf!.length);
      an.getByteTimeDomainData(buf as any);
      let sum = 0;
      for (let i = 0; i < n; i++) { const s = (buf![i] - 128) / 128; sum += s * s; }
      const rms = Math.sqrt(sum / n);
      // Exponential smoothing so short spikes/gaps don't cause flicker.
      const prev = this.levels.get(key) || 0;
      const lvl = prev * 0.6 + rms * 0.4;
      this.levels.set(key, lvl);
      if (lvl > bestLvl) { bestLvl = lvl; best = key; }
    });

    const THRESHOLD = 0.045;
    if (best !== null && bestLvl >= THRESHOLD) {
      // Hysteresis: only switch away from the current speaker if a clearly
      // louder tile takes over (>1.4x), otherwise hold the current one.
      if (this.activeKey && this.activeKey !== best) {
        const cur = this.levels.get(this.activeKey) || 0;
        if (bestLvl > cur * 1.4) this.activeKey = best;
      } else {
        this.activeKey = best;
      }
    } else if (bestLvl < THRESHOLD * 0.7) {
      this.activeKey = null;
    }
  }

  // ---- Name label + active-speaker ring for a tile ----
  // Draws a subtle lower-left name chip inside the tile, and (if this tile's key
  // is the active speaker) an amber rounded border around the tile.
  private drawTileLabel(ctx: CanvasRenderingContext2D, name: string, key: string, x: number, y: number, w: number, h: number, r = TILE_R) {
    // Active-speaker ring (drawn on the tile edge, inside the clip bounds).
    if (key && this.activeKey === key) {
      ctx.save();
      const inset = 1.5;
      roundRectPath(ctx, x + inset, y + inset, w - inset * 2, h - inset * 2, Math.max(0, r - inset));
      ctx.lineWidth = 3; ctx.strokeStyle = "#F5A524"; ctx.stroke();
      ctx.restore();
    }
    if (!name) return;
    // Scale the chip down when tiles get small (many guests on screen).
    const small = Math.min(w, h) < 260;
    const fs = small ? 11 : 13;
    const padX = small ? 7 : 9, padY = small ? 4 : 5, m = small ? 8 : 10;
    ctx.save();
    ctx.font = `600 ${fs}px Inter, sans-serif`;
    ctx.textBaseline = "middle";
    // Truncate to fit within the tile width.
    const maxTextW = w - m * 2 - padX * 2;
    let label = name;
    if (ctx.measureText(label).width > maxTextW) {
      while (label.length > 1 && ctx.measureText(label + "…").width > maxTextW) label = label.slice(0, -1);
      label = label + "…";
    }
    const tw = ctx.measureText(label).width;
    const chipH = fs + padY * 2, chipW = tw + padX * 2;
    const cx = x + m, cy = y + h - m - chipH;
    roundRectPath(ctx, cx, cy, chipW, chipH, chipH / 2);
    ctx.fillStyle = "rgba(10,9,8,.72)"; ctx.fill();
    ctx.fillStyle = "#F3EFE7";
    ctx.fillText(label, cx + padX, cy + chipH / 2 + 0.5);
    ctx.restore();
  }

  // Resolve a guest's display name from the roster (fallback "Guest").
  private guestName(sid: string): string {
    const g = this.roster.find((p) => p.sessionId === sid);
    return (g?.name || "").trim() || "Guest";
  }

  // News-style ticker: a colored label box + text scrolling right-to-left along
  // the very bottom. Drawn on top of everything, in every scene mode.
  private drawTicker(ctx: CanvasRenderingContext2D) {
    if (!this.tickerOn || !this.tickerText) return;
    const h = 46, y = H - h;
    ctx.save();
    ctx.textBaseline = "middle";
    // Bar background + amber top accent line.
    ctx.fillStyle = "rgba(10,9,8,.92)"; ctx.fillRect(0, y, W, h);
    ctx.fillStyle = "#F5A524"; ctx.fillRect(0, y, W, 2);

    // Left label box.
    let textStart = 0;
    if (this.tickerLabel) {
      ctx.font = "700 22px Anton, sans-serif";
      const lw = ctx.measureText(this.tickerLabel.toUpperCase()).width + 40;
      ctx.fillStyle = "#F5A524"; ctx.fillRect(0, y, lw, h);
      ctx.fillStyle = "#151107"; ctx.fillText(this.tickerLabel.toUpperCase(), 20, y + h / 2 + 1);
      textStart = lw;
    }

    // Scrolling text region (clipped so it slides under the label).
    ctx.beginPath(); ctx.rect(textStart, y, W - textStart, h); ctx.clip();
    ctx.font = "500 22px Inter, sans-serif"; ctx.fillStyle = "#F3EFE7";
    const tw = ctx.measureText(this.tickerText).width;
    const gap = 90;
    // Continuous marquee: the scroll position is a pure function of the clock,
    // so it never drifts, hitches, or resets - regardless of how evenly frames
    // are delivered (rAF + audio clock). The text is tiled across the whole
    // visible width so the loop is seamless and never-ending.
    const period = tw + gap;
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    const offset = period > 0 ? ((now * 70) / 1000) % period : 0; // 70px/s
    const startX = textStart + 24 - offset;
    const copies = Math.ceil((W - textStart) / period) + 2;
    for (let i = -1; i < copies; i++) {
      ctx.fillText(this.tickerText, startX + i * period, y + h / 2 + 1);
    }
    ctx.restore();
  }

  private drawGraphics(ctx: CanvasRenderingContext2D) {
    ctx.textBaseline = "middle";
    this.drawTicker(ctx);
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
    if (this.tipAlert) {
      const { name, amount, message } = this.tipAlert;
      const bw = 620, bh = message ? 128 : 92, x = (W - bw) / 2, y = 40;
      ctx.save();
      roundRectPath(ctx, x, y, bw, bh, 18);
      ctx.fillStyle = "#F5A524"; ctx.fill();
      ctx.textAlign = "center";
      ctx.fillStyle = "#151107"; ctx.font = "700 40px Anton, sans-serif";
      ctx.fillText(`${name} tipped $${amount.toFixed(2)}`, W / 2, y + 42);
      if (message) { ctx.font = "400 24px Inter, sans-serif"; ctx.fillText(message.slice(0, 60), W / 2, y + 90); }
      ctx.textAlign = "left"; ctx.restore();
    }
    if (this.banner) {
      const { x, y } = this.bannerPos, ph = 56;
      ctx.font = "400 34px Anton, sans-serif";
      const tw = ctx.measureText(this.banner.title.toUpperCase()).width + 44;
      ctx.fillStyle = "#F5A524"; ctx.fillRect(x, y, tw, ph);
      ctx.fillStyle = "#151107"; ctx.fillText(this.banner.title.toUpperCase(), x + 22, y + ph / 2 + 2);
      let total = tw;
      if (this.banner.subtitle) {
        ctx.font = "500 18px Inter, sans-serif";
        const sw = ctx.measureText(this.banner.subtitle).width + 40;
        ctx.fillStyle = "rgba(10,9,8,.9)"; ctx.fillRect(x + tw, y, sw, ph);
        ctx.fillStyle = "#F3EFE7"; ctx.fillText(this.banner.subtitle, x + tw + 20, y + ph / 2 + 1);
        total += sw;
      }
      this.bannerRect = { x, y, w: total, h: ph };
    }
  }

  setBanner(title: string, subtitle: string) { this.banner = title.trim() ? { title, subtitle } : null; this.emit(); }
  hideBanner() { this.banner = null; this.emit(); }
  setPinned(name: string, text: string) { this.pinned = { name, text }; this.emit(); }
  clearPinned() { this.pinned = null; this.emit(); }
  // Pop a tip alert onto the broadcast for a few seconds (auto-clears).
  showTipAlert(name: string, amount: number, message: string) {
    this.tipAlert = { name, amount, message };
    if (this.tipTimer) clearTimeout(this.tipTimer);
    this.tipTimer = setTimeout(() => { this.tipAlert = null; this.emit(); }, 9000);
    this.emit();
  }
  clearGraphics() { this.banner = null; this.pinned = null; this.emit(); }
  setLayout(l: Layout) { this.layout = l; this.emit(); }

  // ---- Branded scene ----
  private loadImg(dataUrl: string): HTMLImageElement | null {
    if (!dataUrl) return null;
    const img = new Image();
    img.src = dataUrl;
    return img;
  }
  setScene(cfg: Partial<{ enabled: boolean; mode: "none" | "chroma" | "ml"; chroma: string; background: string; frame: string; logo: string; tickerOn: boolean; tickerLabel: string; ticker: string }>) {
    if (typeof cfg.enabled === "boolean") this.sceneEnabled = cfg.enabled;
    if (cfg.mode) this.sceneMode = cfg.mode;
    if (cfg.chroma) this.chromaColor = cfg.chroma;
    if (cfg.background !== undefined) this.sceneBg = this.loadImg(cfg.background);
    if (cfg.frame !== undefined) this.sceneFrame = this.loadImg(cfg.frame);
    if (cfg.logo !== undefined) this.sceneLogo = this.loadImg(cfg.logo);
    if (typeof cfg.tickerOn === "boolean") this.tickerOn = cfg.tickerOn;
    if (cfg.tickerLabel !== undefined) this.tickerLabel = cfg.tickerLabel;
    if (cfg.ticker !== undefined) this.setTickerText(cfg.ticker);
    this.emit();
  }
  setSceneEnabled(v: boolean) { this.sceneEnabled = v; this.emit(); }
  setSceneMode(m: "none" | "chroma" | "ml") { this.sceneMode = m; this.emit(); }
  setChromaColor(c: string) { this.chromaColor = c; this.emit(); }

  // Join the ticker lines into one scrolling string (separated by a bullet).
  private setTickerText(raw: string) {
    const items = raw.split("\n").map((s) => s.trim()).filter(Boolean);
    this.tickerText = items.join("      •      ");
  }

  private drawScene(ctx: CanvasRenderingContext2D) {
    if (this.sceneBg?.complete && this.sceneBg.naturalWidth) coverDraw(ctx, this.sceneBg, this.sceneBg.naturalWidth, this.sceneBg.naturalHeight, 0, 0, W, H);
    else { ctx.fillStyle = "#0A0908"; ctx.fillRect(0, 0, W, H); }

    const host = this.hostVideo;
    if (host && host.videoWidth) {
      if (this.sceneMode === "chroma") this.drawChromaHost(ctx, host);
      else if (this.sceneMode === "ml") this.drawMlHost(ctx, host);
      else drawCover(ctx, host, 0, 0, W, H);
    }

    if (this.sceneFrame?.complete && this.sceneFrame.naturalWidth) ctx.drawImage(this.sceneFrame, 0, 0, W, H);
    if (this.sceneLogo?.complete && this.sceneLogo.naturalWidth) {
      const lw = 170, lh = lw * (this.sceneLogo.naturalHeight / this.sceneLogo.naturalWidth || 0.4);
      ctx.drawImage(this.sceneLogo, (W - lw) / 2, 22, lw, lh);
    }
  }

  // ---- Intro / "starting soon" bumper ----
  // A card (still image + headline/subtext + optional countdown) is the SAFE
  // default: it never taints the canvas so captureStream()/WHIP keep working.
  // An optional looping intro VIDEO is supported too, but the URL must be
  // CORS-enabled (crossOrigin="anonymous") or drawing it would taint the canvas
  // and break the broadcast - the UI documents this.
  setBumper(cfg: Partial<{ enabled: boolean; mode: "card" | "video"; headline: string; subtext: string; background: string; videoUrl: string; startsAt: number }>) {
    if (typeof cfg.enabled === "boolean") this.bumperEnabled = cfg.enabled;
    if (cfg.mode) this.bumperMode = cfg.mode;
    if (cfg.headline !== undefined) this.bumperHeadline = cfg.headline;
    if (cfg.subtext !== undefined) this.bumperSubtext = cfg.subtext;
    if (cfg.background !== undefined) this.bumperBg = this.loadImg(cfg.background);
    if (cfg.videoUrl !== undefined) this.bumperVideoUrl = cfg.videoUrl;
    if (cfg.startsAt !== undefined) this.bumperStartsAt = Number(cfg.startsAt) || 0;
    this.syncBumperVideo();
    this.emit();
  }

  // Create/tear down the looping intro video element and its audio branch as the
  // url/enabled/mode change. Audio is routed into the program mix (audioDest)
  // ONLY while the bumper is enabled + in video mode; otherwise it's detached so
  // it never lingers in the mix once the bumper is off.
  private syncBumperVideo() {
    const wantVideo = this.bumperEnabled && this.bumperMode === "video" && !!this.bumperVideoUrl;

    // URL changed - rebuild the element from scratch (a MediaElementSource can be
    // created only once per element, so a new url means a new element).
    if (this.bumperVideo && this.bumperVideo.src !== this.bumperVideoUrl) {
      this.teardownBumperVideo();
    }

    if (wantVideo) {
      if (!this.bumperVideo) {
        const v = document.createElement("video");
        v.crossOrigin = "anonymous"; // required so drawing it doesn't taint the canvas
        v.loop = true; v.muted = false; v.autoplay = true;
        (v as any).playsInline = true;
        v.src = this.bumperVideoUrl;
        this.bumperVideo = v;
        // Route its audio into the program mix (created once per element).
        if (this.audioCtx && this.audioDest) {
          try {
            this.bumperAudioSrc = this.audioCtx.createMediaElementSource(v);
            this.bumperAudioSrc.connect(this.audioDest);
          } catch { this.bumperAudioSrc = null; }
        }
      }
      this.bumperVideo.play().catch(() => {});
    } else if (this.bumperVideo) {
      // Not wanted right now: pause + detach audio, but keep card fallback safe.
      try { this.bumperVideo.pause(); } catch {}
      if (!this.bumperEnabled || this.bumperMode !== "video") this.teardownBumperVideo();
    }
  }

  private teardownBumperVideo() {
    if (this.bumperAudioSrc) { try { this.bumperAudioSrc.disconnect(); } catch {} this.bumperAudioSrc = null; }
    if (this.bumperVideo) { try { this.bumperVideo.pause(); } catch {} this.bumperVideo.src = ""; this.bumperVideo = null; }
  }

  // Wrap text to fit a max width, shrinking the font until it fits in maxLines.
  private wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const lines: string[] = [];
    let cur = words[0];
    for (let i = 1; i < words.length; i++) {
      const test = cur + " " + words[i];
      if (ctx.measureText(test).width <= maxWidth) cur = test;
      else { lines.push(cur); cur = words[i]; }
    }
    lines.push(cur);
    return lines.slice(0, maxLines);
  }

  private formatCountdown(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `Starting in ${h}:${pad(m)}:${pad(s)}` : `Starting in ${pad(m)}:${pad(s)}`;
  }

  private drawBumper(ctx: CanvasRenderingContext2D) {
    // Video mode: draw the looping intro full-frame if it's ready, else fall back
    // to the card look so viewers never see a blank frame while it buffers.
    if (this.bumperMode === "video" && this.bumperVideo && this.bumperVideo.videoWidth) {
      drawCover(ctx, this.bumperVideo, 0, 0, W, H);
      return;
    }

    // Card mode (and video fallback): background image cover-filled, else a dark
    // radial gradient on-brand (#1A1614 -> #0B0A09).
    if (this.bumperBg?.complete && this.bumperBg.naturalWidth) {
      coverDraw(ctx, this.bumperBg, this.bumperBg.naturalWidth, this.bumperBg.naturalHeight, 0, 0, W, H);
      // Slight scrim so text stays legible over any image.
      ctx.fillStyle = "rgba(10,9,8,.45)"; ctx.fillRect(0, 0, W, H);
    } else {
      const g = ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, W * 0.72);
      g.addColorStop(0, "#1A1614"); g.addColorStop(1, "#0B0A09");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

    // Logo (reuse the scene logo if one is set), centered near the top.
    let topY = 150;
    if (this.sceneLogo?.complete && this.sceneLogo.naturalWidth) {
      const lw = 200, lh = lw * (this.sceneLogo.naturalHeight / this.sceneLogo.naturalWidth || 0.4);
      ctx.drawImage(this.sceneLogo, (W - lw) / 2, 70, lw, lh);
      topY = 70 + lh + 60;
    }

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    // Headline: big Anton uppercase, scaled/wrapped to fit.
    const headline = (this.bumperHeadline || "").trim().toUpperCase();
    if (headline) {
      const maxW = W - 200;
      let fs = 92;
      let lines: string[] = [];
      // Shrink the font until the wrapped headline fits in at most 2 lines.
      for (; fs >= 40; fs -= 6) {
        ctx.font = `${fs}px Anton, sans-serif`;
        lines = this.wrapLines(ctx, headline, maxW, 2);
        const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
        if (widest <= maxW && lines.length <= 2) break;
      }
      ctx.font = `${fs}px Anton, sans-serif`;
      ctx.fillStyle = "#F3EFE7";
      const lineH = fs * 1.06;
      const blockH = lineH * lines.length;
      let y = Math.max(topY + fs, H / 2 - blockH / 2 + fs);
      lines.forEach((l) => { ctx.fillText(l, W / 2, y); y += lineH; });
      topY = y + 6;
    } else {
      topY = Math.max(topY, H / 2);
    }

    // Subtext: Inter, muted cream.
    const subtext = (this.bumperSubtext || "").trim();
    if (subtext) {
      ctx.font = "400 26px Inter, sans-serif";
      ctx.fillStyle = "rgba(243,239,231,.66)";
      const subLines = this.wrapLines(ctx, subtext, W - 260, 2);
      subLines.forEach((l) => { ctx.fillText(l, W / 2, topY); topY += 34; });
      topY += 8;
    }

    // Live countdown to the scheduled start, in amber.
    if (this.bumperStartsAt > 0) {
      const remaining = this.bumperStartsAt - Date.now();
      if (remaining > 0) {
        ctx.font = "600 30px Inter, sans-serif";
        ctx.fillStyle = "#F5A524";
        ctx.fillText(this.formatCountdown(remaining), W / 2, topY + 10);
      }
    }

    ctx.textAlign = "left";
    ctx.restore();
  }

  // Lazily load MediaPipe's selfie segmentation model (from CDN, on first use).
  private async ensureSegmenter() {
    if (this.segReady || this.segLoading) return;
    this.segLoading = true;
    try {
      const V = "0.10.14";
      const vision: any = await import(/* webpackIgnore: true */ `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${V}/vision_bundle.mjs`);
      const fileset = await vision.FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${V}/wasm`);
      const opts = (delegate: "GPU" | "CPU") => ({
        baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite", delegate },
        runningMode: "VIDEO" as const,
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
      try {
        this.segmenter = await vision.ImageSegmenter.createFromOptions(fileset, opts("GPU"));
      } catch {
        this.segmenter = await vision.ImageSegmenter.createFromOptions(fileset, opts("CPU"));
      }
      this.segReady = true;
    } catch {
      this.error = "Couldn't load the AI background. Check your connection and try again.";
    } finally {
      this.segLoading = false;
      this.emit();
    }
  }

  // AI virtual background: segment the person out (no green screen) and draw
  // them over the scene background - like Zoom/Meet.
  private drawMlHost(ctx: CanvasRenderingContext2D, v: HTMLVideoElement) {
    if (!this.segReady) { this.ensureSegmenter(); drawCover(ctx, v, 0, 0, W, H); return; }
    const IW = 640, IH = 360;
    if (!this.inputCanvas) { this.inputCanvas = document.createElement("canvas"); this.inputCanvas.width = IW; this.inputCanvas.height = IH; }
    const ictx = this.inputCanvas.getContext("2d", { willReadFrequently: true });
    if (!ictx) { drawCover(ctx, v, 0, 0, W, H); return; }
    coverDraw(ictx, v, v.videoWidth, v.videoHeight, 0, 0, IW, IH);

    let result: any;
    try { result = this.segmenter.segmentForVideo(this.inputCanvas, performance.now()); } catch { drawCover(ctx, v, 0, 0, W, H); return; }
    const mask = result?.confidenceMasks?.[0];
    if (!mask) { try { result?.close?.(); } catch {} drawCover(ctx, v, 0, 0, W, H); return; }

    const floats = mask.getAsFloat32Array();
    const mw = mask.width, mh = mask.height;
    if (!this.maskCanvas) this.maskCanvas = document.createElement("canvas");
    if (this.maskCanvas.width !== mw || this.maskCanvas.height !== mh) { this.maskCanvas.width = mw; this.maskCanvas.height = mh; }
    const mctx = this.maskCanvas.getContext("2d")!;
    const id = mctx.createImageData(mw, mh);
    const dd = id.data;
    for (let i = 0; i < floats.length; i++) { dd[i * 4] = 255; dd[i * 4 + 1] = 255; dd[i * 4 + 2] = 255; dd[i * 4 + 3] = Math.round(floats[i] * 255); }
    mctx.putImageData(id, 0, 0);
    try { result.close(); } catch {}

    // Keep only the person (mask alpha) in the framed host, then draw over the bg.
    ictx.globalCompositeOperation = "destination-in";
    ictx.drawImage(this.maskCanvas, 0, 0, mw, mh, 0, 0, IW, IH);
    ictx.globalCompositeOperation = "source-over";
    ctx.drawImage(this.inputCanvas, 0, 0, IW, IH, 0, 0, W, H);
  }

  // Green-screen key: knock out the chroma color so the background shows through.
  private drawChromaHost(ctx: CanvasRenderingContext2D, v: HTMLVideoElement) {
    const pw = 640, ph = 360;
    if (!this.keyCanvas) { this.keyCanvas = document.createElement("canvas"); this.keyCanvas.width = pw; this.keyCanvas.height = ph; }
    const k = this.keyCanvas.getContext("2d", { willReadFrequently: true });
    if (!k) { drawCover(ctx, v, 0, 0, W, H); return; }
    coverDraw(k, v, v.videoWidth, v.videoHeight, 0, 0, pw, ph);
    const img = k.getImageData(0, 0, pw, ph);
    const d = img.data;
    const [r0, g0, b0] = hexRgb(this.chromaColor);
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const dist = Math.abs(r - r0) + Math.abs(g - g0) + Math.abs(b - b0);
      if (dist < 180 && g > r + 18 && g > b + 18) d[i + 3] = 0;
    }
    k.putImageData(img, 0, 0);
    ctx.drawImage(this.keyCanvas, 0, 0, pw, ph, 0, 0, W, H);
  }

  // ---- Screen / tab / window share (host) ----
  async startScreenShare() {
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true } as MediaStreamConstraints);
      this.screenStream = s;
      if (!this.screenVideo) {
        this.screenVideo = document.createElement("video");
        this.screenVideo.muted = true; this.screenVideo.autoplay = true; (this.screenVideo as any).playsInline = true;
      }
      this.screenVideo.srcObject = s; this.screenVideo.play().catch(() => {});
      // Mix shared tab/system audio into the program (e.g. a video's sound).
      if (this.audioCtx && this.audioDest && s.getAudioTracks().length) {
        try { this.screenAudioSrc = this.audioCtx.createMediaStreamSource(new MediaStream(s.getAudioTracks())); this.screenAudioSrc.connect(this.audioDest); } catch {}
      }
      // The browser's own "Stop sharing" ends the track.
      s.getVideoTracks()[0]?.addEventListener("ended", () => this.stopScreenShare());
      this.screenSharing = true; this.emit();
    } catch { /* user cancelled the picker */ }
  }

  stopScreenShare() {
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.screenStream = null;
    if (this.screenVideo) this.screenVideo.srcObject = null;
    try { this.screenAudioSrc?.disconnect(); } catch {}
    this.screenAudioSrc = null;
    this.screenSharing = false; this.emit();
  }

  setScreenLayout(l: "full" | "pip" | "split") { this.screenLayout = l; this.emit(); }

  private drawScreenLayout(ctx: CanvasRenderingContext2D, people: { video: HTMLVideoElement; name: string; key: string }[]) {
    const screen = this.screenVideo!;
    if (this.screenLayout === "split") {
      const gap = 10, sw = Math.round(W * 0.64);
      drawContainRounded(ctx, screen, 0, 0, sw, H);
      const n = Math.max(people.length, 1);
      const cw = W - sw - gap, chh = (H - gap * (n - 1)) / n;
      people.forEach((t, i) => {
        const ty = i * (chh + gap);
        drawCoverRounded(ctx, t.video, sw + gap, ty, cw, chh);
        this.drawTileLabel(ctx, t.name, t.key, sw + gap, ty, cw, chh);
      });
    } else {
      drawContain(ctx, screen, 0, 0, W, H); // full-bleed shared screen
      if (this.screenLayout === "pip" && people.length) {
        const pw = 320, ph = 180, gap = 14;
        const list = people.slice(0, 2);
        const groupH = list.length * ph + (list.length - 1) * gap;
        // Keep the (draggable) group on-canvas.
        const x = Math.max(0, Math.min(W - pw, this.pipPos.x));
        const y = Math.max(0, Math.min(H - groupH, this.pipPos.y));
        this.pipPos = { x, y };
        this.pipRect = { x, y, w: pw, h: groupH };
        list.forEach((t, i) => {
          const by = y + i * (ph + gap);
          drawCoverRounded(ctx, t.video, x, by, pw, ph, 16);
          roundRectPath(ctx, x, by, pw, ph, 16);
          ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.stroke();
          this.drawTileLabel(ctx, t.name, t.key, x, by, pw, ph, 16);
        });
      }
    }
  }

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

  // ---- Draggable banner (lower-third) ----
  bannerBox() { return { ...this.bannerRect }; }
  hitBanner(cx: number, cy: number) {
    if (!this.banner) return false;
    const b = this.bannerRect;
    return b.w > 0 && cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h;
  }
  setBannerPos(x: number, y: number) {
    const w = this.bannerRect.w || 200, h = this.bannerRect.h || 56;
    this.bannerPos = {
      x: Math.max(0, Math.min(W - w, x)),
      y: Math.max(0, Math.min(H - h, y)),
    };
    this.emit();
  }

  // ---- Draggable PIP camera box (only in screen-share PIP mode) ----
  pipBox() { return { ...this.pipRect }; }
  hitPip(cx: number, cy: number) {
    if (!(this.screenSharing && this.screenLayout === "pip")) return false;
    const b = this.pipRect;
    return cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h;
  }
  setPipPos(x: number, y: number) {
    this.pipPos = {
      x: Math.max(0, Math.min(W - this.pipRect.w, x)),
      y: Math.max(0, Math.min(H - this.pipRect.h, y)),
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
        const gain = this.audioCtx.createGain();
        gain.gain.value = this.mutedGuests.has(sid) ? 0 : 1;
        src.connect(gain); gain.connect(this.audioDest);
        this.guestAudio.set(sid, src);
        this.guestGain.set(sid, gain);
        this.attachAnalyser(sid, src);
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
    // Pull video + audio in ONE negotiation (a single serialized pull) so the
    // two don't race and collide on the peer connection.
    const names: string[] = [];
    if (g.hasVideo) names.push("video");
    if (g.hasAudio) names.push("audio");
    if (names.length) this.rtc.pull(sessionId, names).catch(() => {});
    this.emit();
  }

  removeGuest(sessionId: string) {
    this.admitted.delete(sessionId);
    this.subscribedGuests.delete(sessionId);
    const v = this.guestVideos.get(sessionId);
    if (v) { try { (v.srcObject as MediaStream)?.getTracks().forEach((t) => t.stop()); } catch {} v.srcObject = null; this.guestVideos.delete(sessionId); }
    const a = this.guestAudio.get(sessionId);
    if (a) { try { a.disconnect(); } catch {} this.guestAudio.delete(sessionId); }
    const gn = this.guestGain.get(sessionId);
    if (gn) { try { gn.disconnect(); } catch {} this.guestGain.delete(sessionId); }
    this.mutedGuests.delete(sessionId);
    const an = this.analysers.get(sessionId);
    if (an) { try { an.disconnect(); } catch {} this.analysers.delete(sessionId); }
    this.levels.delete(sessionId);
    if (this.activeKey === sessionId) this.activeKey = null;
    this.emit();
  }

  // ---- Host mute controls: silence a guest in the program mix (gain 0)
  // without dropping their connection. "Mute all" applies to everyone on air.
  isGuestMuted(sessionId: string) { return this.mutedGuests.has(sessionId); }
  muteGuest(sessionId: string) {
    this.mutedGuests.add(sessionId);
    const g = this.guestGain.get(sessionId); if (g) g.gain.value = 0;
    this.emit();
  }
  unmuteGuest(sessionId: string) {
    this.mutedGuests.delete(sessionId);
    const g = this.guestGain.get(sessionId); if (g) g.gain.value = 1;
    this.emit();
  }
  toggleGuestMute(sessionId: string) {
    if (this.mutedGuests.has(sessionId)) this.unmuteGuest(sessionId); else this.muteGuest(sessionId);
  }
  muteAllGuests() { this.admitted.forEach((sid) => this.muteGuest(sid)); }
  unmuteAllGuests() { Array.from(this.mutedGuests).forEach((sid) => this.unmuteGuest(sid)); }

  inviteUrl() { return typeof window !== "undefined" ? window.location.origin + "/join/" + ROOM : ""; }

  async goLive() {
    if (this.live || this.connecting) return;
    this.connecting = true; this.error = ""; this.emit();
    try {
      this.audioCtx?.resume().catch(() => {}); // keep the background clock alive
      this.startBackgroundClock();
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
      if (this.autoClearChat) this.clearChat(); // fresh chat for each new broadcast (host pref)
    } catch (e: any) { this.error = e.message || "Could not go live."; this.pc?.close(); this.pc = null; }
    finally { this.connecting = false; this.emit(); }
  }

  // Wipe the live-chat history (host-only; relayed to the Worker with the admin
  // token). Called automatically on Go Live and from the Chat tab's button.
  setAutoClearChat(v: boolean) {
    this.autoClearChat = v;
    try { localStorage.setItem("cwac-autoclear-chat", v ? "1" : "0"); } catch {}
    this.emit();
  }

  async clearChat() {
    try {
      const token = await getIdToken();
      await fetch("/api/chat/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: "clear", room: "live" }),
      });
    } catch { /* best-effort */ }
  }

  // ---- Local recording: save the program to a file on the host's computer ----
  startRecording() {
    if (this.recording || !this.canvas || !this.audioDest) return;
    try {
      const canvasStream = this.canvas.captureStream(30);
      const out = new MediaStream(canvasStream.getVideoTracks());
      this.audioDest.stream.getAudioTracks().forEach((t) => out.addTrack(t));
      const mime = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus" : "video/webm";
      this.recorder = new MediaRecorder(out, { mimeType: mime, videoBitsPerSecond: 5_000_000 });
      this.recChunks = [];
      this.recorder.ondataavailable = (e) => { if (e.data.size) this.recChunks.push(e.data); };
      this.recorder.onstop = () => {
        const blob = new Blob(this.recChunks, { type: "video/webm" });
        this.recChunks = [];
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
        a.href = url; a.download = `broadcast-${stamp}.webm`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 15000);
      };
      this.recorder.start(1000);
      this.recording = true; this.emit();
    } catch {
      this.error = "Local recording isn't supported in this browser."; this.emit();
    }
  }

  stopRecording() {
    if (!this.recording) return;
    try { this.recorder?.stop(); } catch {}
    this.recorder = null;
    this.recording = false; this.emit();
  }

  // ---- Soundboard: short effects that go OUT in the broadcast + recording ----
  // Decode a data-URL audio clip once and cache it under its pad id.
  async loadSound(id: string, url: string) {
    if (!this.audioCtx || this.soundBuffers.has(id) || !url) return;
    try {
      const res = await fetch(url);
      const arr = await res.arrayBuffer();
      const buf = await this.audioCtx.decodeAudioData(arr);
      this.soundBuffers.set(id, buf);
    } catch { /* unsupported/corrupt clip - just skip it */ }
  }

  // Play a cached effect: routed to audioDest (broadcast + recording) AND to the
  // audioCtx destination (so the host hears it in their own monitor).
  playSound(id: string) {
    const buf = this.soundBuffers.get(id);
    if (!buf || !this.audioCtx || !this.audioDest) return;
    this.audioCtx.resume().catch(() => {});
    const src = this.audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(this.audioDest);
    src.connect(this.audioCtx.destination);
    this.soundSources.add(src);
    src.onended = () => { try { src.disconnect(); } catch {} this.soundSources.delete(src); };
    try { src.start(); } catch {}
  }

  stopSounds() {
    this.soundSources.forEach((src) => { try { src.stop(); } catch {} try { src.disconnect(); } catch {} });
    this.soundSources.clear();
  }

  unloadSound(id: string) { this.soundBuffers.delete(id); }

  stop() { this.pc?.close(); this.pc = null; this.live = false; this.emit(); }
}

declare global {
  // eslint-disable-next-line no-var
  var __sccBroadcast: StudioEngine | undefined;
}
export const broadcast: StudioEngine =
  typeof window !== "undefined" ? (globalThis.__sccBroadcast ??= new StudioEngine()) : new StudioEngine();
