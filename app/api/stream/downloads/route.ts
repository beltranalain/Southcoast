import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { enableMp4Download, streamConfigured } from "@/lib/stream";

export const dynamic = "force-dynamic";

// POST { uid } -> enable (and poll) a CORS-enabled MP4 download for a Stream
// video, so an uploaded clip can play in the intro bumper. Returns
// { ready, url, percent }. Client calls this repeatedly until ready:true.
export async function POST(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (!streamConfigured) {
    return NextResponse.json({ error: "Cloudflare Stream is not connected." }, { status: 400 });
  }
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const uid = String(body?.uid || "").trim();
  if (!uid) return NextResponse.json({ error: "Missing uid." }, { status: 400 });

  const d = await enableMp4Download(uid);
  // null = video still processing; tell the client to keep polling.
  if (!d) return NextResponse.json({ ready: false, url: "", percent: 0, processing: true });
  return NextResponse.json(d);
}
