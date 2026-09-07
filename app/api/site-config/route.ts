import { NextResponse } from "next/server";
import { getSiteConfig } from "@/lib/siteConfig";
import { getAdminAuth, getAdminDb, adminConfigured } from "@/lib/firebaseAdmin";
import { DEFAULT_CONTENT, DEFAULT_BRANDING } from "@/lib/siteData";

// GET  -> current { content, branding } (Firestore over defaults)
export async function GET() {
  const config = await getSiteConfig();
  return NextResponse.json({ configured: adminConfigured, ...config });
}

// POST { section: "content" | "branding", data: {...} }
// Writes to Firestore after verifying the caller's Firebase ID token.
export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const section = body?.section;
  const data = body?.data;
  if (section !== "content" && section !== "branding" && section !== "schedule") {
    return NextResponse.json({ error: "Unknown section." }, { status: 400 });
  }
  if (!data || typeof data !== "object") {
    return NextResponse.json({ error: "Missing data." }, { status: 400 });
  }

  // Demo mode: nothing to save to yet - report back so the UI can explain.
  if (!adminConfigured) {
    return NextResponse.json({ saved: false, demo: true });
  }

  // Verify the admin is signed in.
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const auth = getAdminAuth();
  if (!auth || !token) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  try {
    await auth.verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  try {
    const db = getAdminDb();
    if (!db) throw new Error("no db");

    if (section === "schedule") {
      // data.items = array of { when, title, note }
      const items = Array.isArray(data.items) ? data.items : [];
      const clean = items
        .slice(0, 50)
        .map((it: any) => ({
          when: String(it.when ?? "").slice(0, 80),
          title: String(it.title ?? "").slice(0, 120),
          note: String(it.note ?? "").slice(0, 160),
        }))
        .filter((it: any) => it.title);
      await db.collection("site").doc("schedule").set({ items: clean });
      return NextResponse.json({ saved: true });
    }

    // Whitelist fields so only known keys are written.
    const allowed = section === "content" ? DEFAULT_CONTENT : DEFAULT_BRANDING;
    const clean: Record<string, unknown> = {};
    for (const key of Object.keys(allowed)) {
      if (key in data) clean[key] = data[key];
    }
    await db.collection("site").doc(section).set(clean, { merge: true });
    return NextResponse.json({ saved: true });
  } catch {
    return NextResponse.json({ error: "Save failed." }, { status: 500 });
  }
}
