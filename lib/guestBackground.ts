// Guest-side background processing. Runs entirely on the GUEST's device: takes
// their camera, optionally removes the background (blur or a replacement image)
// with MediaPipe selfie segmentation, and exposes a processed MediaStream that
// the guest publishes to the SFU. Doing this guest-side keeps the work off the
// host and scales to many guests. Mode "off" is a cheap passthrough (no AI).

export type BgMode = "off" | "blur" | "image";

// Cover-draw any source (video/image) into a w x h box, cropping to fill.
function coverSrc(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, w: number, h: number) {
  if (!sw || !sh) return;
  const vr = sw / sh, dr = w / h;
  let cw = sw, ch = sh, sx = 0, sy = 0;
  if (vr > dr) { cw = sh * dr; sx = (sw - cw) / 2; } else { ch = sw / dr; sy = (sh - ch) / 2; }
  ctx.drawImage(src, sx, sy, cw, ch, 0, 0, w, h);
}

export class GuestBackground {
  mode: BgMode = "off";
  private W = 960;
  private H = 540;
  private video = document.createElement("video");
  private canvas = document.createElement("canvas");
  private input = document.createElement("canvas");
  private person = document.createElement("canvas");
  private maskCanvas = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D | null = null;
  private bgImg: HTMLImageElement | null = null;
  private segmenter: any = null;
  private segReady = false;
  private segLoading = false;
  private raf = 0;
  private audioTracks: MediaStreamTrack[] = [];
  private out: MediaStream | null = null;
  private onReady?: (ready: boolean) => void;

  constructor(onReady?: (ready: boolean) => void) { this.onReady = onReady; }

  async start(source: MediaStream) {
    this.canvas.width = this.W; this.canvas.height = this.H;
    this.input.width = 640; this.input.height = 360;
    this.person.width = this.W; this.person.height = this.H;
    this.ctx = this.canvas.getContext("2d");
    this.video.muted = true; this.video.autoplay = true; (this.video as any).playsInline = true;
    this.video.srcObject = new MediaStream(source.getVideoTracks());
    await this.video.play().catch(() => {});
    this.audioTracks = source.getAudioTracks();
    const loop = () => { this.render(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  setMode(m: BgMode) { this.mode = m; if (m !== "off") this.ensureSegmenter(); }
  setImage(url: string) {
    if (!url) { this.bgImg = null; return; }
    const img = new Image();
    img.onload = () => { this.bgImg = img; };
    img.src = url;
  }

  // The processed stream to publish: canvas video + the original mic audio.
  stream(): MediaStream {
    if (!this.out) {
      this.out = (this.canvas as any).captureStream(30) as MediaStream;
      this.audioTracks.forEach((t) => this.out!.addTrack(t));
    }
    return this.out;
  }

  stop() {
    cancelAnimationFrame(this.raf);
    try { (this.video.srcObject as MediaStream) = null as any; } catch {}
    try { this.segmenter?.close?.(); } catch {}
  }

  private coverVideo(ctx: CanvasRenderingContext2D, w: number, h: number) {
    coverSrc(ctx, this.video, this.video.videoWidth, this.video.videoHeight, w, h);
  }

  private render() {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.video.videoWidth) { ctx.fillStyle = "#0E0C0B"; ctx.fillRect(0, 0, this.W, this.H); return; }

    // Passthrough for "off" - and while the model is still loading, so the guest
    // never sees a blank frame.
    if (this.mode === "off" || !this.segReady) {
      this.coverVideo(ctx, this.W, this.H);
      if (this.mode !== "off" && !this.segReady) this.ensureSegmenter();
      return;
    }

    const IW = 640, IH = 360;
    const ictx = this.input.getContext("2d", { willReadFrequently: true });
    if (!ictx) { this.coverVideo(ctx, this.W, this.H); return; }
    coverSrc(ictx, this.video, this.video.videoWidth, this.video.videoHeight, IW, IH);

    let result: any;
    try { result = this.segmenter.segmentForVideo(this.input, performance.now()); }
    catch { this.coverVideo(ctx, this.W, this.H); return; }
    const mask = result?.confidenceMasks?.[0];
    if (!mask) { try { result?.close?.(); } catch {} this.coverVideo(ctx, this.W, this.H); return; }

    const floats = mask.getAsFloat32Array();
    const mw = mask.width, mh = mask.height;
    if (this.maskCanvas.width !== mw || this.maskCanvas.height !== mh) { this.maskCanvas.width = mw; this.maskCanvas.height = mh; }
    const mctx = this.maskCanvas.getContext("2d")!;
    const id = mctx.createImageData(mw, mh);
    const dd = id.data;
    for (let i = 0; i < floats.length; i++) { dd[i * 4] = 255; dd[i * 4 + 1] = 255; dd[i * 4 + 2] = 255; dd[i * 4 + 3] = Math.round(floats[i] * 255); }
    mctx.putImageData(id, 0, 0);
    try { result.close(); } catch {}

    // Background layer.
    if (this.mode === "blur") {
      ctx.save();
      (ctx as any).filter = "blur(14px)";
      this.coverVideo(ctx, this.W, this.H);
      ctx.restore();
    } else {
      ctx.fillStyle = "#0E0C0B";
      ctx.fillRect(0, 0, this.W, this.H);
      if (this.bgImg?.complete && this.bgImg.naturalWidth) coverSrc(ctx, this.bgImg, this.bgImg.naturalWidth, this.bgImg.naturalHeight, this.W, this.H);
    }

    // Person layer (sharp, full-res): mask the person out of the camera frame.
    const pctx = this.person.getContext("2d")!;
    pctx.globalCompositeOperation = "source-over";
    pctx.clearRect(0, 0, this.W, this.H);
    this.coverVideo(pctx, this.W, this.H);
    pctx.globalCompositeOperation = "destination-in";
    pctx.drawImage(this.maskCanvas, 0, 0, mw, mh, 0, 0, this.W, this.H);
    pctx.globalCompositeOperation = "source-over";
    ctx.drawImage(this.person, 0, 0);
  }

  // Lazily load MediaPipe's selfie segmentation model (CDN, on first use).
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
      try { this.segmenter = await vision.ImageSegmenter.createFromOptions(fileset, opts("GPU")); }
      catch { this.segmenter = await vision.ImageSegmenter.createFromOptions(fileset, opts("CPU")); }
      this.segReady = true;
      this.onReady?.(true);
    } catch {
      this.onReady?.(false);
    } finally {
      this.segLoading = false;
    }
  }
}
