"use client";

import { useEffect, useRef, useState } from "react";
import type { ScheduleItem } from "@/lib/siteData";
import { saveSection, loadConfig } from "@/lib/saveSection";

const EMPTY: ScheduleItem = { when: "", title: "", note: "", cover: "" };

// Resize a picked image to a 16:9 cover thumbnail (WebP) small enough to store
// inline with the schedule.
function resizeCover(file: File, w = 480, h = 270): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d");
        if (!ctx) throw new Error("Canvas unsupported.");
        const scale = Math.max(w / img.width, h / img.height);
        const dw = img.width * scale, dh = img.height * scale;
        ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
        const webp = c.toDataURL("image/webp", 0.8);
        resolve(webp.startsWith("data:image/webp") ? webp : c.toDataURL("image/jpeg", 0.8));
      } catch (e) { reject(e); } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Not a readable image.")); };
    img.src = url;
  });
}

export default function AdminSchedule() {
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [draft, setDraft] = useState<ScheduleItem>(EMPTY);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "demo" | "error">("idle");
  const [message, setMessage] = useState("");
  const coverInput = useRef<HTMLInputElement | null>(null);

  async function pickCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try { setDraft((d) => ({ ...d, cover: "" })); const url = await resizeCover(file); setDraft((d) => ({ ...d, cover: url })); }
    catch { setMessage("Could not read that image."); }
  }

  useEffect(() => {
    loadConfig()
      .then((cfg) => Array.isArray(cfg?.schedule) && setItems(cfg.schedule))
      .catch(() => {});
  }, []);

  function addDraft() {
    if (!draft.title.trim()) return;
    setItems((v) => [...v, { ...draft }]);
    setDraft(EMPTY);
  }
  function removeAt(idx: number) {
    setItems((v) => v.filter((_, i) => i !== idx));
  }

  async function save() {
    setStatus("saving");
    setMessage("");
    try {
      const res = await saveSection("schedule", { items });
      if (res.saved) {
        setStatus("saved");
        setMessage("Saved. This schedule now shows on the Live page.");
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
          <h1>Schedule</h1>
          <div className="sub">Add your real broadcasts. These publish to the Live page.</div>
        </div>
        <div className="admin-actions">
          <button className="btn btn-primary btn-sm" type="button" onClick={save} disabled={status === "saving"}>
            {status === "saving" ? "Saving..." : "Save schedule"}
          </button>
        </div>
      </div>

      {message && (
        <div className={status === "error" ? "form-error" : "form-ok"} style={{ marginBottom: 18 }}>
          {message}
        </div>
      )}

      <div className="two-col">
        <div className="panel">
          <h3>Upcoming broadcasts</h3>
          <div className="panel-sub">Nothing fake here - this list starts empty and shows only what you add.</div>
          {items.length ? (
            <ul className="schedule">
              {items.map((s, i) => (
                <li key={i}>
                  {s.cover && <img src={s.cover} alt="" className="cover-thumb sm" />}
                  <span className="when">{s.when}</span>
                  <span className="what"><strong>{s.title}</strong><span>{s.note}</span></span>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => removeAt(i)} style={{ marginLeft: "auto" }}>Remove</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ fontSize: "13.5px" }}>No broadcasts scheduled yet. Add one on the right.</p>
          )}
        </div>

        <div className="panel">
          <h3>Add a broadcast</h3>
          <div className="panel-sub">When, what, and a short note.</div>
          <div className="form-field"><label>When</label><input type="text" placeholder="Thu, 8:00 PM ET" value={draft.when} onChange={(e) => setDraft({ ...draft, when: e.target.value })} /></div>
          <div className="form-field"><label>Show</label><input type="text" placeholder="The South Coast Cane Show" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
          <div className="form-field"><label>Note</label><input type="text" placeholder="Weekly flagship broadcast" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></div>
          <div className="form-field">
            <label>Cover image (optional)</label>
            <input ref={coverInput} type="file" accept="image/*" hidden onChange={pickCover} />
            <div className="cover-pick">
              {draft.cover ? <img src={draft.cover} alt="" className="cover-thumb" /> : <div className="cover-thumb empty">16:9</div>}
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => coverInput.current?.click()}>{draft.cover ? "Change" : "Upload cover"}</button>
              {draft.cover && <button className="btn btn-ghost btn-sm" type="button" onClick={() => setDraft((d) => ({ ...d, cover: "" }))}>Remove</button>}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" type="button" onClick={addDraft} style={{ width: "100%", justifyContent: "center" }}>Add to list</button>
          <p className="form-note">Remember to press Save schedule when done.</p>
        </div>
      </div>
    </>
  );
}
