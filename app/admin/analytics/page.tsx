import { getAllStats, getUploads, youtubeConfigured } from "@/lib/youtube";
import { CHANNELS, PRIMARY_CHANNEL } from "@/lib/channels";
import { formatCount } from "@/lib/format";

export default async function AdminAnalytics() {
  const stats = await getAllStats(CHANNELS.map((c) => c.channelId));
  const recent = await getUploads(PRIMARY_CHANNEL.uploadsPlaylist, 8);

  return (
    <>
      <div className="admin-topbar">
        <div>
          <h1>Analytics</h1>
          <div className="sub">Pulled live from YouTube. No sample data.</div>
        </div>
      </div>

      {!youtubeConfigured && (
        <div className="notice" style={{ marginBottom: 22 }}>
          <strong>Connect YouTube</strong> to see subscribers, views, and recent uploads here.
          Deeper daily analytics (watch time, retention) arrive with YouTube Analytics OAuth later.
        </div>
      )}

      <div className="stat-grid">
        <div className="stat-card"><div className="k">Subscribers</div><div className="v">{formatCount(stats?.subscribers)}</div><div className="d flat">All channels</div></div>
        <div className="stat-card"><div className="k">Total views</div><div className="v">{formatCount(stats?.views)}</div><div className="d flat">All-time</div></div>
        <div className="stat-card"><div className="k">Videos</div><div className="v">{formatCount(stats?.videos)}</div><div className="d flat">Published</div></div>
        <div className="stat-card"><div className="k">Channels</div><div className="v">{CHANNELS.length}</div><div className="d flat">Connected</div></div>
      </div>

      <div className="panel">
        <h3>Recent uploads</h3>
        <div className="panel-sub">The South Coast Cane Show - latest from YouTube.</div>
        {recent.length ? (
          <ul className="rank-list">
            {recent.map((v, i) => (
              <li key={v.id}>
                <span className="n">{i + 1}</span>
                <span className="rt">{v.title}</span>
                <span className="rv">{new Date(v.publishedAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted" style={{ fontSize: "13.5px" }}>
            Uploads appear here once the YouTube API key is connected.
          </p>
        )}
      </div>
    </>
  );
}
