// Simulcast relay (WebRTC edition).
//
// The browser studio publishes to Cloudflare over WebRTC (WHIP). A WebRTC
// broadcast on Cloudflare has NO HLS/DASH file - it is playable only over
// WebRTC (WHEP). So to simulcast to YouTube without OBS we must speak WebRTC.
//
// Pipeline:
//   Cloudflare WHEP  --(MediaMTX pulls it)-->  local RTSP  --(ffmpeg)-->  RTMP -> YouTube/etc.
//
// MediaMTX does the hard WebRTC part (as a WHEP client) and re-serves the
// stream on localhost RTSP. ffmpeg copies the H.264 video through and
// transcodes the Opus audio to AAC (cheap) for RTMP/FLV.
//
// The Next.js app calls POST /start (with the Cloudflare WHEP URL) when the
// host goes live, and POST /stop when they end. Protected by RELAY_SECRET.

import http from "node:http";
import { spawn } from "node:child_process";

// ---- Output profile -------------------------------------------------------
// YouTube's ingest is built around CBR with a 2-second CLOSED GOP; it uses that
// to build its quality ladder. WebRTC emits keyframes on demand, at irregular
// intervals, with no fixed GOP. So "-c copy" hands YouTube a stream it cannot
// segment, and YouTube responds by serving a low rendition - the stream looks
// fine on our own site (WebRTC playback ignores GOP) and terrible on YouTube.
//
// We therefore ALWAYS re-encode for RTMP, once, with an explicit GOP, and fan
// the single encode out to every destination with ffmpeg's tee muxer. One
// encode for N destinations instead of N encodes.
const OUT_W = Number(process.env.OUT_WIDTH || 1280);
const OUT_H = Number(process.env.OUT_HEIGHT || 720);
const OUT_FPS = Number(process.env.OUT_FPS || 30);
const OUT_KBPS = Number(process.env.OUT_BITRATE_KBPS || 4500);
const GOP = OUT_FPS * 2; // 2 seconds, as YouTube expects

const PORT = Number(process.env.PORT || 8080);
const SECRET = process.env.RELAY_SECRET || "";
const MTX_API = "http://127.0.0.1:9997";
const RTSP_PATH = "live"; // single broadcast at a time
const RTSP_URL = `rtsp://127.0.0.1:8554/${RTSP_PATH}`;
const RESTART_DELAY_MS = 3000;
const MAX_RESTART_DELAY_MS = 15000;

let session = null; // { whep, dests: Map<id, DestState> }
let mtxReady = false;

function log(...a) { console.log(new Date().toISOString(), ...a); }

function joinUrlKey(url, key) {
  const u = String(url || "").trim().replace(/\/+$/, "");
  const k = String(key || "").trim();
  return k ? `${u}/${k}` : u;
}
function redact(target) {
  return target.replace(/\/([^/]{4})[^/]*$/, (_m, t) => `/****${t}`);
}
// Cloudflare gives us an https WHEP URL; MediaMTX wants the wheps:// scheme.
function toWheps(whep) {
  return String(whep || "").trim().replace(/^https:\/\//, "wheps://").replace(/^http:\/\//, "whep://");
}

// ---- MediaMTX (WHEP client) -------------------------------------------------
function startMediaMtx() {
  const proc = spawn("mediamtx", ["/app/mediamtx.yml"], { stdio: ["ignore", "inherit", "inherit"] });
  proc.on("exit", (code) => { log(`mediamtx exited (${code}) - restarting in 2s`); mtxReady = false; setTimeout(startMediaMtx, 2000); });
  waitForMtx();
}
async function waitForMtx() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${MTX_API}/v3/config/global/get`);
      if (r.ok) { mtxReady = true; log("mediamtx API ready"); return; }
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  log("mediamtx API did not become ready in time");
}

async function mtxAddSource(whepUrl) {
  const source = toWheps(whepUrl);
  // Clean slate: delete any existing path, then add. Not on-demand: we connect
  // immediately so we can probe the incoming video codec before starting ffmpeg.
  try { await fetch(`${MTX_API}/v3/config/paths/delete/${RTSP_PATH}`, { method: "DELETE" }); } catch { /* ignore */ }
  const body = JSON.stringify({ source, sourceOnDemand: false });
  const r = await fetch(`${MTX_API}/v3/config/paths/add/${RTSP_PATH}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body,
  });
  if (!r.ok) throw new Error(`mediamtx add path failed: ${r.status} ${await r.text().catch(() => "")}`);
  log(`mediamtx pulling WHEP source`);
}
async function mtxRemoveSource() {
  try { await fetch(`${MTX_API}/v3/config/paths/delete/${RTSP_PATH}`, { method: "DELETE" }); } catch { /* ignore */ }
}

