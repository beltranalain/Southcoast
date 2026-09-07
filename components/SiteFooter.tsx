import Link from "next/link";
import { BRAND, SERIES } from "@/lib/siteData";
import { CHANNELS } from "@/lib/channels";

export default function SiteFooter({
  brand = { name: BRAND.name, tagline: BRAND.tagline },
}: {
  brand?: { name: string; tagline: string };
}) {
  const year = new Date().getFullYear();
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="footgrid">
          <div>
            <h3 className="anton">Roll tape<br /><span className="or">every week</span></h3>
            <p className="sub">
              Pick the productions you want and get one note an hour before each goes live.
            </p>
          </div>
          <div className="footcol">
            <h4>Watch</h4>
            <Link href="/live">Live now</Link>
            <Link href="/shows">The slate</Link>
            <Link href="/library">Archive</Link>
            <Link href="/live">Schedule</Link>
          </div>
          <div className="footcol">
            <h4>Shows</h4>
            {SERIES.map((s) => (
              <Link key={s.key} href={s.href}>{s.title}</Link>
            ))}
          </div>
          <div className="footcol">
            <h4>Elsewhere</h4>
            {CHANNELS.map((c) => (
              <a key={c.key} href={c.url} target="_blank" rel="noopener noreferrer">
                {c.name}
              </a>
            ))}
            <Link href="/contact">Contact</Link>
          </div>
        </div>

        <div className="legal">
          <span>Copyright {year} {brand.name}. All rights reserved.</span>
          <span>
            Built by{" "}
            <a href="https://donkeyideas.com" target="_blank" rel="noopener noreferrer" className="credit">
              Donkey Ideas
            </a>
          </span>
        </div>

        <div className="megamark" aria-hidden="true">
          <span>Cane with</span>
          <span>a Camera</span>
        </div>
      </div>
    </footer>
  );
}
