import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { liveWhepUrl, getPlaybackIngest } from "@/lib/stream";
import { activeDestinations } from "@/lib/simulcast";
import { relayStart, relayConfigured } from "@/lib/relay";

// Called by the studio right after Go Live.
//
// Two jobs:
//  1. Forward the WebRTC program to every enabled destination (YouTube, etc).
//  2. ALWAYS forward a copy into Cloudflare input B over RTMPS. That is what
//     gives the public site an HLS player and an automatic recording — a WHIP
//     input produces neither.
//
// Job 2 runs even with zero user destinations, because the site player and the
// archive depend on it.

export async function POST(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const [userDests, playback] = await Promise.all([
    activeDestinations(),
    getPlaybackIngest(),
  ]);

  const dests = userDests.map((d) => ({ id: d.id, url: d.url, key: d.key }));

  // Input B first: the site player matters more than any external platform.
  // playback.url is a complete push URL (SRT, secret embedded), so no separate key.
  if (playback) {
    dests.unshift({ id: "cf-playback", url: playback.url, key: "" });
  }

  if (dests.length === 0) {
    return NextResponse.json({
      ok: true,
      forwarded: 0,
      warning:
        "No destinations and no playback input. The broadcast is live over WebRTC only — " +
        "the site player and the recording will not work. Set CLOUDFLARE_STREAM_PLAYBACK_INPUT_UID.",
    });
  }

  if (!relayConfigured) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Simulcast relay not connected. Set RELAY_URL — without it there is no YouTube " +
          "output, no site player and no recording.",
      },
      { status: 200 }
    );
  }

  // Cloudflare needs a moment after WHIP connects before WHEP playback resolves.
  // Retry briefly rather than failing the whole broadcast on a race.
  let whep: string | null = null;
  for (let i = 0; i < 6; i++) {
    whep = await liveWhepUrl();
    if (whep) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!whep) {
    return NextResponse.json(
      { ok: false, error: "Cloudflare has not published a WebRTC playback URL yet. Try again in a few seconds." },
      { status: 200 }
    );
  }

  const r = await relayStart(whep, dests);
  return NextResponse.json({
    ...r,
    forwarded: r.ok ? dests.length : 0,
    playback: Boolean(playback),
    external: userDests.length,
  });
}
