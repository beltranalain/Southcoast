import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { getAdminDb, adminConfigured } from "@/lib/firebaseAdmin";
import { getLiveInput, streamConfigured } from "@/lib/stream";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { getAllStats } from "@/lib/youtube";
import { CHANNELS } from "@/lib/channels";

export const dynamic = "force-dynamic";

type Status = "ok" | "fail" | "off";

// Run a live check: "off" if not configured, "ok" if it responds, "fail" if it
// errors. Never returns or logs the key itself.
async function check(present: boolean, fn: () => Promise<boolean>): Promise<Status> {
  if (!present) return "off";
  try {
    return (await fn()) ? "ok" : "fail";
  } catch {
    return "fail";
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, r) => setTimeout(() => r(new Error("timeout")), ms))]);
}

export async function GET(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const chatWs = process.env.NEXT_PUBLIC_CHAT_WS_URL || "";
  const chatHttp = chatWs.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  const resendKey = process.env.RESEND_API_KEY || "";

  const [firebase, youtube, stream, chat, stripe, resend] = await Promise.all([
    check(adminConfigured, async () => {
      const db = getAdminDb();
      if (!db) return false;
      await db.collection("site").limit(1).get();
      return true;
    }),
    check(Boolean(process.env.YOUTUBE_API_KEY), async () => {
      const s = await getAllStats(CHANNELS.map((c) => c.channelId));
      return Boolean(s);
    }),
    check(streamConfigured, async () => Boolean(await getLiveInput())),
    check(Boolean(chatHttp), async () => {
      const r = await withTimeout(fetch(chatHttp, { cache: "no-store" }), 5000);
      return r.ok;
    }),
    check(stripeConfigured, async () => {
      const st = getStripe();
      if (!st) return false;
      await st.balance.retrieve();
      return true;
    }),
    check(Boolean(resendKey), async () => {
      const r = await withTimeout(fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${resendKey}` } }), 5000);
      return r.ok;
    }),
  ]);

  return NextResponse.json({ firebase, youtube, stream, chat, stripe, resend });
}
