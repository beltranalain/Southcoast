import { NextResponse } from "next/server";
import { getLiveInputStatus } from "@/lib/stream";

export const dynamic = "force-dynamic";

// Public: is the Cloudflare live input currently receiving a broadcast?
// Cached briefly so many viewers polling don't hammer the Cloudflare API.
let cache: { t: number; live: boolean } | null = null;

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.t < 4000) return NextResponse.json({ live: cache.live });

  const uid =
    process.env.CLOUDFLARE_STREAM_LIVE_INPUT_UID ||
    process.env.NEXT_PUBLIC_CF_STREAM_LIVE_INPUT_UID ||
    "";
  const s = uid ? await getLiveInputStatus(uid) : null;
  const live = Boolean(s?.connected);
  cache = { t: now, live };
  return NextResponse.json({ live });
}