// Wait for the source to come online and report its video codec ("h264" or
// "vp8"). Defaults to "vp8" (re-encode) so we never send YouTube a codec it
// can't read.
async function mtxVideoCodec() {
  for (let i = 0; i < 25; i++) {
    try {
      const r = await fetch(`${MTX_API}/v3/paths/get/${RTSP_PATH}`);
      if (r.ok) {
        const d = await r.json();
        const tracks = (d.tracks || []).join(",").toLowerCase();
        if (d.ready && tracks) {
          if (tracks.includes("h264") || tracks.includes("h.264") || tracks.includes("avc")) return "h264";
          return "vp8";
        }
      }
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return "vp8";
}

// ---- ffmpeg: one encode, tee'd to every destination -------------------------
// `onfail=ignore` keeps a bad YouTube key from killing Facebook and, more
// importantly, from killing the copy that feeds our own site.
function teeTarget(dests) {
  // SRT destinations (Cloudflare input B) carry MPEG-TS; RTMP destinations
  // (YouTube/Facebook) carry FLV. onfail=ignore so one bad destination can't
  // take down the others.
  return dests.map((d) => {
    const fmt = d.target.startsWith("srt://") ? "mpegts" : "flv";
    return `[f=${fmt}:onfail=ignore]${d.target}`;
  }).join("|");
}

function spawnPipeline() {
  if (!session || session.dests.size === 0) return;
  const dests = [...session.dests.values()];
  const args = [
    "-hide_banner", "-loglevel", "warning",
    "-rtsp_transport", "tcp",
    "-fflags", "+genpts",
    "-i", RTSP_URL,
    "-map", "0:v:0", "-map", "0:a:0?",
    // Video: CBR, fixed 2s closed GOP, constant frame rate. This is the part
    // that makes YouTube serve full resolution instead of a low rendition.
    "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "high",
    "-pix_fmt", "yuv420p",
    "-vf", `scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=decrease,pad=${OUT_W}:${OUT_H}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
    "-r", String(OUT_FPS),
    "-g", String(GOP), "-keyint_min", String(GOP), "-sc_threshold", "0",
    "-b:v", `${OUT_KBPS}k`, "-minrate", `${OUT_KBPS}k`, "-maxrate", `${OUT_KBPS}k`,
    "-bufsize", `${OUT_KBPS * 2}k`,
    "-x264-params", "nal-hrd=cbr:force-cfr=1",
    "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
    "-max_muxing_queue_size", "1024",
    // No global_header: flv writes its AVC sequence header from extradata
    // anyway, and mpegts (SRT/input B) needs in-band SPS/PPS to segment cleanly.
    "-f", "tee", teeTarget(dests),
  ];
  const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
  session.proc = proc;
  session.alive = true;
  proc.stderr.on("data", (b) => {
    const text = b.toString();
    for (const line of text.split("\n")) { const t = line.trim(); if (t) log(`ffmpeg ${t}`); }
    const last = text.trim().split("\n").pop();
    if (last && session) session.lastError = last.slice(0, 300);
  });
  proc.on("exit", (code, signal) => {
    session && (session.alive = false, session.proc = null);
    if (!session || session.stopping) return;
    session.restarts += 1;
    session.backoff = Math.min(MAX_RESTART_DELAY_MS, (session.backoff || RESTART_DELAY_MS) * 1.5);
    log(`ffmpeg exited (${signal || code}) - retry #${session.restarts} in ${Math.round(session.backoff)}ms`);
    session.timer = setTimeout(() => { if (session && !session.stopping) spawnPipeline(); }, session.backoff);
  });
  log(`ffmpeg started: ${OUT_W}x${OUT_H}@${OUT_FPS} ${OUT_KBPS}k CBR, GOP ${GOP} -> ${dests.length} destination(s)`);
}

async function startSession(whepUrl, destinations) {
  await stopSession();
  await mtxAddSource(whepUrl);
  session = { whep: whepUrl, dests: new Map(), vcodec: "vp8", proc: null, alive: false, restarts: 0, backoff: RESTART_DELAY_MS, lastError: "", timer: null, stopping: false };
  // Still probed, purely so the studio can warn when the browser failed to
  // negotiate H.264 (a VP8 source means an extra decode on the way in).
  session.vcodec = await mtxVideoCodec();
  log(`source video codec: ${session.vcodec}`);
  for (const d of destinations) {
    const target = joinUrlKey(d.url, d.key);
    if (!target) continue;
    session.dests.set(String(d.id || target), { id: String(d.id || target), target });
  }
  spawnPipeline();
  log(`session started -> ${session.dests.size} destination(s)`);
}

async function stopSession() {
  if (session) {
    session.stopping = true;
    if (session.timer) clearTimeout(session.timer);
    if (session.proc) { try { session.proc.kill("SIGTERM"); } catch { /* gone */ } }
    session = null;
    log("session stopped");
  }
  await mtxRemoveSource();
}

function statusPayload() {
  if (!session) return { live: false, mtxReady, destinations: [] };
  return {
    live: true,
    mtxReady,
    whep: session.whep,
    vcodec: session.vcodec,
    encode: `${OUT_W}x${OUT_H}@${OUT_FPS} ${OUT_KBPS}k CBR gop${GOP}`,
    restarts: session.restarts,
    // One pipeline feeds every destination, so they share liveness. tee's
    // onfail=ignore means one bad key does not take the others down.
    destinations: [...session.dests.values()].map((d) => ({
      id: d.id,
      target: redact(d.target),
      alive: session.alive,
      restarts: session.restarts,
      lastError: session.lastError || undefined,
    })),
  };
}

// ---- HTTP control API -------------------------------------------------------
function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) });
  res.end(data);
}
function authed(req) {
  if (!SECRET) return true;
  return (req.headers["authorization"] || "") === `Bearer ${SECRET}`;
}
function readJson(req) {
  return new Promise((resolve) => {
    let raw = ""; req.on("data", (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { resolve(null); } });
    req.on("error", () => resolve(null));
  });
}

