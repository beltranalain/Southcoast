"use client";

import { useState } from "react";

// Full-size preview of the public site inside a modal (an iframe), so admins can
// check their changes without leaving the Studio. Desktop / mobile widths + an
// "open in tab" escape hatch.
export default function PreviewSiteModal({ onClose, src = "/" }: { onClose: () => void; src?: string }) {
  const [mobile, setMobile] = useState(false);
  return (
    <div className="preview-backdrop" onClick={onClose}>
      <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="preview-bar">
          <b>Site preview</b>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className={`btn btn-sm ${mobile ? "btn-ghost" : "btn-primary"}`} type="button" onClick={() => setMobile(false)}>Desktop</button>
            <button className={`btn btn-sm ${mobile ? "btn-primary" : "btn-ghost"}`} type="button" onClick={() => setMobile(true)}>Mobile</button>
            <a className="btn btn-ghost btn-sm" href={src} target="_blank" rel="noopener noreferrer">Open in tab</a>
            <button className="btn btn-ghost btn-sm" type="button" onClick={onClose}>Close</button>
          </div>
        </div>
        <div className="preview-stage">
          <iframe src={src} title="Site preview" className={mobile ? "preview-frame mobile" : "preview-frame"} />
        </div>
      </div>
    </div>
  );
}
