"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RealtimeSession } from "@/lib/realtimeClient";
import LiveChat from "@/components/LiveChat";
import { GuestBackground, type BgMode } from "@/lib/guestBackground";

const WS_BASE = process.env.NEXT_PUBLIC_CHAT_WS_URL || "";
type AV = "both" | "video" | "audio" | "neither";
type Participant = { id: string; name: string; role: string; sessionId?: string; hasVideo: boolean; hasAudio: boolean };
type View = "everyone" | "me";

// A remote participant's live video/audio tile. Keeps its own <video> in sync
// with the (live) MediaStream it's given.
function RemoteTile({ stream, label }: { stream: MediaStream; label: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (ref.current) { ref.current.srcObject = stream; ref.current.play?.().catch(() => {}); }
  }, [stream]);
  return (
    <div className="green-tile">
      <video ref={ref} autoPlay playsInline />
      <span className="green-self-tag">{label}</span>
    </div>
  );
}

export default function GuestJoinPage() {
  const params = useParams<{ room: string }>();
  const room = `rt-${params.room}`;

  const [name, setName] = useState("");
  const [av, setAv] = useState<AV>("both");
  const [joined, setJoined] = useState(false);
  const [status, setStatus] = useState("");
  const [roster, setRoster] = useState<Participant[]>([]);
  // What the guest is looking at: the whole show (everyone) or just themselves.
  const [view, setView] = useState<View>("everyone");
  // Remote participants we're showing (host + other guests), by SFU session id.
  const [remotes, setRemotes] = useState<{ sid: string; name: string }[]>([]);
  // Local mic/camera controls (what the guest is publishing).
  const [hasMic, setHasMic] = useState(false);
  const [hasCam, setHasCam] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  // Guest-side background (blur / virtual background), processed on this device.
  const [bgMode, setBgMode] = useState<BgMode>("off");
  const [bgReady, setBgReady] = useState(false);

  const localVideo = useRef<HTMLVideoElement | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const remoteStreams = useRef<Map<string, MediaStream>>(new Map());
  const nameBySession = useRef<Map<string, string>>(new Map());
  const bg = useRef<GuestBackground | null>(null);
  const bgInput = useRef<HTMLInputElement | null>(null);
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
        // If they have a camera, route it through the background processor so
        // blur / virtual background can be applied on their own device.
        if (stream.getVideoTracks().length > 0) {
          const proc = new GuestBackground((r) => setBgReady(r));
          await proc.start(stream);
          bg.current = proc;
        }
      }
    } catch {
      setStatus("Camera/mic permission denied. You can still join with them off.");
    }

    let sessionId: string | undefined;
    try {
      // Separate each remote by SFU session id so we can show everyone, not
      // just merge them into one stream.
      const session = new RealtimeSession((sid, track) => {
        let ms = remoteStreams.current.get(sid);
        if (!ms) { ms = new MediaStream(); remoteStreams.current.set(sid, ms); }
        ms.addTrack(track);
        setRemotes((prev) => (prev.some((r) => r.sid === sid) ? [...prev] : [...prev, { sid, name: nameBySession.current.get(sid) || "Guest" }]));
      });
      rtc.current = session;
      // Publish the processed stream when a camera is in use, else the raw stream.
      const publishStream = bg.current ? bg.current.stream() : localStream.current;
      if (publishStream) {
        await session.publish(publishStream);
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
          // Pull EVERYONE else in the room (host + other guests), so the guest
          // can watch the whole show. Skip ourselves.
          const ownSid = rtc.current?.sessionId;
          (d.participants as Participant[]).forEach((p) => {
            if (!p.sessionId || p.sessionId === ownSid || subscribed.current.has(p.sessionId) || !rtc.current) return;
            subscribed.current.add(p.sessionId);
            nameBySession.current.set(p.sessionId, p.name + (p.role === "host" ? " (host)" : ""));
            rtc.current.pull(p.sessionId, ["video", "audio"]).catch(() => subscribed.current.delete(p.sessionId));
          });
          // Keep tile labels fresh if names arrived after the tracks.
          setRemotes((prev) => prev.map((r) => ({ ...r, name: nameBySession.current.get(r.sid) || r.name })));
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

  // (Re)attach the local preview whenever the joined view mounts or the guest
  // switches views (the <video> element remounts on a view change).
  useEffect(() => {
    if (!joined) return;
    const preview = bg.current ? bg.current.stream() : localStream.current;
    if (localVideo.current && preview) { localVideo.current.srcObject = preview; localVideo.current.play?.().catch(() => {}); }
  }, [joined, view]);

  // Leave the show: tear down the connection and return to the join screen.
  function leave() {
    try { ws.current?.close(); } catch {}
    try { rtc.current?.close(); } catch {}
    try { bg.current?.stop(); } catch {}
    bg.current = null;
    localStream.current?.getTracks().forEach((t) => t.stop());
    localStream.current = null;
    remoteStreams.current = new Map();
    nameBySession.current = new Map();
    subscribed.current = new Set();
    setRemotes([]);
    setRoster([]);
    setView("everyone");
    setBgMode("off");
    setBgReady(false);
    setJoined(false);
    setStatus("");
  }

  // Guest background controls (processed on-device).
  function pickBgMode(m: BgMode) {
    setBgMode(m);
    bg.current?.setMode(m);
  }
  function pickBgImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file || !bg.current) return;
    const reader = new FileReader();
    reader.onload = () => { bg.current!.setImage(String(reader.result || "")); bg.current!.setMode("image"); setBgMode("image"); };
    reader.readAsDataURL(file);
  }

  // Toggle the local mic / camera by enabling/disabling the published track.
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
          <p className="st">You&apos;ve been invited onto the show. Pick how you want to come in.</p>
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

  const selfTile = (
    <div className="green-tile">
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
  );

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
          {/* Guest view toggle: watch the whole show, or just yourself. */}
          <div className="filters" style={{ marginBottom: 12 }}>
            <button type="button" className={`filter-btn${view === "everyone" ? " active" : ""}`} onClick={() => setView("everyone")}>See everyone</button>
            <button type="button" className={`filter-btn${view === "me" ? " active" : ""}`} onClick={() => setView("me")}>Just me</button>
          </div>

          <div className="green-stage">
            {view === "me" ? (
              // Just me: your own camera fills the stage.
              <>
                {hasCam && camOn ? (
                  <video ref={localVideo} autoPlay playsInline muted className="green-host" />
                ) : (
                  <div className="green-wait">Your camera is off</div>
                )}
                <span className="green-self-tag" style={{ left: 12, right: "auto" }}>You</span>
              </>
            ) : (
              // Everyone: a grid of all participants (host + guests) plus you.
              <div
                style={{
                  position: "absolute", inset: 0, display: "grid", gap: 8, padding: 8,
                  gridTemplateColumns: `repeat(${Math.min(Math.max(remotes.length + 1, 1), 3)}, 1fr)`,
                  alignContent: "center",
                }}
              >
                {remotes.map((r) => (
                  <RemoteTile key={r.sid} stream={remoteStreams.current.get(r.sid) as MediaStream} label={r.name} />
                ))}
                {selfTile}
                {remotes.length === 0 && (
                  <div className="green-wait" style={{ gridColumn: "1 / -1" }}>Waiting for the host and other guests...</div>
                )}
              </div>
            )}

            {(hasMic || hasCam) && (
              <div className="green-controls">
                {hasMic && <button type="button" className={`green-ctrl${micOn ? "" : " off"}`} onClick={toggleMic}>{micOn ? "Mute" : "Unmute"}</button>}
                {hasCam && <button type="button" className={`green-ctrl${camOn ? "" : " off"}`} onClick={toggleCam}>{camOn ? "Camera off" : "Camera on"}</button>}
              </div>
            )}
          </div>

          <p className="form-ok" style={{ marginTop: 16 }}>{status}</p>

          {hasCam && (
            <div className="panel" style={{ marginTop: 20 }}>
              <div className="mod-row" style={{ alignItems: "center", marginBottom: 10 }}>
                <div>
                  <h3 style={{ margin: 0 }}>Background</h3>
                  <div className="panel-sub" style={{ marginBottom: 0 }}>
                    Runs on your device.{bgMode !== "off" && !bgReady ? " Loading the AI model..." : ""}
                  </div>
                </div>
              </div>
              <div className="filters" style={{ marginBottom: 0 }}>
                <button type="button" className={`filter-btn${bgMode === "off" ? " active" : ""}`} onClick={() => pickBgMode("off")}>Off</button>
                <button type="button" className={`filter-btn${bgMode === "blur" ? " active" : ""}`} onClick={() => pickBgMode("blur")}>Blur</button>
                <button type="button" className={`filter-btn${bgMode === "image" ? " active" : ""}`} onClick={() => bgInput.current?.click()}>Virtual background</button>
              </div>
              <input ref={bgInput} type="file" accept="image/*" hidden onChange={pickBgImage} />
            </div>
          )}

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

        <LiveChat asGuest={name.trim() || "Guest"} />
      </div>
    </div>
  );
}
