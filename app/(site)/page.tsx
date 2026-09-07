import Link from "next/link";
import { SERIES } from "@/lib/siteData";
import { getSiteConfig } from "@/lib/siteConfig";
import { CHANNELS, PRIMARY_CHANNEL } from "@/lib/channels";
import { getAllStats, getLiveInfo } from "@/lib/youtube";
import { formatCount } from "@/lib/format";
import HomeMarquee from "@/components/HomeMarquee";

const Arrow = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 8h11M9 4l4 4-4 4" /></svg>
);
const MicIcon = () => (
  <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7">
    <rect x="4.5" y="1" width="5" height="8" rx="2.5" /><path d="M2.5 7a4.5 4.5 0 0 0 9 0M7 11.5V13" />
  </svg>
);

export default async function HomePage() {
  const { content } = await getSiteConfig();
  const aboutParas = content.aboutText.split(/\n\s*\n/).filter(Boolean);
  const live = await getLiveInfo(PRIMARY_CHANNEL.channelId);
  const stats = await getAllStats(CHANNELS.map((c) => c.channelId));

  return (
    <>
      <HomeMarquee live={{ live: live.live, viewers: live.viewers }} />

      {/* about - real stats, no invented numbers */}
      <section className="sec" id="about">
        <div className="wrap">
          <p className="eyebrow">What&apos;s Cane with a Camera?</p>
          <div className="about">
            <div>
              <div className="astat"><div className="n">{SERIES.length}</div><div className="c">Productions</div></div>
              <div className="astat"><div className="n">{formatCount(stats?.subscribers)}</div><div className="c">Subscribers</div></div>
              <div className="astat"><div className="n">{formatCount(stats?.views)}</div><div className="c">Total views</div></div>
            </div>
            <div className="abouttext">
              {aboutParas.map((p, i) => (
                <p key={i} className={i === aboutParas.length - 1 ? "dim" : ""}>{p}</p>
              ))}
              <div className="thumbs">
                <span className="t art a2" /><span className="t art a3" /><span className="t art a5" />
              </div>
              <Link className="pillbtn" href="/shows">
                See the whole slate <span className="arw"><Arrow /></span>
              </Link>
            </div>
          </div>
          {!stats && (
            <p className="muted" style={{ fontSize: "12.5px", marginTop: 18 }}>
              Subscriber and view counts populate automatically once the YouTube API is connected.
            </p>
          )}
        </div>
      </section>

      {/* top shows */}
      <section className="sec" id="trending">
        <div className="wrap">
          <div className="trend">
            <h2 className="anton big">Discover our<br /><span className="or">top shows</span></h2>
            <div>
              <div className="tlist">
                {SERIES.map((s) => (
                  <Link key={s.key} className="trow" href={s.href}>
                    <span className="tmain">
                      <h3>{s.title}</h3>
                      <span className="by"><MicIcon />{s.by}</span>
                      <span className="desc">{s.blurb}</span>
                    </span>
                    <span className="chev"><Arrow /></span>
                  </Link>
                ))}
              </div>
              <Link className="tmore" href="/library" style={{ display: "block" }}>See the full archive</Link>
            </div>
          </div>
        </div>
      </section>

      {/* hosts */}
      <section className="sec" id="hosts">
        <div className="wrap">
          <div className="hostshead">
            <h2 className="anton big">Behind every show<br /><span className="or">is a real voice.</span></h2>
            <p>No network, no producer, no rundown handed down from anybody. Two people, a camera, and a chat that runs the whole time.</p>
          </div>
          <div className="hostrow">
            <div className="hostwave" aria-hidden="true">{[30, 56, 80, 48].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div>
            <div className="host art a1"><div className="hb"><b>South Coast Cane</b><span><MicIcon />Host, producer, camera</span></div></div>
            <div className="host tall art a5"><div className="hb"><b>The CEO</b><span><MicIcon />Co-host</span></div></div>
            <div className="host art a2"><div className="hb"><b>The guest seat</b><span><MicIcon />Open every live show</span></div></div>
            <div className="hostwave" aria-hidden="true">{[64, 38, 72, 44].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div>
          </div>
        </div>
      </section>

      {/* banner */}
      <div className="wrap">
        <div className="banner art a1">
          <div className="bmark">
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="1" y="4" width="11" height="10" rx="2.5" /><path d="M12 8.6 17 6v6l-5-2.6z" fill="currentColor" stroke="none" />
            </svg>
            Cane with a Camera
          </div>
          <h2 className="anton">It&apos;s more than a stream.<br />It&apos;s the room.</h2>
          <p>Watch here, watch on YouTube, or ask for the mic and end up on camera. Same broadcast either way.</p>
          <div className="row">
            <Link className="w" href="/live">Watch what&apos;s live</Link>
            <Link className="g" href="/shows">Get show reminders</Link>
          </div>
        </div>
      </div>
    </>
  );
}
