"use client";

import { useRef, useState } from "react";

// A floating picture-in-picture window showing the live page. Drag the title
// bar to move it; drag the bottom-right grip to resize. Handy for watching the
// public output while you run the studio.
export default function LivePipModal({ onClose, src = "/live" }: { onClose: () => void; src?: string }) {
  const winRef = useRef<HTMLDivElement | null>(null);
  const mode = useRef<null | "move" | "resize">(null);
  const start = useRef({ sx: 0, sy: 0, x: 0, y: 0, w: 0, h: 0 });
  const [pos, setPos] = useState(() => ({
    x: typeof window !== "undefined" ? Math.max(20, window.innerWidth - 520) : 40,
    y: 96,
  }));
  const [size, setSize] = useState({ w: 480, h: 300 });
  const [busy, setBusy] = useState(false);

  function down(e: React.PointerEvent, m: "move" | "resize") {
    e.preventDefault();
    mode.current = m;
    start.current = { sx: e.clientX, sy: e.clientY, x: pos.x, y: pos.y, w: size.w, h: size.h };
    setBusy(true);
    try { winRef.current?.setPointerCapture(e.pointerId); } catch {}
  }
  function move(e: React.PointerEvent) {
    if (!mode.current) return;
    const dx = e.clientX - start.current.sx, dy = e.clientY - start.current.sy;
    if (mode.current === "move") setPos({ x: start.current.x + dx, y: start.current.y + dy });
    else setSize({ w: Math.max(260, start.current.w + dx), h: Math.max(170, start.current.h + dy) });
  }
  function up(e: React.PointerEvent) {
    mode.current = null;
    setBusy(false);
    try { winRef.current?.releasePointerCapture(e.pointerId); } catch {}
  }

  return (
    <div
      ref={winRef}
      className="pip-win"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
      onPointerMove={move}
      onPointerUp={up}
    >
      <div className="pip-bar" onPointerDown={(e) => down(e, "move")}>
        <b>Live page</b>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="pip-btn" href={src} target="_blank" rel="noopener noreferrer">Open tab</a>
          <button className="pip-btn" type="button" onPointerDown={(e) => e.stopPropagation()} onClick={onClose}>Close</button>
        </div>
      </div>
      <iframe src={src} title="Live page" className="pip-frame" style={{ pointerEvents: busy ? "none" : "auto" }} />
      <div className="pip-resize" onPointerDown={(e) => down(e, "resize")} />
    </div>
  );
}
