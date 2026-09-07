import { NextResponse } from "next/server";
import { listStreamVideos } from "@/lib/stream";

export const dynamic = "force-dynamic";

// Public: recent ready VODs (past broadcasts) to reel in the home hero
// background. Cached a minute so the homepage doesn't hammer the Stream API.
let cache: { t: number; videos: string[] } | null = null;

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.t < 60000) return NextResponse.json({ videos: cache.videos });

  const list = await listStreamVideos();
  const videos = list
    .filter((v: any) => v?.readyToStream && (v?.duration ?? 0) > 0)
    .map((v: any) => v.uid as string)
    .filter(Boolean)
    .slice(0, 6);

  cache = { t: now, videos };
  return NextResponse.json({ videos });
}
