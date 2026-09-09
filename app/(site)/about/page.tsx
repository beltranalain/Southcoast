import type { Metadata } from "next";
import Link from "next/link";
import { getSiteConfig } from "@/lib/siteConfig";

export const metadata: Metadata = { title: "About" };

const Arrow = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 8h11M9 4l4 4-4 4" /></svg>
);

export default async function AboutPage() {
  const { content } = await getSiteConfig();
  const paras = content.aboutText.split(/\n\s*\n/).filter(Boolean);

  return (
    <>
      <section className="page-hero">
        <div className="wrap">
          <span className="eyebrow">What&apos;s Cane with a Camera?</span>
          <h1 className="anton">One studio.<br /><span className="or">Five shows.</span></h1>
        </div>
      </section>

      <section className="sec" style={{ paddingTop: 56 }}>
        <div className="wrap">
          <div className="about">
            <div>
              {content.portrait && <img src={content.portrait} alt="" className="about-portrait" />}
              <div className="astat"><div className="n">5</div><div className="c">Productions</div></div>
              <div className="astat"><div className="n">10K+</div><div className="c">Hours streamed</div></div>
              <div className="astat"><div className="n">2</div><div className="c">Channels</div></div>
            </div>
            <div className="abouttext">
              {paras.map((p, i) => (
                <p key={i} className={i > 0 ? "dim" : ""}>{p}</p>
              ))}
              <div className="thumbs">
                <span className="t art a2" /><span className="t art a4" /><span className="t art a5" />
              </div>
              <Link className="pillbtn" href="/shows">
                See the whole slate <span className="arw"><Arrow /></span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="hostshead">
            <h2 className="anton big">Behind every show<br /><span className="or">is a real voice.</span></h2>
            <p>Own the platform, keep the audience. Broadcasts go out live here and on YouTube at the same time, so nobody gets left behind while the home base stays fully ours.</p>
          </div>
        </div>
      </section>
    </>
  );
}
