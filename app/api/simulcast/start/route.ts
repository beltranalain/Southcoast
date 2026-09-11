import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { liveWhepUrl } from "@/lib/stream";
import { activeDestinations } from "@/lib/simulcast";
import { relayStart, relayConfigured } from "@/lib/relay";

// Called by the studio right after Go Live. Forwards the WebRTC program to every
// enabled external destination (YouTube/Facebook/Twitch). The site player plays
// the studio's own Cloudflare input directly, so it needs nothing here.

export async function POST(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  // The site player plays the studio's own live input (input A) via Cloudflare's
  // iframe (WebRTC) - no relay push needed for it. So the relay only forwards to
  // external platforms (YouTube/Facebook/Twitch).
  const userDests = await activeDestinations();
  const dests = userDests.map((d) => ({ id: d.id, url: d.url, key: d.key }));

  if (dests.length === 0) {
    return NextResponse.json({ ok: true, forwarded: 0, note: "No external simulcast destinations enabled." });
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
  return NextResponse.json({ ...r, forwarded: r.ok ? dests.length : 0, external: userDests.length });
}
