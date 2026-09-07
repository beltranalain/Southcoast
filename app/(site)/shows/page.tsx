import type { Metadata } from "next";
import Link from "next/link";
import { SERIES } from "@/lib/siteData";

export const metadata: Metadata = { title: "Shows" };

export default function ShowsPage() {
  return (
    <>
      <section className="page-hero">
        <div className="wrap">
          <span className="eyebrow">The slate</span>
          <h1 className="anton">Five shows.<br /><span className="or">One camera.</span></h1>
          <p>Every production has its own page, its own schedule and its own reminder list. Pick the ones you actually want.</p>
        </div>
      </section>

      <section className="sec" style={{ paddingTop: 56 }}>
        <div className="wrap">
          <div className="grid grid-3">
            {SERIES.map((s) => (
              <Link key={s.key} className="tile" href={s.href}>
                <div className={`timg art ${s.art}`}>
                  <span className="lbl">{s.badge}</span>
                </div>
                <div className="tb">
                  <h3>{s.title}</h3>
                  <p>{s.blurb}</p>
                </div>
              </Link>
            ))}
            <Link className="tile" href="/library">
              <div className="timg art a1"><span className="lbl">Archive</span></div>
              <div className="tb">
                <h3>The full archive</h3>
                <p>Every episode across every series, organized and searchable in one place.</p>
              </div>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
