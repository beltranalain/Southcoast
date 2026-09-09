import { NextResponse } from "next/server";
import { getSiteConfig } from "@/lib/siteConfig";
import { getAdminDb, adminConfigured } from "@/lib/firebaseAdmin";
import { requireRole } from "@/lib/requireAdmin";
import type { Role } from "@/lib/admin";
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
  if (section !== "content" && section !== "branding" && section !== "schedule" && section !== "scene" && section !== "bumper" && section !== "sounds") {
    return NextResponse.json({ error: "Unknown section." }, { status: 400 });
  }
  if (!data || typeof data !== "object") {
    return NextResponse.json({ error: "Missing data." }, { status: 400 });
  }

  // Demo mode: nothing to save to yet - report back so the UI can explain.
  if (!adminConfigured) {
    return NextResponse.json({ saved: false, demo: true });
  }

  // Verify the caller's token + role server-side (do not rely on the client).
  // - content / branding: owner|manager only.
  // - schedule / scene / sounds / bumper: owner|manager|host (a host runs and
  //   schedules shows).
  const role = await requireRole(request);
  if (!role) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const editorRoles: Role[] = ["owner", "manager"];
  const showRoles: Role[] = ["owner", "manager", "host"];
  const needed = section === "content" || section === "branding" ? editorRoles : showRoles;
  if (!needed.includes(role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const db = getAdminDb();
    if (!db) throw new Error("no db");

    if (section === "schedule") {
      // data.items = array of { when, title, note }
      const items = Array.isArray(data.items) ? data.items : [];
      const clean = items
        .slice(0, 20)
        .map((it: any) => {
          const cover = typeof it.cover === "string" ? it.cover : "";
          return {
            when: String(it.when ?? "").slice(0, 80),
            title: String(it.title ?? "").slice(0, 120),
            note: String(it.note ?? "").slice(0, 160),
            startsAt: Number(it.startsAt) || 0,
            tz: String(it.tz ?? "").slice(0, 40),
            // Only keep small inline cover images (resized client-side) so the
            // schedule doc stays well under Firestore's 1MB limit.
            cover: cover.startsWith("data:image") && cover.length < 200_000 ? cover : "",
          };
        })
        .filter((it: any) => it.title);
      await db.collection("site").doc("schedule").set({ items: clean });
      return NextResponse.json({ saved: true });
    }

    if (section === "scene") {
      const img = (v: any) => (typeof v === "string" && v.startsWith("data:image") && v.length < 700_000 ? v : "");
      const clean = {
        enabled: Boolean(data.enabled),
        mode: ["none", "chroma", "ml"].includes(data.mode) ? data.mode : "none",
        chroma: String(data.chroma ?? "#00b140").slice(0, 9),
        background: img(data.background),
        frame: img(data.frame),
        logo: img(data.logo),
        tickerOn: Boolean(data.tickerOn),
        tickerLabel: String(data.tickerLabel ?? "").slice(0, 40),
        ticker: String(data.ticker ?? "").slice(0, 2000),
      };
      await db.collection("site").doc("scene").set(clean);
      return NextResponse.json({ saved: true });
    }

    if (section === "bumper") {
      const bg = typeof data.background === "string" ? data.background : "";
      const url = typeof data.videoUrl === "string" ? data.videoUrl : "";
      const clean = {
        enabled: Boolean(data.enabled),
        mode: ["card", "video"].includes(data.mode) ? data.mode : "card",
        headline: String(data.headline ?? "").slice(0, 80),
        subtext: String(data.subtext ?? "").slice(0, 160),
        background: bg.startsWith("data:image") && bg.length < 700_000 ? bg : "",
        videoUrl: url.startsWith("http") && url.length < 500 ? url : "",
        startsAt: Number(data.startsAt) || 0,
      };
      await db.collection("site").doc("bumper").set(clean);
      return NextResponse.json({ saved: true });
    }

    if (section === "sounds") {
      // data.items = array of { id, label, url }. Keep the doc under Firestore's
      // 1MB limit: cap the pad count and only keep small inline audio data URLs.
      const items = Array.isArray(data.items) ? data.items : [];
      const clean = items
        .slice(0, 12)
        .map((it: any) => {
          const url = typeof it.url === "string" ? it.url : "";
          return {
            id: String(it.id ?? "").slice(0, 60),
            label: String(it.label ?? "").slice(0, 30),
            url: url.startsWith("data:audio") && url.length < 250_000 ? url : "",
          };
        })
        .filter((it: any) => it.id && it.url);
      await db.collection("site").doc("sounds").set({ items: clean });
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
