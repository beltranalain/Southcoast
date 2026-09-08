import "server-only";

import { getStreamUsage, DELIVERY_PER_1K_MIN } from "./usage";
import { getSiteConfig } from "./siteConfig";
import { getAdminDb, adminConfigured } from "./firebaseAdmin";

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

async function readSettings(): Promise<{ budget: number; typicalViewers: number }> {
  if (!adminConfigured) return { budget: 0, typicalViewers: 0 };
  try {
    const db = getAdminDb();
    const doc = await db?.collection("site").doc("settings").get();
    const d = doc?.data() || {};
    return { budget: Number(d.monthlyBudget) || 0, typicalViewers: Number(d.typicalViewers) || 0 };
  } catch {
    return { budget: 0, typicalViewers: 0 };
  }
}

// Estimate shows-per-month from the saved schedule: prefer the count of shows in
// the next 30 days; if none are that soon, infer the cadence from the spread of
// future shows; fall back to a sensible default.
function showsPerMonthFrom(schedule: { startsAt?: number }[]): number {
  const now = Date.now();
  const future = schedule.map((s) => Number(s.startsAt) || 0).filter((t) => t > now).sort((a, b) => a - b);
  const soon = future.filter((t) => t <= now + MONTH_MS).length;
  if (soon > 0) return soon;
  if (future.length >= 2) {
    const span = future[future.length - 1] - future[0];
    return span > 0 ? Math.max(1, Math.round(future.length / (span / MONTH_MS))) : future.length;
  }
  return future.length || 4;
}

export type CostEstimate = {
  showsPerMonth: number;
  avgShowMinutes: number;
  typicalViewers: number;
  derivedViewers: number | null;
  savedViewers: number | null;
  scheduleCount: number;
  avgFromRecordings: boolean;
  perMin: number;
  perShow: number;
  perMonth: number;
};

// Single source of truth for the streaming-cost estimate, built from real data:
// shows/month from the schedule, show length from recordings, viewers from a
// saved default (or derived from Cloudflare analytics when the token allows).
// Returns the raw usage + saved budget too so callers avoid a second fetch.
export async function getCostEstimate() {
  const [usage, settings, config] = await Promise.all([getStreamUsage(), readSettings(), getSiteConfig()]);

  const perMin = DELIVERY_PER_1K_MIN / 1000;
  const showsPerMonth = showsPerMonthFrom(config.schedule || []);
  const avgShowMinutes = usage.avgVideoMinutes > 0 ? Math.round(usage.avgVideoMinutes / 5) * 5 : 120;
  const showMinutesThisMonth = showsPerMonth * avgShowMinutes;
  const derivedViewers = usage.deliveredMinutes != null && showMinutesThisMonth > 0
    ? Math.round(usage.deliveredMinutes / showMinutesThisMonth)
    : null;
  const typicalViewers = settings.typicalViewers || derivedViewers || 50;
  const perShow = typicalViewers * avgShowMinutes * perMin;
  const perMonth = perShow * showsPerMonth;

  const estimate: CostEstimate = {
    showsPerMonth,
    avgShowMinutes,
    typicalViewers,
    derivedViewers,
    savedViewers: settings.typicalViewers || null,
    scheduleCount: (config.schedule || []).length,
    avgFromRecordings: usage.avgVideoMinutes > 0,
    perMin,
    perShow,
    perMonth,
  };

  return { usage, budget: settings.budget, estimate };
}
