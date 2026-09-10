import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { liveHlsUrl } from "@/lib/stream";
import { activeDestinations } from "@/lib/simulcast";
import { relayStart, relayConfigured } from "@/lib/relay";

// Called by the studio right after Go Live. Resolves the Cloudflare HLS URL for
// the current broadcast and tells the relay to forward it to every enabled
// destination. Safe no-op (ok:true) when there are no destinations so it never
// blocks going live.

export async function POST(request: Request) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const dests = await activeDestinations();
  if (dests.length === 0) return NextResponse.json({ ok: true, forwarded: 0, note: "No simulcast destinations enabled." });

  if (!relayConfigured) {
    return NextResponse.json({ ok: false, error: "Simulcast relay not connected. Set RELAY_URL to enable YouTube streaming." }, { status: 200 });
  }

  const hls = await liveHlsUrl();
  if (!hls) return NextResponse.json({ ok: false, error: "No live broadcast to forward yet." }, { status: 200 });

  const r = await relayStart(hls, dests.map((d) => ({ id: d.id, url: d.url, key: d.key })));
  return NextResponse.json({ ...r, forwarded: r.ok ? dests.length : 0 });
}
