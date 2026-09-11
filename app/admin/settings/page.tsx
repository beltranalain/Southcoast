"use client";

import { useEffect, useState } from "react";
import { getIdToken } from "@/lib/firebase";
import { saveSection, loadConfig } from "@/lib/saveSection";
import ThemeToggle from "@/components/ThemeToggle";

type Status = "ok" | "fail" | "off";
type Health = Record<string, Status>;

const INTEGRATIONS: { key: string; name: string; detail: string }[] = [
  { key: "firebase", name: "Firebase", detail: "Admin sign-in, content, and user accounts" },
  { key: "youtube", name: "YouTube Data API", detail: "Pulls real videos and live status" },
  { key: "stream", name: "Cloudflare Stream", detail: "Live ingest, simulcast, and video storage" },
  { key: "chat", name: "Live chat (Cloudflare Durable Objects)", detail: "Real-time chat + guest Worker" },
  { key: "stripe", name: "Stripe", detail: "Tips and payments" },
  { key: "resend", name: "Contact email (Resend)", detail: "Delivers contact-form messages" },
];

const LABEL: Record<Status, string> = { ok: "Working", fail: "Error", off: "Not set up" };

export default function AdminSettings() {
  const [health, setHealth] = useState<Health | null>(null);
  const [checking, setChecking] = useState(true);
  const [recording, setRecording] = useState<boolean | null>(null);
  const [tips, setTips] = useState<boolean | null>(null);
  const [ytChannel, setYtChannel] = useState("");
  const [ytSaving, setYtSaving] = useState(false);
  const [ytMsg, setYtMsg] = useState("");

  useEffect(() => {
    loadConfig()
      .then((cfg) => {
        setTips(cfg?.branding?.tipsEnabled !== false);
        setYtChannel(cfg?.branding?.youtubeChannelId || "");
      })
      .catch(() => {});
  }, []);

  async function saveYtChannel() {
    const id = ytChannel.trim();
    if (id && !/^UC[\w-]{20,}$/.test(id)) {
      setYtMsg("That doesn't look like a channel ID (starts with \"UC...\").");
      return;
    }
    setYtSaving(true);
    setYtMsg("");
    try {
      await saveSection("branding", { youtubeChannelId: id });
      setYtMsg("Saved.");
    } catch {
      setYtMsg("Could not save.");
    } finally {
      setYtSaving(false);
    }
  }

  async function toggleTips(v: boolean) {
    setTips(v);
    await saveSection("branding", { tipsEnabled: v }).catch(() => {});
  }

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const r = await fetch("/api/stream/recording", { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
        const d = await r.json();
        if (r.ok) setRecording(Boolean(d.enabled));
      } catch { /* leave null */ }
    })();
  }, []);

  async function toggleRecording(v: boolean) {
    setRecording(v);
    const token = await getIdToken();
    await fetch("/api/stream/recording", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ enabled: v }),
    }).catch(() => {});
  }

  async function run() {
    setChecking(true);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/admin/health", { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
      const d = await res.json();
      if (res.ok) setHealth(d);
    } catch { /* leave last */ }
    finally { setChecking(false); }
  }
  useEffect(() => { run(); }, []);

  return (
    <>
      <div className="admin-topbar">
        <div>
          <h1>Settings</h1>
          <div className="sub">Connections and platform basics.</div>
        </div>
        <div className="admin-actions">
          <button className="btn btn-ghost btn-sm" type="button" onClick={run} disabled={checking}>{checking ? "Checking..." : "Re-check"}</button>
        </div>
      </div>

      <div className="two-col">
        <div>
          <div className="panel">
            <h3>Integrations</h3>
            <div className="panel-sub">
              Live status - each service is pinged to confirm it&apos;s working. Keys are managed
              securely in environment variables and are never shown or editable here.
            </div>
            {INTEGRATIONS.map((i) => {
              const s: Status | undefined = health?.[i.key];
              const cls = checking && !health ? "checking" : s === "ok" ? "ok" : s === "fail" ? "fail" : "off";
              return (
                <div className="dest-row" key={i.key}>
                  <div>
                    <div className="dest-name">{i.name}</div>
                    <div className="dest-meta">{i.detail}</div>
                  </div>
                  <span className={`health health-${cls}`}>
                    <span className="health-dot" />
                    {checking && !health ? "Checking..." : s ? LABEL[s] : "-"}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="panel">
            <h3>Brand</h3>
            <div className="panel-sub">Edit names and colors under Branding. Saved changes apply site-wide.</div>
            <div className="panel-split">
              <div className="form-field"><label>Site name</label><input type="text" defaultValue="South Coast Cane" readOnly /></div>
              <div className="form-field"><label>Domain</label><input type="text" defaultValue="southcoastcane.com" readOnly /></div>
            </div>
          </div>
          <div className="panel">
            <h3>YouTube channel</h3>
            <div className="panel-sub">
              The channel your live page embeds and the &quot;Watch on YouTube&quot; buttons open.
              Paste your <strong>channel ID</strong> (starts with &quot;UC&quot;). Find it in YouTube
              Studio &rarr; Settings &rarr; Channel &rarr; Advanced settings.
            </div>
            <div className="form-field">
              <label>Channel ID</label>
              <input
                type="text"
                value={ytChannel}
                placeholder="UCxxxxxxxxxxxxxxxxxxxxxx"
                onChange={(e) => { setYtChannel(e.target.value); setYtMsg(""); }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button className="btn btn-primary btn-sm" type="button" onClick={saveYtChannel} disabled={ytSaving}>
                {ytSaving ? "Saving..." : "Save channel"}
              </button>
              {ytMsg && <span className="dest-meta">{ytMsg}</span>}
            </div>
          </div>
        </div>
        <div>
          <div className="panel">
            <h3>Live defaults</h3>
            <div className="panel-sub">Applied to every new broadcast.</div>
            <div className="dest-row">
              <div><div className="dest-name">Auto-simulcast to YouTube</div><div className="dest-meta">On by default</div></div>
              <label className="toggle"><input type="checkbox" defaultChecked /><span className="track" /></label>
            </div>
            <div className="dest-row">
              <div><div className="dest-name">Auto-save broadcasts to library</div><div className="dest-meta">Records each broadcast as a VOD on your own site (adds Cloudflare storage cost)</div></div>
              <label className="toggle"><input type="checkbox" checked={recording ?? false} disabled={recording === null} onChange={(e) => toggleRecording(e.target.checked)} /><span className="track" /></label>
            </div>
            <div className="dest-row">
              <div><div className="dest-name">Enable live chat</div><div className="dest-meta">On the live page</div></div>
              <label className="toggle"><input type="checkbox" defaultChecked /><span className="track" /></label>
            </div>
            <div className="dest-row">
              <div><div className="dest-name">Accept tips</div><div className="dest-meta">Shows the tip buttons in chat. Turn off to hide them.</div></div>
              <label className="toggle"><input type="checkbox" checked={tips ?? true} disabled={tips === null} onChange={(e) => toggleTips(e.target.checked)} /><span className="track" /></label>
            </div>
          </div>
          <div className="panel">
            <h3>Appearance</h3>
            <div className="panel-sub">Studio theme on this device.</div>
            <div className="dest-row">
              <div><div className="dest-name">Light mode</div><div className="dest-meta">Dark is the default look; light is easier in bright rooms</div></div>
              <ThemeToggle />
            </div>
          </div>
          <div className="panel">
            <h3>Account</h3>
            <div className="panel-sub">Your Studio sign-in.</div>
            <div className="form-field"><label>Email</label><input type="email" defaultValue="creator@southcoastcane.com" /></div>
            <button className="btn btn-ghost btn-sm" type="button">Change password</button>
          </div>
        </div>
      </div>
    </>
  );
}
