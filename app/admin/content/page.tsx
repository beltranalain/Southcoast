"use client";

import { useEffect, useRef, useState } from "react";
import { SERIES, DEFAULT_CONTENT, type SiteContent } from "@/lib/siteData";
import { CHANNELS } from "@/lib/channels";
import { saveSection, loadConfig } from "@/lib/saveSection";
import PreviewSiteModal from "@/components/PreviewSiteModal";

// Resize a picked image to a 600x600 cover portrait (WebP data URL) so it stays
// small enough to store inline in Firestore.
function resizePortrait(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const S = 600;
        const c = document.createElement("canvas"); c.width = S; c.height = S;
        const ctx = c.getContext("2d"); if (!ctx) throw new Error("no ctx");
        const scale = Math.max(S / img.width, S / img.height);
        const dw = img.width * scale, dh = img.height * scale;
        ctx.drawImage(img, (S - dw) / 2, (S - dh) / 2, dw, dh);
        const webp = c.toDataURL("image/webp", 0.82);
        resolve(webp.startsWith("data:image/webp") ? webp : c.toDataURL("image/jpeg", 0.82));
      } catch (e) { reject(e); } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
    img.src = url;
  });
}

export default function AdminContent() {
  const [form, setForm] = useState<SiteContent>(DEFAULT_CONTENT);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "demo" | "error">("idle");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(false);
  const portraitInput = useRef<HTMLInputElement | null>(null);

  async function pickPortrait(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    try { set("portrait", await resizePortrait(file)); }
    catch { setMessage("Could not read that image."); }
  }

  useEffect(() => {
    loadConfig()
      .then((cfg) => cfg?.content && setForm({ ...DEFAULT_CONTENT, ...cfg.content }))
      .catch(() => {});
  }, []);

  function set<K extends keyof SiteContent>(key: K, value: SiteContent[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setStatus("saving");
    setMessage("");
    try {
      const res = await saveSection("content", form);
      if (res.saved) {
        setStatus("saved");
        setMessage("Saved. Your changes are live on the site.");
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
          <h1>Content</h1>
          <div className="sub">Edit the words and sections viewers see. No code required.</div>
        </div>
        <div className="admin-actions">
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setPreview(true)}>Preview site</button>
          <button className="btn btn-primary btn-sm" type="button" onClick={save} disabled={status === "saving"}>
            {status === "saving" ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>

      {preview && <PreviewSiteModal onClose={() => setPreview(false)} />}

      {message && (
        <div className={status === "error" ? "form-error" : "form-ok"} style={{ marginBottom: 18 }}>
          {message}
        </div>
      )}

      <div className="two-col">
        <div>
          <div className="panel">
            <h3>About page</h3>
            <div className="panel-sub">The story text on the About page. Blank lines start a new paragraph.</div>
            <div className="form-field">
              <label>About text</label>
              <textarea style={{ minHeight: 200 }} value={form.aboutText} onChange={(e) => set("aboutText", e.target.value)} />
            </div>
            <div className="uploader">
              <div className="logo-prev">
                {form.portrait ? <img src={form.portrait} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} /> : "SC"}
              </div>
              <div className="up-info"><div className="up-t">About portrait</div><div className="up-s">Shown on the About page. Saved with your content (click Save changes).</div></div>
              <input ref={portraitInput} type="file" accept="image/*" hidden onChange={pickPortrait} />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => portraitInput.current?.click()}>{form.portrait ? "Change" : "Upload"}</button>
                {form.portrait && <button className="btn btn-ghost btn-sm" type="button" onClick={() => set("portrait", "")}>Remove</button>}
              </div>
            </div>
          </div>

          <div className="panel">
            <h3>Contact details</h3>
            <div className="panel-sub">Shown on the Contact page and footer.</div>
            <div className="panel-split">
              <div className="form-field"><label>General email</label><input type="email" value={form.emailGeneral} onChange={(e) => set("emailGeneral", e.target.value)} /></div>
              <div className="form-field"><label>Booking email</label><input type="email" value={form.emailBooking} onChange={(e) => set("emailBooking", e.target.value)} /></div>
            </div>
          </div>
        </div>

        <div>
          <div className="panel">
            <h3>Series</h3>
            <div className="panel-sub">The shows that appear across the site.</div>
            <div className="panel" style={{ padding: "8px 8px 0", marginBottom: 16, background: "var(--bg-elevated)" }}>
              <table className="data">
                <thead><tr><th>Series</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {SERIES.map((s) => (
                    <tr key={s.key}>
                      <td><div className="vt" style={{ fontWeight: 600 }}>{s.title}</div><div className="vs" style={{ color: "var(--text-dim)", fontSize: ".8rem" }}>{s.tag}</div></td>
                      <td><span className="pill published">Visible</span></td>
                      <td className="row-actions"><a>Edit</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn btn-ghost btn-sm" type="button" style={{ width: "100%", justifyContent: "center" }}>Add series</button>
          </div>

          <div className="panel">
            <h3>Connected YouTube channels</h3>
            <div className="panel-sub">Used to pull real videos into the library.</div>
            {CHANNELS.map((c) => (
              <div className="dest-row" key={c.key}>
                <div><div className="dest-name">{c.name}</div><div className="dest-meta">youtube.com/{c.handle}</div></div>
                <span className="pill published">Linked</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
