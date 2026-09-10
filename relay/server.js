// Simulcast relay.
//
// The browser studio publishes to Cloudflare over WebRTC (WHIP). Cloudflare will
// NOT forward a WebRTC input to its Live Outputs, so it cannot simulcast to
// YouTube on its own. This tiny service closes that gap: it pulls Cloudflare's
// HLS playback of the live broadcast and pushes it to YouTube/Facebook/Twitch
// over RTMP with ffmpeg `-c copy` (no re-encode -> almost no CPU).
//
// The Next.js app calls POST /start when the host goes live and POST /stop when
// they end. Everything is protected by a shared secret (RELAY_SECRET).
//
// No dependencies beyond Node 18+ and ffmpeg on PATH.

import http from "node:http";
import { spawn } from "node:child_process";

const PORT = Number(process.env.PORT || 8080);
const SECRET = process.env.RELAY_SECRET || "";
const RESTART_DELAY_MS = 3000; // HLS may not be ready the instant we go live; retry.
const MAX_RESTART_DELAY_MS = 15000;

// ---- Session state -------------------------------------------------------
// One active broadcast at a time. Each destination gets its own ffmpeg child so
// one platform failing (bad key) never takes the others down.
let session = null; // { hlsUrl, dests: Map<id, DestState> }

/** @typedef {{ id:string, target:string, proc:any, alive:boolean, restarts:number,
 *   backoff:number, lastError:string, timer:any, stopping:boolean }} DestState */

function joinUrlKey(url, key) {
  const u = String(url || "").trim().replace(/\/+$/, "");
  const k = String(key || "").trim();
  return k ? `${u}/${k}` : u;
}

function redact(target) {
  // Hide the stream key in logs/status (keep the last 4 chars).
  return target.replace(/\/([^/]{4})[^/]*$/, (_m, tail) => `/****${tail}`);
}

function log(...args) {
  // eslint-disable-next-line no-console
  console.log(new Date().toISOString(), ...args);
}

function spawnFfmpeg(hlsUrl, dest) {
  // -re: read input at native rate. Reconnect flags keep us resilient to the
  // HLS manifest briefly disappearing. -c copy: pass the H.264/AAC through
  // untouched (Cloudflare already encoded it) so this is nearly free on CPU.
  const args = [
    "-hide_banner",
    "-loglevel", "warning",
    "-re",
    "-reconnect", "1",
    "-reconnect_at_eof", "1",
    "-reconnect_streamed", "1",
    "-reconnect_delay_max", "5",
    "-i", hlsUrl,
    "-c", "copy",
    "-f", "flv",
    dest.target,
  ];
  const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
  dest.proc = proc;
  dest.alive = true;

  proc.stderr.on("data", (b) => {
    const line = b.toString().trim();
    if (line) dest.lastError = line.split("\n").pop().slice(0, 300);
  });

  proc.on("exit", (code, signal) => {
    dest.alive = false;
    dest.proc = null;
    if (dest.stopping || !session || !session.dests.has(dest.id)) return;
    // Unexpected exit while the broadcast is still live -> back off and retry.
    dest.restarts += 1;
    dest.backoff = Math.min(MAX_RESTART_DELAY_MS, (dest.backoff || RESTART_DELAY_MS) * 1.5);
    log(`ffmpeg exited (${signal || code}) for ${redact(dest.target)} - retry #${dest.restarts} in ${Math.round(dest.backoff)}ms`);
    dest.timer = setTimeout(() => {
      if (session && session.dests.has(dest.id) && !dest.stopping) spawnFfmpeg(session.hlsUrl, dest);
    }, dest.backoff);
  });

  log(`ffmpeg started -> ${redact(dest.target)}`);
}

function stopDest(dest) {
  dest.stopping = true;
  if (dest.timer) { clearTimeout(dest.timer); dest.timer = null; }
  if (dest.proc) {
    try { dest.proc.kill("SIGTERM"); } catch { /* already gone */ }
  }
}

function stopSession() {
  if (!session) return;
  for (const dest of session.dests.values()) stopDest(dest);
  session = null;
  log("session stopped");
}

function startSession(hlsUrl, destinations) {
  stopSession();
  session = { hlsUrl, dests: new Map() };
  for (const d of destinations) {
    const target = joinUrlKey(d.url, d.key);
    if (!target) continue;
    /** @type {DestState} */
    const dest = { id: String(d.id || target), target, proc: null, alive: false, restarts: 0, backoff: RESTART_DELAY_MS, lastError: "", timer: null, stopping: false };
    session.dests.set(dest.id, dest);
    spawnFfmpeg(hlsUrl, dest);
  }
  log(`session started -> ${session.dests.size} destination(s)`);
}

function statusPayload() {
  if (!session) return { live: false, destinations: [] };
  return {
    live: true,
    hls: session.hlsUrl,
    destinations: [...session.dests.values()].map((d) => ({
      id: d.id,
      target: redact(d.target),
      alive: d.alive,
      restarts: d.restarts,
      lastError: d.lastError || undefined,
    })),
  };
}

// ---- HTTP control API ----------------------------------------------------
function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) });
  res.end(data);
}

function authed(req) {
  if (!SECRET) return true; // no secret configured -> open (dev only)
  const h = req.headers["authorization"] || "";
  return h === `Bearer ${SECRET}`;
}

function readJson(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { resolve(null); } });
    req.on("error", () => resolve(null));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost`);
  const path = url.pathname;

  if (path === "/health") return send(res, 200, { ok: true });

  if (!authed(req)) return send(res, 401, { error: "Unauthorized" });

  if (path === "/status" && req.method === "GET") {
    return send(res, 200, statusPayload());
  }

  if (path === "/start" && req.method === "POST") {
    const body = await readJson(req);
    if (!body || !body.hlsUrl || !Array.isArray(body.destinations) || body.destinations.length === 0) {
      return send(res, 400, { error: "hlsUrl and non-empty destinations[] are required." });
    }
    startSession(String(body.hlsUrl), body.destinations);
    return send(res, 200, { ok: true, ...statusPayload() });
  }

  if (path === "/stop" && req.method === "POST") {
    stopSession();
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: "Not found" });
});

server.listen(PORT, () => log(`simulcast relay listening on :${PORT}`));

// Clean shutdown so ffmpeg children don't linger.
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => { stopSession(); process.exit(0); });
}
