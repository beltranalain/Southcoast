"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ScheduleItem } from "@/lib/siteData";
import { saveSection, loadConfig } from "@/lib/saveSection";

const TZ_OPTIONS = [
  { id: "America/New_York", label: "Eastern (ET)" },
  { id: "America/Chicago", label: "Central (CT)" },
  { id: "America/Denver", label: "Mountain (MT)" },
  { id: "America/Los_Angeles", label: "Pacific (PT)" },
];

// Interpret a datetime-local wall-clock ("2026-09-11T20:00") as a time in `tz`
// and return the UTC epoch ms (DST-correct via Intl).
function wallClockToEpoch(local: string, tz: string): number {
  const naive = new Date(local + ":00Z").getTime();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(naive).reduce((a: any, p) => { a[p.type] = p.value; return a; }, {});
  const asTz = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return naive - (asTz - naive);
}

function fmtWhen(epoch: number, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(epoch);
}

// Resize a picked image to a 16:9 cover thumbnail (WebP).
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
  const router = useRouter();
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [dt, setDt] = useState("");
  const [tz, setTz] = useState("America/New_York");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [cover, setCover] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(0);
  const coverInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadConfig()
      .then((cfg) => Array.isArray(cfg?.schedule) && setItems(cfg.schedule))
      .catch(() => {});
  }, []);

  // Track time so past broadcasts can be flagged "Expired" (refreshes each min).
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  // Auto-save whenever the list changes (so nothing is lost on navigation).
  async function persist(list: ScheduleItem[]) {
    try {
      const res = await saveSection("schedule", { items: list });
      setMessage(res.saved ? "Saved." : "Preview only - connect Firebase to save.");
    } catch {
      setMessage("Could not save.");
    }
  }

  async function pickCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try { setCover(""); setCover(await resizeCover(file)); }
    catch { setMessage("Could not read that image."); }
  }

  async function addItem() {
    if (!title.trim() || !dt) { setMessage("Add a date/time and a show name."); return; }
    const startsAt = wallClockToEpoch(dt, tz);
    const item: ScheduleItem = { title: title.trim(), note: note.trim(), cover, startsAt, tz, when: fmtWhen(startsAt, tz) };
    const list = [...items, item].sort((a, b) => (a.startsAt ?? 0) - (b.startsAt ?? 0));
    setItems(list);
    setDt(""); setTitle(""); setNote(""); setCover("");
    await persist(list);
  }

  async function removeAt(idx: number) {
    const list = items.filter((_, i) => i !== idx);
    setItems(list);
    await persist(list);
  }

  // Start this broadcast now: drop it from the schedule (it's no longer
  // "upcoming") and jump to the Go Live studio to hit air.
  async function goLive(idx: number) {
    await removeAt(idx);
    router.push("/admin/go-live");
  }

  // Remove every broadcast whose start time has already passed.
  async function clearExpired() {
    const list = items.filter((s) => (s.startsAt ?? 0) > Date.now());
    setItems(list);
    await persist(list);
  }

  return (
    <>
      <div className="admin-topbar">
        <div>
          <h1>Schedule</h1>
          <div className="sub">Add your real broadcasts. These publish to the Home + Live page and save automatically.</div>
        </div>
        {message && <div className="admin-actions"><span className="form-ok" style={{ margin: 0 }}>{message}</span></div>}
      </div>

      <div className="two-col">
        <div className="panel">
          <div className="mod-row" style={{ marginBottom: 4 }}>
            <div>
              <h3>Upcoming broadcasts</h3>
              <div className="panel-sub" style={{ marginBottom: 0 }}>Saved automatically as you add them. Soonest first.</div>
            </div>
            {items.some((s) => now > 0 && (s.startsAt ?? 0) <= now) && (
              <button className="btn btn-ghost btn-sm" type="button" onClick={clearExpired}>Clear expired</button>
            )}
          </div>
          {items.length ? (
            <ul className="schedule" style={{ marginTop: 14 }}>
              {items
                .map((s, idx) => ({ s, idx, expired: now > 0 && (s.startsAt ?? 0) <= now }))
                .sort((a, b) => (a.expired ? 1 : 0) - (b.expired ? 1 : 0) || (a.s.startsAt ?? 0) - (b.s.startsAt ?? 0))
                .map(({ s, idx, expired }) => (
                  <li key={idx} style={expired ? { opacity: 0.55 } : undefined}>
                    {s.cover && <img src={s.cover} alt="" className="cover-thumb sm" />}
                    <span className="when">{s.when}</span>
                    <span className="what">
                      <strong>{s.title}{expired && <span className="pill draft" style={{ marginLeft: 8 }}>Expired</span>}</strong>
                      <span>{s.note}</span>
                    </span>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexShrink: 0 }}>
                      {!expired && <button className="btn btn-primary btn-sm" type="button" onClick={() => goLive(idx)}>Go live</button>}
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => removeAt(idx)}>Remove</button>
                    </div>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="muted" style={{ fontSize: "13.5px" }}>No broadcasts scheduled yet. Add one on the right.</p>
          )}
        </div>

        <div className="panel">
          <h3>Add a broadcast</h3>
          <div className="panel-sub">Date, time, and timezone - viewers see a live countdown.</div>
          <div className="panel-split">
            <div className="form-field"><label>Date &amp; time</label><input type="datetime-local" value={dt} onChange={(e) => setDt(e.target.value)} /></div>
            <div className="form-field"><label>Timezone</label><select value={tz} onChange={(e) => setTz(e.target.value)}>{TZ_OPTIONS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
          </div>
          <div className="form-field"><label>Show</label><input type="text" placeholder="The South Coast Cane Show" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="form-field"><label>Note</label><input type="text" placeholder="Weekly flagship broadcast" value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <div className="form-field">
            <label>Cover image (optional)</label>
            <input ref={coverInput} type="file" accept="image/*" hidden onChange={pickCover} />
            <div className="cover-pick">
              {cover ? <img src={cover} alt="" className="cover-thumb" /> : <div className="cover-thumb empty">16:9</div>}
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => coverInput.current?.click()}>{cover ? "Change" : "Upload cover"}</button>
              {cover && <button className="btn btn-ghost btn-sm" type="button" onClick={() => setCover("")}>Remove</button>}
            </div>
          </div>
          <button className="btn btn-primary btn-sm" type="button" onClick={addItem} style={{ width: "100%", justifyContent: "center" }}>Add broadcast</button>
        </div>
      </div>
    </>
  );
}
