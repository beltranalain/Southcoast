import { NextResponse } from "next/server";
import { getAdminDb, adminConfigured } from "@/lib/firebaseAdmin";
import { requireRole } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

// GET -> recent tips + totals (from the Firestore `tips` collection).
// Tips are owner|manager only (matches the Tips page access).
export async function GET(request: Request) {
  if (!adminConfigured) return NextResponse.json({ configured: false, tips: [], total: 0, count: 0 });
  const role = await requireRole(request);
  if (role !== "owner" && role !== "manager") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  const db = getAdminDb();
  if (!db) return NextResponse.json({ configured: false, tips: [], total: 0, count: 0 });

  try {
    const snap = await db.collection("tips").orderBy("ts", "desc").limit(200).get();
    const tips = snap.docs.map((d) => {
      const x = d.data();
      return { name: String(x.name || "A viewer"), amount: Number(x.amount) || 0, message: String(x.message || ""), ts: Number(x.ts) || 0 };
    });
    const total = tips.reduce((s, t) => s + t.amount, 0);
    return NextResponse.json({ configured: true, tips, total, count: tips.length });
  } catch {
    // No tips yet (collection may not exist) - just report empty.
    return NextResponse.json({ configured: true, tips: [], total: 0, count: 0 });
  }
}
