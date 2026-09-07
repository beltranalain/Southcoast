"use client";

import { useState } from "react";
import { SERIES } from "@/lib/siteData";

function CopyButton({ value }: { value: string }) {
  const [label, setLabel] = useState("Copy");
  return (
    <button
      className="btn btn-ghost btn-sm"
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setLabel("Copied");
          setTimeout(() => setLabel("Copy"), 1200);
        } catch {
          setLabel("Copy");
        }
      }}
    >
      {label}
    </button>
  );
}

export default function GoLivePage() {
  const server = "rtmps://live.cloudflare.com:443/live/";
  const key = "sc-live-key-9f3a20c4e7b1";
  const [reveal, setReveal] = useState(false);

  return (
    <>
      <div className="admin-topbar">
        <div>
          <h1>Go Live</h1>
          <div className="sub">Set up the broadcast, then start streaming from OBS.</div>
        </div>
        <div className="admin-actions">
          <span className="live-pill"><span className="dot" /><span>Offline</span></span>
        </div>
      </div>

      <div className="two-col">
        <div>
          <div className="panel">
            <h3>Broadcast details</h3>
            <div className="panel-sub">This appears on the live page and on YouTube.</div>
            <div className="form-field">
              <label>Title</label>
              <input type="text" defaultValue="The South Coast Cane Show - Weekly Live" />
            </div>
            <div className="form-field">
              <label>Series</label>
              <select defaultValue="The South Coast Cane Show">
                {SERIES.map((s) => <option key={s.key}>{s.title}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Description</label>
              <textarea defaultValue="Weekly flagship broadcast with a guest segment. Streaming on our own platform and simulcast to YouTube." />
            </div>
          </div>

          <div className="panel">
            <h3>Stream connection</h3>
            <div className="panel-sub">Paste these into OBS once. Ingest handled by Cloudflare Stream.</div>
            <label className="form-note" style={{ marginBottom: 6, display: "block" }}>Server (RTMPS)</label>
            <div className="copybox" style={{ marginBottom: 14 }}>
              <input type="text" readOnly value={server} />
              <CopyButton value={server} />
            </div>
            <label className="form-note" style={{ marginBottom: 6, display: "block" }}>Stream key</label>
            <div className="copybox">
              <input type={reveal ? "text" : "password"} readOnly value={key} />
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setReveal((v) => !v)}>
                {reveal ? "Hide" : "Show"}
              </button>
              <CopyButton value={key} />
            </div>
            <p className="notice" style={{ marginTop: 16 }}>
              <strong>Guests:</strong> bring remote guests in through VDO.Ninja into OBS, then this
              one stream fans out to every destination below.
            </p>
          </div>
        </div>

        <div>
          <div className="panel">
            <h3>Preview</h3>
            <div className="panel-sub">What viewers will see on the live page.</div>
            <div className="golive-preview">
              <div>
                <div style={{ fontWeight: 700, color: "var(--text-muted)" }}>Waiting for OBS signal</div>
                <div style={{ fontSize: ".85rem", marginTop: 6 }}>Start streaming in OBS to see the preview here.</div>
              </div>
            </div>
            <button className="btn btn-primary" type="button" style={{ width: "100%", marginTop: 16 }}>
              Start Broadcast
            </button>
            <p className="form-note center">Starting will go live on the site and all enabled destinations at once.</p>
          </div>

          <div className="panel">
            <h3>Simulcast destinations</h3>
            <div className="panel-sub">Where this broadcast goes out.</div>
            <div className="dest-row">
              <div><div className="dest-name">Own platform</div><div className="dest-meta">southcoastcane.com live page</div></div>
              <label className="toggle"><input type="checkbox" defaultChecked disabled /><span className="track" /></label>
            </div>
            <div className="dest-row">
              <div><div className="dest-name">YouTube - South Coast Cane Show</div><div className="dest-meta">Connected</div></div>
              <label className="toggle"><input type="checkbox" defaultChecked /><span className="track" /></label>
            </div>
            <div className="dest-row">
              <div><div className="dest-name">YouTube - Let Me Tell You One Thing</div><div className="dest-meta">Connected</div></div>
              <label className="toggle"><input type="checkbox" /><span className="track" /></label>
            </div>
            <div className="dest-row">
              <div><div className="dest-name">Facebook</div><div className="dest-meta">Not connected</div></div>
              <label className="toggle"><input type="checkbox" disabled /><span className="track" /></label>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
