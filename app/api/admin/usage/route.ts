import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { getAdminDb, adminConfigured } from "@/lib/firebaseAdmin";
import { STORAGE_PER_1K_MIN, DELIVERY_PER_1K_MIN } from "@/lib/usage";
import { getCostEstimate } from "@/lib/costEstimate";

export const dynamic = "force-dynamic";

// GET -> estimated monthly cost breakdown + total + budget.
export async function GET(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { usage, budget, estimate } = await getCostEstimate();

  const storageCost = (usage.storedMinutes / 1000) * STORAGE_PER_1K_MIN;
  const deliveryCost = usage.deliveredMinutes != null ? (usage.deliveredMinutes / 1000) * DELIVERY_PER_1K_MIN : null;
  const total = storageCost + (deliveryCost ?? 0);

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
    budget,
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
