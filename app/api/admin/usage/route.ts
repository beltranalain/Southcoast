import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { getAdminDb, adminConfigured } from "@/lib/firebaseAdmin";
import { getStreamUsage, STORAGE_PER_1K_MIN, DELIVERY_PER_1K_MIN } from "@/lib/usage";
import { getSiteConfig } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

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

// GET -> estimated monthly cost breakdown + total + budget.
export async function GET(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const [usage, settings, config] = await Promise.all([getStreamUsage(), readSettings(), getSiteConfig()]);

  const storageCost = (usage.storedMinutes / 1000) * STORAGE_PER_1K_MIN;
  const deliveryCost = usage.deliveredMinutes != null ? (usage.deliveredMinutes / 1000) * DELIVERY_PER_1K_MIN : null;
  const total = storageCost + (deliveryCost ?? 0);

  // Auto-defaults for the estimator, pulled from real data where possible.
  const showsPerMonth = showsPerMonthFrom(config.schedule || []);
  const avgShowMinutes = usage.avgVideoMinutes > 0 ? Math.round(usage.avgVideoMinutes / 5) * 5 : 120;
  // If Cloudflare analytics are on, derive avg concurrent viewers from real
  // delivered minutes; otherwise use the saved default (or a fallback).
  const showMinutesThisMonth = showsPerMonth * avgShowMinutes;
  const derivedViewers = usage.deliveredMinutes != null && showMinutesThisMonth > 0
    ? Math.round(usage.deliveredMinutes / showMinutesThisMonth)
    : null;
  const typicalViewers = settings.typicalViewers || derivedViewers || 50;
  const estimate = {
    showsPerMonth,
    avgShowMinutes,
    typicalViewers,
    derivedViewers,
    savedViewers: settings.typicalViewers || null,
    scheduleCount: (config.schedule || []).length,
    avgFromRecordings: usage.avgVideoMinutes > 0,
  };

  const breakdown = [
    { key: "cf-storage", name: "Cloudflare Stream - storage", detail: `${Math.round(usage.storedMinutes).toLocaleString()} min stored · ${usage.videoCount} recordings`, cost: storageCost, free: false },
    { key: "cf-delivery", name: "Cloudflare Stream - delivery", detail: usage.deliveredMinutes != null ? `${Math.round(usage.deliveredMinutes).toLocaleString()} min watched this month` : "Add “Account Analytics Read” to your Cloudflare API token to see live numbers - use the estimator below meanwhile", cost: deliveryCost, free: false },
    { key: "firebase", name: "Firebase", detail: "Auth + Firestore (Spark free tier)", cost: 0, free: true },
    { key: "youtube", name: "YouTube Data API", detail: "Free (quota-based)", cost: 0, free: true },
    { key: "workers", name: "Cloudflare Workers + Realtime", detail: "Chat + guests (free tier)", cost: 0, free: true },
    { key: "vercel", name: "Vercel", detail: "Hosting (Hobby)", cost: 0, free: true },
  ];

  return NextResponse.json({
    configured: usage.configured,
    total,
    budget: settings.budget,
    breakdown,
    estimate,
    prices: { storagePer1k: STORAGE_PER_1K_MIN, deliveryPer1k: DELIVERY_PER_1K_MIN },
  });
}

// POST { budget } -> set the monthly budget cap (soft - drives the alert).
export async function POST(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (!adminConfigured) return NextResponse.json({ saved: false });
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const patch: Record<string, number> = {};
  if ("budget" in body) patch.monthlyBudget = Math.max(0, Math.min(100000, Number(body.budget) || 0));
  if ("typicalViewers" in body) patch.typicalViewers = Math.max(0, Math.min(10000000, Number(body.typicalViewers) || 0));
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  try {
    const db = getAdminDb();
    await db?.collection("site").doc("settings").set(patch, { merge: true });
    return NextResponse.json({ saved: true, budget: patch.monthlyBudget, typicalViewers: patch.typicalViewers });
  } catch {
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
}
