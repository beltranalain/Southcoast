"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_BRANDING, type SiteBranding } from "@/lib/siteData";
import { saveSection, loadConfig } from "@/lib/saveSection";

// Draw the picked image onto a square canvas at `size` px (contain, transparent
// padding) and return a compact PNG data URL. Keeps the stored value small
// enough to live directly in the Firestore branding doc - no Firebase Storage.
function resizeImage(file: File, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas unsupported.");
        const scale = Math.min(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL("image/png"));
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file is not a readable image."));
    };
    img.src = url;
  });
}

export default function AdminBranding() {
  const [form, setForm] = useState<SiteBranding>(DEFAULT_BRANDING);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "demo" | "error">("idle");
  const [message, setMessage] = useState("");
  const logoInput = useRef<HTMLInputElement>(null);
  const faviconInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadConfig()
      .then((cfg) => cfg?.branding && setForm({ ...DEFAULT_BRANDING, ...cfg.branding }))
      .catch(() => {});
  }, []);

  function set<K extends keyof SiteBranding>(key: K, value: SiteBranding[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>, key: "logo" | "favicon", size: number) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus("error");
      setMessage("Please choose an image file (PNG, JPG, or SVG).");
      return;
    }
    try {
      const dataUrl = await resizeImage(file, size);
      set(key, dataUrl);
      setStatus("idle");
      setMessage(`${key === "logo" ? "Logo" : "Favicon"} ready. Click Save changes to publish it.`);
    } catch (err: any) {
      setStatus("error");
      setMessage(err.message || "Could not read that image.");
    }
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
            <div className="panel-sub">Shown in the site header and admin. Images are resized and stored with your branding - no extra setup.</div>
            <input ref={logoInput} type="file" accept="image/*" hidden onChange={(e) => onPick(e, "logo", 512)} />
            <input ref={faviconInput} type="file" accept="image/*" hidden onChange={(e) => onPick(e, "favicon", 64)} />
            <div className="uploader">
              <div className="logo-prev" style={form.logo ? { background: "none", padding: 0 } : undefined}>
                {form.logo ? <img src={form.logo} alt="Logo preview" style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 10 }} /> : "SC"}
              </div>
              <div className="up-info"><div className="up-t">Primary logo</div><div className="up-s">{form.logo ? "Custom logo set." : "Current: placeholder mark."} Recommended 512 x 512.</div></div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary btn-sm" type="button" onClick={() => logoInput.current?.click()}>Upload logo</button>
                {form.logo && <button className="btn btn-ghost btn-sm" type="button" onClick={() => set("logo", "")}>Remove</button>}
              </div>
            </div>
            <div className="uploader">
              <div className="logo-prev fav" style={form.favicon ? { background: "none", padding: 0 } : undefined}>
                {form.favicon ? <img src={form.favicon} alt="Favicon preview" style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 8 }} /> : "SC"}
              </div>
              <div className="up-info"><div className="up-t">Favicon</div><div className="up-s">The small icon in the browser tab. 64 x 64.</div></div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => faviconInput.current?.click()}>Upload</button>
                {form.favicon && <button className="btn btn-ghost btn-sm" type="button" onClick={() => set("favicon", "")}>Remove</button>}
              </div>
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

          <div className="panel">
            <h3>Live page</h3>
            <div className="panel-sub">A permanent show-name label (channel bug) on the live player, separate from the on-air banner you control while broadcasting.</div>
            <label className="check-row">
              <input type="checkbox" checked={form.showChannelBug} onChange={(e) => set("showChannelBug", e.target.checked)} />
              <span>Show a permanent show-name label on the live page</span>
            </label>
            {form.showChannelBug && (
              <div className="form-field" style={{ marginTop: 12 }}>
                <label>Label text</label>
                <input type="text" value={form.channelBug} placeholder="The South Coast Cane Show" onChange={(e) => set("channelBug", e.target.value)} />
              </div>
            )}
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
              {form.logo ? (
                <span className="brand-mark" style={{ background: "none", padding: 0, overflow: "hidden" }}>
                  <img src={form.logo} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                </span>
              ) : (
                <span className="brand-mark" style={{ background: `linear-gradient(135deg, ${form.accent}, #8a6a10)` }}>SC</span>
              )}
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
