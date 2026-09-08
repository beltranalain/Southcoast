import "server-only";

import { listStreamVideos, streamConfigured } from "./stream";

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN = process.env.CLOUDFLARE_STREAM_API_TOKEN;

// Cloudflare Stream list prices (USD). Estimates - the authoritative bill is in
// the Cloudflare dashboard.
export const STORAGE_PER_1K_MIN = 5; // per 1,000 minutes stored / month
export const DELIVERY_PER_1K_MIN = 1; // per 1,000 minutes delivered

export type StreamUsage = {
  configured: boolean;
  storedMinutes: number;
  deliveredMinutes: number | null; // null when analytics aren't available
  videoCount: number;
  avgVideoMinutes: number; // mean recording length - used to auto-fill the estimator
};

// Stored minutes = sum of VOD durations. Delivered minutes = this month's
// adaptive viewing minutes via Cloudflare's GraphQL analytics (best-effort;
// needs Account Analytics Read on the token).
export async function getStreamUsage(): Promise<StreamUsage> {
  if (!streamConfigured) return { configured: false, storedMinutes: 0, deliveredMinutes: null, videoCount: 0, avgVideoMinutes: 0 };

  const vids = await listStreamVideos();
  const storedMinutes = vids.reduce((s: number, v: any) => s + (Number(v.duration) || 0), 0) / 60;
  const avgVideoMinutes = vids.length ? storedMinutes / vids.length : 0;

  let deliveredMinutes: number | null = null;
  try {
    const now = new Date();
    const since = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const until = now.toISOString().slice(0, 10);
    const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        query: `query($tag:String!,$since:Date!,$until:Date!){viewer{accounts(filter:{accountTag:$tag}){streamMinutesViewedAdaptiveGroups(filter:{date_geq:$since,date_leq:$until},limit:10000){sum{minutesViewed}}}}}`,
        variables: { tag: ACCOUNT, since, until },
      }),
    });
    const d = await res.json();
    const groups = d?.data?.viewer?.accounts?.[0]?.streamMinutesViewedAdaptiveGroups;
    if (Array.isArray(groups)) {
      deliveredMinutes = groups.reduce((s: number, g: any) => s + (Number(g?.sum?.minutesViewed) || 0), 0);
    }
  } catch {
    /* analytics unavailable - leave null */
  }

  return { configured: true, storedMinutes, deliveredMinutes, videoCount: vids.length, avgVideoMinutes };
}