const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  if (path === "/health") return send(res, 200, { ok: true, mtxReady });
  if (!authed(req)) return send(res, 401, { error: "Unauthorized" });

  if (path === "/status" && req.method === "GET") return send(res, 200, statusPayload());

  if (path === "/start" && req.method === "POST") {
    const body = await readJson(req);
    const whep = body && (body.whepUrl || body.sourceUrl || body.hlsUrl);
    if (!whep || !Array.isArray(body.destinations) || body.destinations.length === 0) {
      return send(res, 400, { error: "whepUrl and non-empty destinations[] are required." });
    }
    if (!mtxReady) return send(res, 503, { error: "Relay warming up, try again in a moment." });
    try { await startSession(String(whep), body.destinations); }
    catch (e) { return send(res, 500, { error: String(e.message || e) }); }
    return send(res, 200, { ok: true, ...statusPayload() });
  }

  if (path === "/stop" && req.method === "POST") { await stopSession(); return send(res, 200, { ok: true }); }

  return send(res, 404, { error: "Not found" });
});

// Never let a stray error take the whole relay down mid-broadcast. Log and
// keep serving; the ffmpeg auto-restart handles pipeline recovery.
process.on("uncaughtException", (e) => log("uncaughtException:", e?.message || e));
process.on("unhandledRejection", (e) => log("unhandledRejection:", (e && e.message) || e));

startMediaMtx();
server.listen(PORT, () => log(`simulcast relay listening on :${PORT}`));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, async () => { await stopSession(); process.exit(0); });
