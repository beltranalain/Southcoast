import { NextResponse } from "next/server";
import { channelByKey, CHANNELS, PRIMARY_CHANNEL } from "@/lib/channels";
import {
  getUploads,
  getLiveInfo,
  getAllStats,
  youtubeConfigured,
} from "@/lib/youtube";

// GET /api/youtube?type=uploads|live|stats&channel=<key>
// Proxies the YouTube Data API so the key never reaches the browser.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "uploads";
  const channelKey = searchParams.get("channel") ?? CHANNELS[0].key;

  if (!youtubeConfigured) {
    return NextResponse.json({ configured: false });
  }

  if (type === "stats") {
    const stats = await getAllStats(CHANNELS.map((c) => c.channelId));
    return NextResponse.json({ configured: true, stats });
  }

  if (type === "live") {
    const info = await getLiveInfo(PRIMARY_CHANNEL.channelId);
    return NextResponse.json({ configured: true, ...info });
  }

  const channel = channelByKey(channelKey);
  if (!channel) {
    return NextResponse.json({ error: "Unknown channel." }, { status: 400 });
  }
  const items = await getUploads(channel.uploadsPlaylist);
  return NextResponse.json({ configured: true, channel: channel.key, items });
}
