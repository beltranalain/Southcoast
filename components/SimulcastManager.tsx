"use client";

import { useEffect, useState } from "react";
import { getIdToken } from "@/lib/firebase";

type Output = { uid: string; url: string; enabled?: boolean };
const PRESETS: Record<string, string> = {
  YouTube: "rtmps://a.rtmps.youtube.com/live2",
  Facebook: "rtmps://live-api-s.facebook.com:443/rtmp/",
  Twitch: "rtmp://live.twitch.tv/app/",
  Custom: "",
};

function label(url: string) {
  if (url.includes("youtube")) return "YouTube";
  if (url.includes("facebook")) return "Facebook";
  if (url.includes("twitch")) return "Twitch";
  try { return new URL(url).hostname; } catch { return url; }
}

export default function SimulcastManager() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [platform, setPlatform] = useState<keyof typeof PRESETS>("YouTube");
  const [customUrl, setCustomUrl] = useState("");
  const [streamKey, setStreamKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    try {
      const token = await getIdToken();
      const res = await fetch("/api/stream/outputs", { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
      const d = await res.json();
      setConfigured(Boolean(d.configured));
      setOutputs(d.outputs || []);
    } catch { setConfigured(false); }
  }
  useEffect(() => { load(); }, []);

  async function add() {
    const url = platform === "Custom" ? customUrl.trim() : PRESETS[platform];
    if (!url || !streamKey.trim()) { setMsg("Enter the stream key."); return; }
    setBusy(true); setMsg("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/stream/outputs", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ url, streamKey: streamKey.trim() }),
      });
      const d = await res.json();
      if (d.ok) { setMsg(`${platform} added.`); setStreamKey(""); setCustomUrl(""); load(); }
      else setMsg(d.error || "Could not add destination.");
    } catch { setMsg("Request failed."); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    const token = await getIdToken();
    await fetch(`/api/stream/outputs?id=${id}`, { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} });
    load();
  }

  async function toggle(id: string, enabled: boolean) {
    const token = await getIdToken();
    await fetch("/api/stream/outputs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ id, enabled }),
    });
    load();
  }

  return (
    <div className="panel">
      <h3>Simulcast destinations</h3>
      <div className="panel-sub">Send your broadcast out to other platforms at the same time. No Cloudflare dashboard needed.</div>

      <div className="dest-row">
        <div><div className="dest-name">Own platform</div><div className="dest-meta">Your Live page player</div></div>
        <span className="pill published">Always on</span>
      </div>
      {outputs.map((o) => (
        <div className="dest-row" key={o.uid}>
          <div><div className="dest-name">{label(o.url)}</div><div className="dest-meta">{o.enabled !== false ? "live simulcast" : "paused"}</div></div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <label className="toggle"><input type="checkbox" checked={o.enabled !== false} onChange={(e) => toggle(o.uid, e.target.checked)} /><span className="track" /></label>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => remove(o.uid)}>Remove</button>
          </div>
        </div>
      ))}

      {configured === false && (
        <div className="notice" style={{ marginTop: 14 }}><strong>Cloudflare Stream not connected.</strong> Add the Stream keys to manage destinations here.</div>
      )}

      {configured && (
        <div style={{ marginTop: 18, borderTop: "1px solid var(--line)", paddingTop: 16 }}>
          <div className="panel-sub">Add a destination</div>
          <div className="panel-split">
            <div className="form-field">
              <label>Platform</label>
              <select value={platform} onChange={(e) => setPlatform(e.target.value as keyof typeof PRESETS)}>
                {Object.keys(PRESETS).map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            {platform === "Custom" && (
              <div className="form-field"><label>RTMP URL</label><input type="text" value={customUrl} placeholder="rtmps://..." onChange={(e) => setCustomUrl(e.target.value)} /></div>
            )}
          </div>
          <div className="form-field">
            <label>{platform} stream key</label>
            <input type="password" value={streamKey} placeholder="Paste the stream key" onChange={(e) => setStreamKey(e.target.value)} />
            <p className="form-note">YouTube: Studio -&gt; Create -&gt; Go Live -&gt; Stream key.</p>
          </div>
          <button className="btn btn-primary btn-sm" type="button" onClick={add} disabled={busy}>{busy ? "Adding..." : "Add destination"}</button>
          {msg && <p className={msg.includes("added") ? "form-ok" : "form-error"} style={{ marginTop: 10 }}>{msg}</p>}
        </div>
      )}
    </div>
  );
}
