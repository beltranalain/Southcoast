"use client";

import Link from "next/link";
import { useState } from "react";
import { SERIES } from "@/lib/siteData";
import HomeBackdrop from "@/components/HomeBackdrop";
import Countdown from "@/components/Countdown";

const Play = () => (
  <svg width="13" height="15" viewBox="0 0 13 15" fill="currentColor"><path d="M0 0l13 7.5L0 15z" /></svg>
);
const pad = (n: number) => String(n).padStart(2, "0");

export default function HomeMarquee({
  live,
  nextShow,
}: {
  live: { live: boolean; viewers: number | null } | null;
  nextShow?: { when: string; title: string; startsAt?: number; cover?: string } | null;
}) {
  const shows = SERIES;
  const n = shows.length;
  const [i, setI] = useState(0);
  const s = shows[i];

  // Only the flagship show goes live; reflect real status.
  const isLive = Boolean(live?.live) && s.key === "cane-show";
  const viewers = live?.viewers ?? null;

  const prev = () => setI((v) => (v - 1 + n) % n);
  const next = () => setI((v) => (v + 1) % n);
  const peek = [shows[(i + 1) % n], shows[(i + 2) % n]];

  return (
    <section className="shell">
      <div className="shell-art" />
      <HomeBackdrop cover={!isLive ? nextShow?.cover : undefined} />
      <div className="scrim" />
      <div className="scrim2" />
      <div className="wrap">
        <div className="mhero">
          <div>
            {isLive ? (
              <div className="eyebrow-live"><i />Live right now</div>
            ) : (
              <div className="eyebrow-live off"><i />On the slate</div>
            )}
            <h1 className="anton">{s.title}</h1>
            <p className="blurb">{s.blurb}</p>
            <div className="metaline">
              <span><b>{s.by}</b></span>
              <span className="chip">{s.tag}</span>
              {isLive && viewers != null && <span>{viewers.toLocaleString()} watching</span>}
            </div>
            <div className="cta">
              <Link className="b1" href="/live"><Play />{isLive ? "Watch live" : "Go to live"}</Link>
              <Link className="b2" href={s.href}>See the show</Link>
            </div>
            {!isLive && nextShow && (
              <Link href="/live" className="nextcard">
                {nextShow.cover ? (
                  <img className="nc-cover" src={nextShow.cover} alt="" />
                ) : (
                  <div className="nc-cover empty"><Play /></div>
                )}
                <div className="nc-body">
                  <div className="nc-eyebrow"><span className="nl-dot" />Next live show</div>
                  {nextShow.title && <div className="nc-title">{nextShow.title}</div>}
                  <div className="nc-when">
                    <b>{nextShow.when}</b>
                    {nextShow.startsAt ? <Countdown startsAt={nextShow.startsAt} className="nl-count" /> : null}
                  </div>
                </div>
              </Link>
            )}
          </div>

          <div className="peek">
            {peek.map((p) => (
              <div className="peekcard" key={p.key}>
                <div className={`cimg art ${p.art}`} />
                <div className="cbar">{p.title}<span>{p.tag}</span></div>
              </div>
            ))}
          </div>
        </div>

        <div className="controls">
          <button className="circ" aria-label="Previous show" onClick={prev}>
            <svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M16 6H1M6 1 1 6l5 5" /></svg>
          </button>
          <button className="circ" aria-label="Next show" onClick={next}>
            <svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M0 6h15M10 1l5 5-5 5" /></svg>
          </button>
          <div className="track"><b style={{ width: `${((i + 1) / n) * 100}%` }} /></div>
          <div className="count">{pad(i + 1)}<span> / {pad(n)}</span></div>
        </div>
      </div>
    </section>
  );
}
