"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BRAND } from "@/lib/siteData";

const LINKS = [
  { href: "/live", label: "Live" },
  { href: "/shows", label: "Shows" },
  { href: "/shows", label: "Series" },
  { href: "/library", label: "Archive" },
];

const SearchIcon = () => (
  <svg width="19" height="19" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="9" cy="9" r="6" /><path d="M13.5 13.5 18 18" /></svg>
);
const BellIcon = () => (
  <svg width="19" height="19" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M6 8a4 4 0 0 1 8 0c0 4 1.5 5 1.5 5h-11S6 12 6 8Z" /><path d="M8.5 16a1.5 1.5 0 0 0 3 0" /></svg>
);

export default function SiteHeader({ brand = { name: BRAND.name } }: { brand?: { name: string } }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const parts = brand.name.split(" ");
  const last = parts.pop();
  const prefix = parts.join(" ");

  return (
    <header className="nav">
      <div className="nav-in wrap">
        <nav className={`navlinks${open ? " open" : ""}`} onClick={() => setOpen(false)}>
          {LINKS.map((item) => (
            <Link key={item.label} href={item.href} className={pathname.startsWith(item.href) ? "active" : ""}>{item.label}</Link>
          ))}
        </nav>

        <Link className="brand" href="/">{prefix} <em>{last}</em></Link>

        <div className="navright">
          <Link href="/library" aria-label="Search"><SearchIcon /></Link>
          <Link href="/live" aria-label="What's live"><BellIcon /></Link>
          <Link href="/admin" className="navsignin">Sign in</Link>
        </div>

        <button className="nav-toggle" aria-label="Toggle navigation" onClick={() => setOpen((v) => !v)}>
          <span /><span /><span />
        </button>
      </div>
    </header>
  );
}
