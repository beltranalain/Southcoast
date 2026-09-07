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

  // Pull a remote participant's track (trackName "video"/"audio").
  async pull(remoteSessionId: string, trackName: string): Promise<void> {
    const d = await api("tracks", this.sessionId, {
      tracks: [{ location: "remote", sessionId: remoteSessionId, trackName }],
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
export async function whipPublish(whipUrl: string, stream: MediaStream): Promise<RTCPeerConnection> {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  stream.getTracks().forEach((t) => pc.addTrack(t, stream));
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
