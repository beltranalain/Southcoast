"use client";

import { useEffect, useState } from "react";
import type { ScheduleItem } from "@/lib/siteData";
import { saveSection, loadConfig } from "@/lib/saveSection";

const EMPTY: ScheduleItem = { when: "", title: "", note: "" };

export default function AdminSchedule() {
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [draft, setDraft] = useState<ScheduleItem>(EMPTY);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "demo" | "error">("idle");
  const [message, setMessage] = useState("");

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
          <button className="btn btn-ghost btn-sm" type="button" onClick={addDraft} style={{ width: "100%", justifyContent: "center" }}>Add to list</button>
          <p className="form-note">Remember to press Save schedule when done.</p>
        </div>
      </div>
    </>
  );
}
