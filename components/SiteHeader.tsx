"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV, BRAND } from "@/lib/siteData";

export default function SiteHeader({
  brand = { name: BRAND.name },
}: {
  brand?: { name: string };
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links = NAV.filter((n) => n.href !== "/");

  const parts = brand.name.split(" ");
  const last = parts.pop();
  const prefix = parts.join(" ");

  return (
    <header className="nav">
      <div className="nav-in wrap">
        <nav className={`navlinks${open ? " open" : ""}`} onClick={() => setOpen(false)}>
          {links.map((item) => (
            <Link key={item.href} href={item.href} className={pathname.startsWith(item.href) ? "active" : ""}>
              {item.label}
            </Link>
          ))}
        </nav>

        <Link className="brand" href="/">
          {prefix} <em>{last}</em>
        </Link>

        <div className="navright">
          <Link className="livepill" href="/live"><i />Watch live</Link>
        </div>

        <button className="nav-toggle" aria-label="Toggle navigation" onClick={() => setOpen((v) => !v)}>
          <span /><span /><span />
        </button>
      </div>
    </header>
  );
}
