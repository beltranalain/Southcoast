import type { Metadata } from "next";
import Link from "next/link";
import { PRIMARY_CHANNEL } from "@/lib/channels";
import { getSiteConfig } from "@/lib/siteConfig";
import { getLiveInfo } from "@/lib/youtube";
import LiveChat from "@/components/LiveChat";
import LivePlayer from "@/components/LivePlayer";
import AirStatus from "@/components/AirStatus";

export const metadata: Metadata = { title: "Live" };

export default async function LivePage() {
  const { schedule } = await getSiteConfig();
  const live = await getLiveInfo(PRIMARY_CHANNEL.channelId);
  const next = schedule[0];

  // Prefer our own Cloudflare Stream player when configured; else YouTube embed.
  const cfCode = process.env.NEXT_PUBLIC_CF_STREAM_CUSTOMER_CODE;
  const cfInput = process.env.NEXT_PUBLIC_CF_STREAM_LIVE_INPUT_UID;
  const onOwnPlatform = Boolean(cfCode && cfInput);
  const playerSrc = onOwnPlatform
    ? `https://customer-${cfCode}.cloudflarestream.com/${cfInput}/iframe`
    : `https://www.youtube.com/embed/live_stream?channel=${PRIMARY_CHANNEL.channelId}`;

  return (
    <section className="livehero">
      <div className="wrap">
        <div className="livehead">
          <div>
            <div className="showname">The South Coast Cane Show</div>
            <h1 className="anton">Live from the South Coast</h1>
          </div>
          <div className="elapsed">
            <AirStatus initial={live.live} />
            <span>Air status</span>
          </div>
        </div>

        <div className="livegrid">
          <div>
            <div className="playerwell art a1">
              <span className="viewers">
                {live.live
                  ? live.viewers != null
                    ? `${live.viewers.toLocaleString()} watching`
                    : "Live now"
                  : "Auto - shows when live"}
              </span>
              <LivePlayer src={playerSrc} />
              <div className="lower3">
                <span className="l3a">South Coast Cane</span>
                <span className="l3b">The South Coast Cane Show</span>
              </div>
            </div>

            <div className="underplayer">
              <div className="actionrow">
                <a className="btn btn-primary" href={PRIMARY_CHANNEL.url} target="_blank" rel="noopener noreferrer">
                  Watch on YouTube instead
                </a>
                <Link className="btn btn-ghost" href="/contact">Ask to join the show</Link>
                <Link className="btn btn-ghost" href="/library">Past broadcasts</Link>
              </div>
              <div className="simul">
                <span className="dchip"><i /><b>Here</b> <span>own site</span></span>
                <span className="dchip"><i /><b>YouTube</b> <span>simulcast</span></span>
                <span className="dchip off"><i /><b>Facebook</b> <span>off</span></span>
              </div>
            </div>

            {next && (
              <div className="nextup">
                <span className="nl">Up next</span>
                <div>
                  <b>{next.title}</b>
                  <span>{next.when}{next.note ? ` - ${next.note}` : ""}</span>
                </div>
                <span className="arw">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 8h11M9 4l4 4-4 4" /></svg>
                </span>
              </div>
            )}

            <p className="form-note" style={{ marginTop: 16 }}>
              {onOwnPlatform
                ? "Playing on our own Cloudflare Stream player, simulcasting to YouTube at the same time."
                : "Showing the YouTube live embed for now. Once Cloudflare Stream is connected, this becomes our own player and YouTube runs as the simulcast."}
            </p>
          </div>

          <LiveChat />
        </div>

        {schedule.length > 0 && (
          <div className="sec" style={{ paddingTop: 72 }}>
            <span className="eyebrow">What&apos;s coming up</span>
            <h2 className="anton big">Broadcast<br /><span className="or">schedule</span></h2>
            <ul className="schedule" style={{ marginTop: 32 }}>
              {schedule.map((s, i) => (
                <li key={i}>
                  <span className="when">{s.when}</span>
                  <span className="what"><strong>{s.title}</strong><span>{s.note}</span></span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
