"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RealtimeSession } from "@/lib/realtimeClient";

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

  const localVideo = useRef<HTMLVideoElement | null>(null);
  const hostVideo = useRef<HTMLVideoElement | null>(null);
  const localStream = useRef<MediaStream | null>(null);
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
        if (localVideo.current && wantVideo) localVideo.current.srcObject = stream;
      }
    } catch {
      setStatus("Camera/mic permission denied. You can still join with them off.");
    }

    let sessionId: string | undefined;
    try {
      const session = new RealtimeSession((sid, track) => {
        // show the host's video when it arrives
        if (hostVideo.current) {
          const ms = (hostVideo.current.srcObject as MediaStream) || new MediaStream();
          ms.addTrack(track);
          hostVideo.current.srcObject = ms;
        }
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
            rtc.current.pull(host.sessionId, "video").catch(() => {});
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
      <span className="eyebrow">Green room</span>
      <h1 className="anton" style={{ fontSize: "clamp(30px,5vw,52px)", marginBottom: 20 }}>You&apos;re in the show</h1>
      <div className="grid grid-2">
        <div>
          <div className="panel-sub">The host</div>
          <div className="player-wrap"><video ref={hostVideo} autoPlay playsInline /></div>
        </div>
        <div>
          <div className="panel-sub">You{av === "neither" ? " (camera off)" : ""}</div>
          <div className="player-wrap"><video ref={localVideo} autoPlay playsInline muted /></div>
        </div>
      </div>
      <p className="form-ok" style={{ marginTop: 16 }}>{status}</p>
      <div className="panel" style={{ marginTop: 24 }}>
        <h3>In the room</h3>
        {roster.map((p) => (
          <div className="dest-row" key={p.id}>
            <div><div className="dest-name">{p.name}{p.role === "host" ? " (host)" : ""}</div>
              <div className="dest-meta">{p.hasVideo ? "video" : "no video"} · {p.hasAudio ? "audio" : "muted"}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}
