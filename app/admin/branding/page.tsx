"use client";

import { useEffect, useState } from "react";
import { DEFAULT_BRANDING, type SiteBranding } from "@/lib/siteData";
import { saveSection, loadConfig } from "@/lib/saveSection";

export default function AdminBranding() {
  const [form, setForm] = useState<SiteBranding>(DEFAULT_BRANDING);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "demo" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadConfig()
      .then((cfg) => cfg?.branding && setForm({ ...DEFAULT_BRANDING, ...cfg.branding }))
      .catch(() => {});
  }, []);

  function set<K extends keyof SiteBranding>(key: K, value: SiteBranding[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setStatus("saving");
    setMessage("");
    try {
      const res = await saveSection("branding", form);
      if (res.saved) {
        setStatus("saved");
        setMessage("Saved. Refresh the public site to see the new colors and name.");
      } else {
        setStatus("demo");
        setMessage("Preview only - connect Firebase to save changes.");
      }
    } catch (e: any) {
      setStatus("error");
      setMessage(e.message || "Could not save.");
    }
  }

  return (
    <>
      <div className="admin-topbar">
        <div>
          <h1>Branding</h1>
          <div className="sub">Logo, colors, and identity across the whole platform.</div>
        </div>
        <div className="admin-actions">
          <button className="btn btn-primary btn-sm" type="button" onClick={save} disabled={status === "saving"}>
            {status === "saving" ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>

      {message && (
        <div className={status === "error" ? "form-error" : "form-ok"} style={{ marginBottom: 18 }}>
          {message}
        </div>
      )}

      <div className="two-col">
        <div>
          <div className="panel">
            <h3>Logo</h3>
            <div className="panel-sub">Shown in the site header, footer, and admin. Upload arrives with Firebase Storage.</div>
            <div className="uploader">
              <div className="logo-prev">SC</div>
              <div className="up-info"><div className="up-t">Primary logo</div><div className="up-s">Current: placeholder mark. Recommended 512 x 512.</div></div>
              <button className="btn btn-primary btn-sm" type="button" disabled>Upload logo</button>
            </div>
            <div className="uploader">
              <div className="logo-prev fav">SC</div>
              <div className="up-info"><div className="up-t">Favicon</div><div className="up-s">The small icon in the browser tab. 64 x 64.</div></div>
              <button className="btn btn-ghost btn-sm" type="button" disabled>Upload</button>
            </div>
          </div>

          <div className="panel">
            <h3>Identity</h3>
            <div className="panel-sub">Name and tagline used site-wide.</div>
            <div className="panel-split">
              <div className="form-field"><label>Site name</label><input type="text" value={form.siteName} onChange={(e) => set("siteName", e.target.value)} /></div>
              <div className="form-field"><label>Tagline</label><input type="text" value={form.tagline} onChange={(e) => set("tagline", e.target.value)} /></div>
            </div>
            <div className="form-field"><label>Domain</label><input type="text" value={form.domain} onChange={(e) => set("domain", e.target.value)} /></div>
          </div>
        </div>

        <div>
          <div className="panel">
            <h3>Colors</h3>
            <div className="panel-sub">The accent drives buttons, links, and highlights.</div>
            <div className="form-field">
              <label>Accent color</label>
              <div className="color-row">
                <input type="color" value={form.accent} onChange={(e) => set("accent", e.target.value)} />
                <input type="text" value={form.accent} onChange={(e) => set("accent", e.target.value)} />
              </div>
            </div>
            <div className="form-field">
              <label>Background</label>
              <div className="color-row">
                <input type="color" value={form.background} onChange={(e) => set("background", e.target.value)} />
                <input type="text" value={form.background} onChange={(e) => set("background", e.target.value)} />
              </div>
            </div>
            <div className="form-field">
              <label>Live indicator</label>
              <div className="color-row">
                <input type="color" value={form.live} onChange={(e) => set("live", e.target.value)} />
                <input type="text" value={form.live} onChange={(e) => set("live", e.target.value)} />
              </div>
            </div>
          </div>

          <div className="panel">
            <h3>Preview</h3>
            <div className="panel-sub">How the brand reads together.</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <span className="brand-mark" style={{ background: `linear-gradient(135deg, ${form.accent}, #8a6a10)` }}>SC</span>
              <span className="brand-name">{form.siteName}<span>{form.tagline}</span></span>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn btn-primary btn-sm" type="button" style={{ background: form.accent }}>Primary button</button>
              <button className="btn btn-ghost btn-sm" type="button">Ghost button</button>
              <span className="live-pill is-live" style={{ borderColor: form.live }}><span className="dot" style={{ background: form.live }} /><span>Live now</span></span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
