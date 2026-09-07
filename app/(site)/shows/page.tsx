import type { Metadata } from "next";
import Link from "next/link";
import { SERIES } from "@/lib/siteData";
import { getSiteConfig } from "@/lib/siteConfig";
import Countdown from "@/components/Countdown";

export const metadata: Metadata = { title: "Shows" };

export default async function ShowsPage() {
  const { schedule } = await getSiteConfig();
  // Only broadcasts still in the future, soonest first.
  const upcoming = [...schedule]
    .sort((a, b) => (a.startsAt ?? 0) - (b.startsAt ?? 0))
    .filter((x) => (x.startsAt ?? 0) > Date.now());

  return (
    <>
      <section className="page-hero">
        <div className="wrap">
          <span className="eyebrow">The slate</span>
          <h1 className="anton">Five shows.<br /><span className="or">One camera.</span></h1>
          <p>Every production has its own page, its own schedule and its own reminder list. Pick the ones you actually want.</p>
        </div>
      </section>

      {upcoming.length > 0 && (
        <section className="sec" style={{ paddingTop: 56 }}>
          <div className="wrap">
            <span className="eyebrow">Upcoming live</span>
            <h2 className="anton big">On the <span className="or">schedule</span></h2>
            <div className="grid grid-3" style={{ marginTop: 32 }}>
              {upcoming.map((s, i) => (
                <Link key={i} className="tile" href="/live">
                  <div className="timg" style={s.cover ? { backgroundImage: `url(${s.cover})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
                    {!s.cover && <div className="art a1" style={{ position: "absolute", inset: 0 }} />}
                    <span className="lbl">Live</span>
                  </div>
                  <div className="tb">
                    <h3>{s.title}</h3>
                    <p>{s.when}{s.startsAt ? <> · <Countdown startsAt={s.startsAt} className="or" /></> : null}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

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
