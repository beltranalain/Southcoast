// Client-side Cloudflare Realtime (Calls) session: one RTCPeerConnection that
// publishes local tracks and pulls remote tracks through the SFU. All calls to
// Cloudflare go through our /api/realtime proxy.

export type RemoteTrackHandler = (sessionId: string, track: MediaStreamTrack) => void;

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
  bundlePolicy: "max-bundle",
};

function api(action: string, sessionId?: string, body?: unknown) {
  return fetch("/api/realtime", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, sessionId, body }),
  }).then((r) => r.json());
}

function iceComplete(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const check = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", check);
    setTimeout(resolve, 2500);
  });
}

export class RealtimeSession {
  pc: RTCPeerConnection;
  sessionId = "";
  private midToSession = new Map<string, string>();
  // Serialize renegotiations: a single RTCPeerConnection can only run one
  // offer/answer exchange at a time. Concurrent pulls (e.g. a guest's video +
  // audio, or admitting several guests at once) would otherwise collide (glare)
  // and silently fail. Every pull runs through this chain, one after another.
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private onRemoteTrack: RemoteTrackHandler) {
    this.pc = new RTCPeerConnection(RTC_CONFIG);
    this.pc.ontrack = (e) => {
      const mid = e.transceiver.mid || "";
      const sid = this.midToSession.get(mid) || "unknown";
      this.onRemoteTrack(sid, e.track);
    };
  }

  // Deprecated: the session is created during publish() (Cloudflare requires an
  // offer on sessions/new). Kept so older callers don't break.
  async create(): Promise<string> {
    return this.sessionId;
  }

  // Publish local audio/video. Creates the SFU session (with the offer) and then
  // registers the track names. Returns the track names ("video"/"audio").
  async publish(stream: MediaStream): Promise<string[]> {
    const entries = stream.getTracks().map((t) => ({
      trackName: t.kind, // "audio" | "video"
      transceiver: this.pc.addTransceiver(t, { direction: "sendonly" }),
    }));

    // 1) Create the session WITH an offer that carries the transceivers.
    await this.pc.setLocalDescription(await this.pc.createOffer());
    await iceComplete(this.pc);
    const sess = await api("session", undefined, {
      sessionDescription: { type: "offer", sdp: this.pc.localDescription!.sdp },
    });
    if (!sess?.sessionId) throw new Error("Realtime session failed (is it configured?)");
    this.sessionId = sess.sessionId;
    if (sess.sessionDescription) await this.pc.setRemoteDescription(sess.sessionDescription);

    // 2) Register the track names (mid -> trackName) with a fresh offer.
    const tracks = entries.map((e) => ({ location: "local", mid: e.transceiver.mid, trackName: e.trackName }));
    await this.pc.setLocalDescription(await this.pc.createOffer());
    const d = await api("tracks", this.sessionId, {
      sessionDescription: { type: "offer", sdp: this.pc.localDescription!.sdp },
      tracks,
    });
    if (d?.sessionDescription) await this.pc.setRemoteDescription(d.sessionDescription);
    return entries.map((e) => e.trackName);
  }

  // Pull one or more of a remote participant's tracks ("video"/"audio").
  // Pass an array to pull both in a SINGLE negotiation (avoids a second
  // renegotiation and the glare it can cause). Runs on the serialized chain.
  async pull(remoteSessionId: string, trackName: string | string[]): Promise<void> {
    const names = Array.isArray(trackName) ? trackName : [trackName];
    const run = this.chain.then(() => this.doPull(remoteSessionId, names));
    this.chain = run.catch(() => {}); // keep the chain alive even if one pull fails
    return run;
  }

  private async doPull(remoteSessionId: string, names: string[]): Promise<void> {
    const d = await api("tracks", this.sessionId, {
      tracks: names.map((trackName) => ({ location: "remote", sessionId: remoteSessionId, trackName })),
    });
    (d?.tracks || []).forEach((t: any) => {
      if (t.mid) this.midToSession.set(t.mid, remoteSessionId);
    });
    if (d?.requiresImmediateRenegotiation && d?.sessionDescription) {
      await this.pc.setRemoteDescription(d.sessionDescription);
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      await api("renegotiate", this.sessionId, {
        sessionDescription: { type: "answer", sdp: this.pc.localDescription!.sdp },
      });
    }
  }

  close() {
    try { this.pc.close(); } catch {}
  }
}

// Publish a MediaStream (e.g. the composited canvas + mixed audio) to a
// Cloudflare Stream Live Input over WHIP. Returns the RTCPeerConnection.
export async function whipPublish(whipUrl: string, stream: MediaStream, maxKbps = 6000): Promise<RTCPeerConnection> {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  stream.getTracks().forEach((t) => pc.addTrack(t, stream));
  // Prefer H.264 so Cloudflare ingests H.264 (not VP8). The relay can then copy
  // the video straight to YouTube instead of re-encoding it - no second lossy
  // pass, so it looks noticeably sharper (and costs less CPU). Falls back to
  // the browser default if H.264 isn't offered.
  try {
    const vtrans = pc.getTransceivers().find((tr) => tr.sender?.track?.kind === "video");
    const caps = typeof RTCRtpSender !== "undefined" ? RTCRtpSender.getCapabilities("video") : null;
    if (vtrans && caps?.codecs && typeof vtrans.setCodecPreferences === "function") {
      const h264 = caps.codecs.filter((c) => c.mimeType.toLowerCase() === "video/h264");
      const rest = caps.codecs.filter((c) => c.mimeType.toLowerCase() !== "video/h264");
      if (h264.length) vtrans.setCodecPreferences([...h264, ...rest]);
    }
  } catch { /* keep default codec order */ }
  // WebRTC defaults to a low, conservative bitrate which looks soft at 720p.
  // Raise the ceiling and keep resolution over framerate under pressure.
  const vsender = pc.getSenders().find((s) => s.track?.kind === "video");
  if (vsender) {
    try { (vsender.track as MediaStreamTrack & { contentHint: string }).contentHint = "detail"; } catch { /* not supported */ }
    try {
      const params = vsender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      params.encodings[0].maxBitrate = maxKbps * 1000;
      params.encodings[0].maxFramerate = 30;
      (params as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference = "maintain-resolution";
      await vsender.setParameters(params);
    } catch { /* best-effort */ }
  }
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await iceComplete(pc);
  const res = await fetch(whipUrl, {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: pc.localDescription!.sdp,
  });
  if (!res.ok) throw new Error(`WHIP ingest returned ${res.status}`);
  await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
  return pc;
}
