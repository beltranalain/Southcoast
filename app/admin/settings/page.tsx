"use client";

import { useEffect, useState } from "react";
import { getIdToken } from "@/lib/firebase";

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
              <div><div className="dest-name">Auto-save broadcasts to library</div><div className="dest-meta">Recording kept as VOD</div></div>
              <label className="toggle"><input type="checkbox" defaultChecked /><span className="track" /></label>
            </div>
            <div className="dest-row">
              <div><div className="dest-name">Enable live chat</div><div className="dest-meta">On the live page</div></div>
              <label className="toggle"><input type="checkbox" defaultChecked /><span className="track" /></label>
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
