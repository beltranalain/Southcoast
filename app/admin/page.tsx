import Link from "next/link";
import { getAllStats, getLiveInfo, youtubeConfigured } from "@/lib/youtube";
import { CHANNELS, PRIMARY_CHANNEL } from "@/lib/channels";
import { formatCount } from "@/lib/format";

export default async function AdminOverview() {
  const stats = await getAllStats(CHANNELS.map((c) => c.channelId));
  const live = await getLiveInfo(PRIMARY_CHANNEL.channelId);

  return (
    <>
      <div className="admin-topbar">
        <div>
          <h1>Overview</h1>
          <div className="sub">Real numbers from your connected channels.</div>
        </div>
        <div className="admin-actions">
          <span className={`live-pill${live.live ? " is-live" : ""}`}>
            <span className="dot" /><span>{live.live ? "Live now" : "Offline"}</span>
          </span>
          <Link className="btn btn-primary btn-sm" href="/admin/go-live">Go Live</Link>
        </div>
      </div>

      {!youtubeConfigured && (
        <div className="notice" style={{ marginBottom: 22 }}>
          <strong>YouTube not connected.</strong> Add YOUTUBE_API_KEY to fill in subscribers,
          views, and video counts across all three channels.
        </div>
      )}

      <div className="stat-grid">
        <div className="stat-card"><div className="k">Subscribers</div><div className="v">{formatCount(stats?.subscribers)}</div><div className="d flat">All channels</div></div>
        <div className="stat-card"><div className="k">Total views</div><div className="v">{formatCount(stats?.views)}</div><div className="d flat">All-time</div></div>
        <div className="stat-card"><div className="k">Videos</div><div className="v">{formatCount(stats?.videos)}</div><div className="d flat">Published on YouTube</div></div>
        <div className="stat-card"><div className="k">Live status</div><div className="v">{live.live ? "On air" : "Off air"}</div><div className="d flat">{live.viewers != null ? `${live.viewers.toLocaleString()} watching` : "The South Coast Cane Show"}</div></div>
      </div>

      <div className="two-col">
        <div className="panel">
          <h3>Channels</h3>
          <div className="panel-sub">Connected via the YouTube Data API.</div>
          {CHANNELS.map((c) => (
            <div className="dest-row" key={c.key}>
              <div><div className="dest-name">{c.name}</div><div className="dest-meta">youtube.com/{c.handle}</div></div>
              <a className="btn btn-ghost btn-sm" href={c.url} target="_blank" rel="noopener noreferrer">Open</a>
            </div>
          ))}
        </div>
        <div className="panel">
          <h3>Recent activity</h3>
          <div className="panel-sub">Broadcast and upload events.</div>
          <p className="muted" style={{ fontSize: "13.5px" }}>
            Events will appear here once you go live or Cloudflare Stream webhooks are connected.
            Nothing is fabricated - this stays empty until real events come in.
          </p>
        </div>
      </div>
    </>
  );
}
