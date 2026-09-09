"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RealtimeSession } from "@/lib/realtimeClient";
import LiveChat from "@/components/LiveChat";

const WS_BASE = process.env.NEXT_PUBLIC_CHAT_WS_URL || "";
type AV = "both" | "video" | "audio" | "neither";
type Participant = { id: string; name: string; role: string; sessionId?: string; hasVideo: boolean; hasAudio: boolean };

export default function GuestJoinPage() {
  const params = useParams<{ room: string }>();
  const room = `rt-${params.room}`;

  const [name, setName] = useState("");
  const [av, setAv] = useState<AV>("both");
  const [joined, setJoined] = useState(false);
  const [status, setStatus] = useState("");
  const [roster, setRoster] = useState<Participant[]>([]);
  const [hostLive, setHostLive] = useState(false);
  // Local mic/camera controls (what the guest is publishing).
  const [hasMic, setHasMic] = useState(false);
  const [hasCam, setHasCam] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  const localVideo = useRef<HTMLVideoElement | null>(null);
  const hostVideo = useRef<HTMLVideoElement | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const hostStream = useRef<MediaStream | null>(null);
  const rtc = useRef<RealtimeSession | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const meId = useRef<string>("");
  const subscribed = useRef<Set<string>>(new Set());

  async function join() {
    setStatus("Joining...");
    meId.current = crypto.randomUUID();
    const wantVideo = av === "both" || av === "video";
    const wantAudio = av === "both" || av === "audio";

    try {
      if (wantVideo || wantAudio) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: wantVideo, audio: wantAudio });
        localStream.current = stream;
        setHasMic(stream.getAudioTracks().length > 0);
        setHasCam(stream.getVideoTracks().length > 0);
        if (localVideo.current && wantVideo) localVideo.current.srcObject = stream;
      }
    } catch {
      setStatus("Camera/mic permission denied. You can still join with them off.");
    }

    let sessionId: string | undefined;
    try {
      const session = new RealtimeSession((_sid, track) => {
        // Accumulate the host's video + audio into one stream and show it.
        const ms = hostStream.current || new MediaStream();
        ms.addTrack(track);
        hostStream.current = ms;
        if (track.kind === "video") setHostLive(true);
        if (hostVideo.current) { hostVideo.current.srcObject = ms; hostVideo.current.play?.().catch(() => {}); }
      });
      rtc.current = session;
      if (localStream.current) {
        await session.publish(localStream.current);
        sessionId = session.sessionId; // set by publish (Cloudflare creates the session there)
      }
    } catch {
      // Realtime not configured / no media - still join the room roster.
    }

    const participant: Participant = {
      id: meId.current, name: name.trim() || "Guest", role: "guest",
      sessionId, hasVideo: wantVideo, hasAudio: wantAudio,
    };

    if (WS_BASE) {
      const sock = new WebSocket(`${WS_BASE}/room/${room}/ws`);
      ws.current = sock;
      sock.onopen = () => sock.send(JSON.stringify({ type: "studio", action: "join", participant }));
      sock.onmessage = (e) => {
        let d: any; try { d = JSON.parse(e.data); } catch { return; }
        if (d.type === "studio" && d.action === "roster") {
          setRoster(d.participants);
          // subscribe to the host's video
          const host = d.participants.find((p: Participant) => p.role === "host" && p.sessionId);
          if (host && !subscribed.current.has(host.sessionId) && rtc.current) {
            subscribed.current.add(host.sessionId);
            // Pull the host's video + audio together so the guest can see AND
            // hear the host (one serialized negotiation).
            rtc.current.pull(host.sessionId, ["video", "audio"]).catch(() => {});
          }
        }
      };
    }

    setJoined(true);
    setStatus("You're in. The host can see you and will bring you on air.");
  }

  useEffect(() => {
    return () => {
      ws.current?.close();
      rtc.current?.close();
      localStream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Attach the local + host streams once the joined view has mounted. The video
  // elements don't exist until then, so setting srcObject during join() is too
  // early - that's what left the previews black.
  useEffect(() => {
    if (!joined) return;
    if (localVideo.current && localStream.current) { localVideo.current.srcObject = localStream.current; localVideo.current.play?.().catch(() => {}); }
    if (hostVideo.current && hostStream.current) { hostVideo.current.srcObject = hostStream.current; hostVideo.current.play?.().catch(() => {}); }
  }, [joined]);

  // Leave the show: tear down the connection and return to the join screen.
  function leave() {
    try { ws.current?.close(); } catch {}
    try { rtc.current?.close(); } catch {}
    localStream.current?.getTracks().forEach((t) => t.stop());
    localStream.current = null;
    hostStream.current = null;
    subscribed.current = new Set();
    setRoster([]);
    setHostLive(false);
    setJoined(false);
    setStatus("");
  }

  // Toggle the local mic / camera by enabling/disabling the published track
  // (keeps the connection and the track's slot; just stops sending media).
  function toggleMic() {
    const track = localStream.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
  }
  function toggleCam() {
    const track = localStream.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCamOn(track.enabled);
  }

  if (!joined) {
    return (
      <div className="signin-wrap">
        <div className="signin-card" style={{ maxWidth: 460 }}>
          <h2 className="anton" style={{ fontSize: "2rem", textAlign: "center" }}>Join the show</h2>
          <p className="st">You&apos;ve been invited onto Cane with a Camera. Pick how you want to come in.</p>
          <div className="form-field"><label>Your name</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></div>
          <div className="form-field">
            <label>Camera &amp; mic</label>
            <div className="filters" style={{ marginBottom: 0 }}>
              {(["both", "video", "audio", "neither"] as AV[]).map((opt) => (
                <button key={opt} type="button" className={`filter-btn${av === opt ? " active" : ""}`} onClick={() => setAv(opt)}>
                  {opt === "both" ? "Video + audio" : opt === "video" ? "Video only" : opt === "audio" ? "Audio only" : "Neither"}
                </button>
              ))}
            </div>
          </div>
          <button className="btn btn-primary" style={{ width: "100%" }} onClick={join}>Join the show</button>
          {status && <p className="form-note">{status}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="wrap" style={{ paddingTop: 40, paddingBottom: 60 }}>
      <div className="green-head">
        <div>
          <span className="eyebrow">Green room</span>
          <h1 className="anton" style={{ fontSize: "clamp(28px,5vw,48px)", marginBottom: 4 }}>You&apos;re in the show</h1>
        </div>
        <button className="btn btn-ghost" type="button" onClick={leave}>Leave the show</button>
      </div>

      <div className="livegrid">
        <div>
          {/* One stage: the host fills it; your own camera sits in the corner. */}
          <div className="green-stage">
            <video ref={hostVideo} autoPlay playsInline className="green-host" />
            {!hostLive && <div className="green-wait">Connecting to the host...</div>}
            <div className="green-self">
              {hasCam ? (
                <>
                  <video ref={localVideo} autoPlay playsInline muted style={{ display: camOn ? "block" : "none" }} />
                  {!camOn && <div className="green-self-off">Camera off</div>}
                </>
              ) : (
                <div className="green-self-off">Camera off</div>
              )}
              <span className="green-self-tag">You</span>
            </div>
            {(hasMic || hasCam) && (
              <div className="green-controls">
                {hasMic && <button type="button" className={`green-ctrl${micOn ? "" : " off"}`} onClick={toggleMic}>{micOn ? "Mute" : "Unmute"}</button>}
                {hasCam && <button type="button" className={`green-ctrl${camOn ? "" : " off"}`} onClick={toggleCam}>{camOn ? "Camera off" : "Camera on"}</button>}
              </div>
            )}
          </div>

          <p className="form-ok" style={{ marginTop: 16 }}>{status}</p>

          <div className="panel" style={{ marginTop: 20 }}>
            <h3>In the room</h3>
            {roster.map((p) => (
              <div className="dest-row" key={p.id}>
                <div><div className="dest-name">{p.name}{p.role === "host" ? " (host)" : ""}</div>
                  <div className="dest-meta">{p.hasVideo ? "video" : "no video"} · {p.hasAudio ? "audio" : "muted"}</div></div>
              </div>
            ))}
          </div>
        </div>

        <LiveChat />
      </div>
    </div>
  );
}
