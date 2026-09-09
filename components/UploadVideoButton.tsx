"use client";

import { useRef, useState } from "react";
import { getIdToken } from "@/lib/firebase";

// Uploads a video file straight to Cloudflare Stream via a one-time direct
// upload URL (the file never passes through our server). It appears in the
// library once Cloudflare finishes processing.
export default function UploadVideoButton() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [msg, setMsg] = useState("");

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMsg(""); setPct(0); setBusy(true);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/stream/upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const d = await res.json();
      if (!res.ok || !d.uploadURL) { setMsg(d.error || "Could not start the upload."); setBusy(false); return; }

      // Upload with progress via XHR to the Cloudflare direct-upload URL.
      await new Promise<void>((resolve, reject) => {
        const form = new FormData();
        form.append("file", file);
        const xhr = new XMLHttpRequest();
        xhr.open("POST", d.uploadURL);
        xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) setPct(Math.round((ev.loaded / ev.total) * 100)); };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
        xhr.onerror = () => reject(new Error("Upload failed."));
        xhr.send(form);
      });
      setMsg("Uploaded. Cloudflare is processing it - it'll appear in the library shortly. Refresh in a minute.");
    } catch (err: any) {
      setMsg(err?.message || "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {(busy || msg) && <span className="panel-sub" style={{ margin: 0, maxWidth: 320 }}>{busy ? `Uploading... ${pct}%` : msg}</span>}
      <input ref={inputRef} type="file" accept="video/*" hidden onChange={pick} />
      <button className="btn btn-primary btn-sm" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? "Uploading..." : "Upload video"}
      </button>
    </div>
  );
}
