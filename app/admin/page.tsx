import Link from "next/link";
import { getAllStats, getStatsByChannel, getLiveInfo, youtubeConfigured } from "@/lib/youtube";
import { CHANNELS, PRIMARY_CHANNEL } from "@/lib/channels";
import { formatCount } from "@/lib/format";
import { getAdminDb, adminConfigured } from "@/lib/firebaseAdmin";
import BarChart from "@/components/BarChart";

const money = (n: number) => "$" + n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const SHORT: Record<string, string> = { "cane-show": "Cane Show", "south-coast-cane": "Retro", "one-thing": "Let Me Tell U" };

export default async function AdminOverview() {
  const [stats, byChannel, live] = await Promise.all([
    getAllStats(CHANNELS.map((c) => c.channelId)),
    getStatsByChannel(CHANNELS.map((c) => c.channelId)),
    getLiveInfo(PRIMARY_CHANNEL.channelId),
  ]);

  // Real revenue from the tips collection (server-side read).
  let tips: { amount: number; ts: number }[] = [];
  if (adminConfigured) {
    try {
      const db = getAdminDb();
      const snap = await db?.collection("tips").orderBy("ts", "desc").limit(1000).get();
      tips = snap?.docs.map((d) => ({ amount: Number(d.data().amount) || 0, ts: Number(d.data().ts) || 0 })) ?? [];
    } catch { /* no tips yet */ }
  }
  const now = Date.now();
  const dayMs = 86400000;
  const revenueTotal = tips.reduce((s, t) => s + t.amount, 0);
  const weekRevenue = tips.filter((t) => t.ts >= now - 7 * dayMs).reduce((s, t) => s + t.amount, 0);

  // Daily revenue for the last 14 days (bucket 0 = 13 days ago, last = today).
  const DAYS = 14;
  const daily = Array.from({ length: DAYS }, () => 0);
  for (const t of tips) {
    const ago = Math.floor((now - t.ts) / dayMs);
    if (ago >= 0 && ago < DAYS) daily[DAYS - 1 - ago] += t.amount;
  }
  const dayLabels = Array.from({ length: DAYS }, (_, i) => new Date(now - (DAYS - 1 - i) * dayMs).getDate().toString());

  // Per-channel figures aligned to our channel order (real YouTube stats).
  const rows = CHANNELS.map((c) => {
    const s = byChannel.find((x) => x.channelId === c.channelId);
    return { label: SHORT[c.key] || c.name, subs: s?.subscribers ?? 0, views: s?.views ?? 0 };
  });

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

      <div className="stat-grid g5">
        <div className="stat-card"><div className="k">Subscribers</div><div className="v">{formatCount(stats?.subscribers)}</div><div className="d flat">All channels</div></div>
        <div className="stat-card"><div className="k">Total views</div><div className="v">{formatCount(stats?.views)}</div><div className="d flat">All-time</div></div>
        <div className="stat-card"><div className="k">Videos</div><div className="v">{formatCount(stats?.videos)}</div><div className="d flat">Published on YouTube</div></div>
        <div className="stat-card"><div className="k">Revenue</div><div className="v">{money(revenueTotal)}</div><div className="d flat">{weekRevenue > 0 ? `${money(weekRevenue)} this week` : "Tips, all-time"}</div></div>
        <div className="stat-card"><div className="k">Live status</div><div className="v">{live.live ? "On air" : "Off air"}</div><div className="d flat">{live.viewers != null ? `${live.viewers.toLocaleString()} watching` : "The South Coast Cane Show"}</div></div>
      </div>

      <div className="panel">
        <h3>Revenue</h3>
        <div className="panel-sub">Tips over the last {DAYS} days{revenueTotal > 0 ? ` - ${money(revenueTotal)} total` : ""}.</div>
        <BarChart data={daily} labels={dayLabels} format={money} />
      </div>

      <div className="two-col">
        <div className="panel">
          <h3>Subscribers by channel</h3>
          <div className="panel-sub">Live from the YouTube Data API.</div>
          <BarChart data={rows.map((r) => r.subs)} labels={rows.map((r) => r.label)} format={formatCount} />
        </div>
        <div className="panel">
          <h3>Views by channel</h3>
          <div className="panel-sub">All-time views per channel.</div>
          <BarChart data={rows.map((r) => r.views)} labels={rows.map((r) => r.label)} format={formatCount} />
        </div>
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
