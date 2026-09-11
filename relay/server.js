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

// ---- ffmpeg pipelines -------------------------------------------------------
// Two independent pipelines share the one WHEP source:
//  - "external": one CBR / 2s-GOP encode tee'd to YouTube/Facebook (RTMP/FLV).
//    That fixed GOP is what makes YouTube serve full resolution.
//  - "cf-playback": Cloudflare input B over SRT (its own process - SRT cannot
//    ride inside ffmpeg's tee muxer). H.264 is copied through (Cloudflare's HLS
//    tolerates the WebRTC GOP), transcoded only if the source is VP8.
const SCALE_VF = `scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=decrease,pad=${OUT_W}:${OUT_H}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`;
const ENCODE_V = [
  "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "high", "-pix_fmt", "yuv420p",
  "-vf", SCALE_VF, "-r", String(OUT_FPS),
  "-g", String(GOP), "-keyint_min", String(GOP), "-sc_threshold", "0",
  "-b:v", `${OUT_KBPS}k`, "-minrate", `${OUT_KBPS}k`, "-maxrate", `${OUT_KBPS}k`, "-bufsize", `${OUT_KBPS * 2}k`,
  "-x264-params", "nal-hrd=cbr:force-cfr=1",
];
const IN_ARGS = ["-hide_banner", "-loglevel", "warning", "-rtsp_transport", "tcp", "-fflags", "+genpts", "-i", RTSP_URL, "-map", "0:v:0", "-map", "0:a:0?"];
const AUDIO_ARGS = ["-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", "-max_muxing_queue_size", "1024"];

function externalArgs(dests) {
  const tee = dests.map((d) => `[f=flv:onfail=ignore]${d.target}`).join("|");
  return [...IN_ARGS, ...ENCODE_V, ...AUDIO_ARGS, "-f", "tee", tee];
}
function playbackArgs(target /* , vcodec */) {
  // Always re-encode for input B. Copying the WHEP H.264 into MPEG-TS drops the
  // in-band SPS/PPS ("non-existing PPS 0 referenced"), so Cloudflare gets an
  // undecodable stream. Encoding emits clean parameter sets (the path that
  // connected in testing). Cloudflare's HLS doesn't need the strict CBR/GOP,
  // but reusing it is fine and keeps one code path.
  return [...IN_ARGS, ...ENCODE_V, ...AUDIO_ARGS, "-f", "mpegts", target];
}

function spawnPipe(pipe) {
  const proc = spawn("ffmpeg", pipe.args, { stdio: ["ignore", "ignore", "pipe"] });
  pipe.proc = proc; pipe.alive = true;
  proc.stderr.on("data", (b) => {
    const text = b.toString();
    for (const line of text.split("\n")) { const t = line.trim(); if (t) log(`ffmpeg[${pipe.id}] ${t}`); }
    const last = text.trim().split("\n").pop();
    if (last) pipe.lastError = last.slice(0, 300);
  });
  proc.on("exit", (code, signal) => {
    pipe.alive = false; pipe.proc = null;
    if (pipe.stopping || !session) return;
    pipe.restarts += 1;
    pipe.backoff = Math.min(MAX_RESTART_DELAY_MS, (pipe.backoff || RESTART_DELAY_MS) * 1.5);
    log(`ffmpeg[${pipe.id}] exited (${signal || code}) - retry #${pipe.restarts} in ${Math.round(pipe.backoff)}ms`);
    pipe.timer = setTimeout(() => { if (!pipe.stopping && session) spawnPipe(pipe); }, pipe.backoff);
  });
  log(`ffmpeg[${pipe.id}] started`);
}

async function startSession(whepUrl, destinations) {
  await stopSession();
  await mtxAddSource(whepUrl);
  session = { whep: whepUrl, vcodec: "vp8", pipes: new Map() };
  session.vcodec = await mtxVideoCodec();
  log(`source video codec: ${session.vcodec}`);

  const external = [], playback = [];
  for (const d of destinations) {
    const target = joinUrlKey(d.url, d.key);
    if (!target) continue;
    if (d.id === "cf-playback" || target.startsWith("srt://")) playback.push({ id: String(d.id || target), target });
    else external.push({ id: String(d.id || target), target });
  }

  function mkPipe(id, args, extra) {
    return { id, args, proc: null, alive: false, restarts: 0, backoff: RESTART_DELAY_MS, lastError: "", timer: null, stopping: false, ...extra };
  }
  if (external.length) {
    const pipe = mkPipe("external", externalArgs(external), { dests: external });
    session.pipes.set("external", pipe); spawnPipe(pipe);
  }
  for (const p of playback) {
    const pipe = mkPipe(p.id, playbackArgs(p.target, session.vcodec), { target: p.target });
    session.pipes.set(p.id, pipe); spawnPipe(pipe);
  }
  log(`session started -> ${external.length} external + ${playback.length} playback`);
}

async function stopSession() {
  if (session) {
    for (const p of session.pipes.values()) {
      p.stopping = true;
      if (p.timer) clearTimeout(p.timer);
      if (p.proc) { try { p.proc.kill("SIGTERM"); } catch { /* gone */ } }
    }
    session = null;
    log("session stopped");
  }
  await mtxRemoveSource();
}

function statusPayload() {
  if (!session) return { live: false, mtxReady, destinations: [] };
  const destinations = [];
  for (const p of session.pipes.values()) {
    if (p.dests) {
      for (const d of p.dests) destinations.push({ id: d.id, target: redact(d.target), alive: p.alive, restarts: p.restarts, lastError: p.lastError || undefined });
    } else {
      destinations.push({ id: p.id, target: redact(p.target), alive: p.alive, restarts: p.restarts, lastError: p.lastError || undefined });
    }
  }
  return {
    live: true, mtxReady, whep: session.whep, vcodec: session.vcodec,
    encode: `${OUT_W}x${OUT_H}@${OUT_FPS} ${OUT_KBPS}k CBR gop${GOP}`,
    destinations,
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
