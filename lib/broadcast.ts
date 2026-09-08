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
  private keyCanvas: HTMLCanvasElement | null = null;
  private segmenter: any = null;
  private segReady = false;
  private segLoading = false;
  private inputCanvas: HTMLCanvasElement | null = null;
  private maskCanvas: HTMLCanvasElement | null = null;
  private audioCtx: AudioContext | null = null;
  private audioDest: MediaStreamAudioDestinationNode | null = null;
  private hostAudioSrc: MediaStreamAudioSourceNode | null = null;
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

    // Branded scene takes over the frame when enabled (host over a background).
    if (this.sceneEnabled) { this.drawScene(ctx); this.drawGraphics(ctx); return; }

    ctx.fillStyle = "#0A0908"; ctx.fillRect(0, 0, W, H);
    const sources = [this.hostVideo, ...Array.from(this.guestVideos.values())].filter(Boolean) as HTMLVideoElement[];
    if (this.screenSharing && this.screenVideo && this.screenVideo.videoWidth) {
      this.drawScreenLayout(ctx, sources);
    } else {
      const n = sources.length || 1;
      const gap = 10;
      if (this.layout === "spotlight" && n > 1) {
        const strip = 300;
        drawCoverRounded(ctx, sources[0], 0, 0, W - strip - gap, H);
        const ch = (H - gap * (n - 2)) / (n - 1);
        sources.slice(1).forEach((v, i) => drawCoverRounded(ctx, v, W - strip, i * (ch + gap), strip, ch));
      } else if (n === 1) {
        drawCover(ctx, sources[0], 0, 0, W, H); // single camera fills the frame
      } else {
        const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
        const cw = (W - gap * (cols - 1)) / cols, chh = (H - gap * (rows - 1)) / rows;
        sources.forEach((v, i) => { const c = i % cols, r = Math.floor(i / cols); drawCoverRounded(ctx, v, c * (cw + gap), r * (chh + gap), cw, chh); });
      }
    }
    this.drawGraphics(ctx);
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

  private drawScreenLayout(ctx: CanvasRenderingContext2D, people: HTMLVideoElement[]) {
    const screen = this.screenVideo!;
    if (this.screenLayout === "split") {
      const gap = 10, sw = Math.round(W * 0.64);
      drawContainRounded(ctx, screen, 0, 0, sw, H);
      const n = Math.max(people.length, 1);
      const cw = W - sw - gap, chh = (H - gap * (n - 1)) / n;
      people.forEach((v, i) => drawCoverRounded(ctx, v, sw + gap, i * (chh + gap), cw, chh));
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
        list.forEach((v, i) => {
          const by = y + i * (ph + gap);
          drawCoverRounded(ctx, v, x, by, pw, ph, 16);
          roundRectPath(ctx, x, by, pw, ph, 16);
          ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.stroke();
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
    } catch (e: any) { this.error = e.message || "Could not go live."; this.pc?.close(); this.pc = null; }
    finally { this.connecting = false; this.emit(); }
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

  stop() { this.pc?.close(); this.pc = null; this.live = false; this.emit(); }
}

declare global {
  // eslint-disable-next-line no-var
  var __sccBroadcast: StudioEngine | undefined;
}
export const broadcast: StudioEngine =
  typeof window !== "undefined" ? (globalThis.__sccBroadcast ??= new StudioEngine()) : new StudioEngine();
