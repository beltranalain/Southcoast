"use client";

import { useEffect, useRef, useState } from "react";
import { getIdToken } from "@/lib/firebase";

type Ingest = { whipUrl: string; rtmpsUrl: string; streamKey: string; uid: string };

// Wait for ICE gathering to finish so we can send a complete SDP (non-trickle WHIP).
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

export default function GoLiveStudio() {
  const [status, setStatus] = useState<"idle" | "ready" | "connecting" | "live" | "error">("idle");
  const [message, setMessage] = useState("");
  const [streamReady, setStreamReady] = useState<boolean | null>(null);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const ingestRef = useRef<Ingest | null>(null);

  // Start the camera preview + enumerate devices.
  async function startCamera(camId?: string, micId?: string) {
    try {
      localStream.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: camId ? { deviceId: { exact: camId } } : true,
        audio: micId ? { deviceId: { exact: micId } } : true,
      });
      localStream.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCams(devices.filter((d) => d.kind === "videoinput"));
      setMics(devices.filter((d) => d.kind === "audioinput"));
      setStatus((s) => (s === "live" ? s : "ready"));
    } catch {
      setStatus("error");
      setMessage("Camera/microphone access is needed to go live. Allow it in your browser.");
    }
  }

  // Check whether Cloudflare Stream is connected (and cache the WHIP url).
  async function checkStream() {
    try {
      const token = await getIdToken();
      const res = await fetch("/api/stream/ingest", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      const data = await res.json();
      if (data.configured && data.ingest?.whipUrl) {
        ingestRef.current = data.ingest;
        setStreamReady(true);
      } else {
        setStreamReady(false);
      }
    } catch {
      setStreamReady(false);
    }
  }

  useEffect(() => {
    startCamera();
    checkStream();
    return () => {
      pcRef.current?.close();
      localStream.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function goLive() {
    if (!localStream.current || !ingestRef.current?.whipUrl) return;
    setStatus("connecting");
    setMessage("");
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
      });
      pcRef.current = pc;
      localStream.current.getTracks().forEach((t) => pc.addTrack(t, localStream.current!));
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") setStatus("live");
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          setStatus("error");
          setMessage("Connection dropped. Try going live again.");
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await iceComplete(pc);

      const res = await fetch(ingestRef.current.whipUrl, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: pc.localDescription!.sdp,
      });
      if (!res.ok) throw new Error(`Ingest returned ${res.status}`);
      const answer = await res.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
      setStatus("live");
      setMessage("You are live on your site and simulcasting to YouTube.");
    } catch (e: any) {
      setStatus("error");
      setMessage(e.message || "Could not start the broadcast.");
      pcRef.current?.close();
      pcRef.current = null;
    }
  }

  function stopLive() {
    pcRef.current?.close();
    pcRef.current = null;
    setStatus("ready");
    setMessage("Broadcast stopped. The recording was saved to your library.");
  }

  const live = status === "live";

  return (
    <div className="panel">
      <h3>Browser studio - Go Live</h3>
      <div className="panel-sub">Stream straight from this browser. No software to install.</div>

      <div className="golive-preview" style={{ padding: 0, overflow: "hidden" }}>
        <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>

      <div className="panel-split" style={{ marginTop: 14 }}>
        <div className="form-field">
          <label>Camera</label>
          <select onChange={(e) => startCamera(e.target.value, undefined)} disabled={live}>
            {cams.map((c) => <option key={c.deviceId} value={c.deviceId}>{c.label || "Camera"}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Microphone</label>
          <select onChange={(e) => startCamera(undefined, e.target.value)} disabled={live}>
            {mics.map((m) => <option key={m.deviceId} value={m.deviceId}>{m.label || "Microphone"}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {!live ? (
          <button className="btn btn-live" type="button" onClick={goLive} disabled={streamReady !== true || status === "connecting"}>
            {status === "connecting" ? "Connecting..." : "Go Live"}
          </button>
        ) : (
          <button className="btn btn-ghost" type="button" onClick={stopLive}>Stop broadcast</button>
        )}
        <span className={`live-pill${live ? " is-live" : ""}`}>
          <span className="dot" /><span>{live ? "On air" : "Off air"}</span>
        </span>
      </div>

      {streamReady === false && (
        <div className="notice" style={{ marginTop: 16 }}>
          <strong>Cloudflare Stream not connected.</strong> Add a Live Input and set the Cloudflare
          env vars, then the Go Live button turns on. (See SETUP.md, Cloudflare Stream.)
        </div>
      )}
      {message && (
        <p className={status === "error" ? "form-error" : "form-ok"} style={{ marginTop: 12 }}>{message}</p>
      )}
    </div>
  );
}
