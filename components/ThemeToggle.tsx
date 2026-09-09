"use client";

import { useEffect, useState } from "react";

// Dark/light toggle. Flips <html data-theme="light"> and remembers the choice.
// Dark is the default (the brand look); light is opt-in.
export default function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.getAttribute("data-theme") === "light");
  }, []);

  function set(v: boolean) {
    setLight(v);
    if (v) document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
    try { localStorage.setItem("theme", v ? "light" : "dark"); } catch {}
  }

  return (
    <label className="toggle">
      <input type="checkbox" checked={light} onChange={(e) => set(e.target.checked)} />
      <span className="track" />
    </label>
  );
}
