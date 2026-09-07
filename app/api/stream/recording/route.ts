import { NextResponse } from "next/server";
import { getRecordingMode, setRecordingMode, streamConfigured } from "@/lib/stream";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

// GET -> is auto-recording on? POST { enabled } -> turn it on/off.
export async function GET(request: Request) {
  if (!streamConfigured) return NextResponse.json({ configured: false, enabled: false });
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const mode = await getRecordingMode();
  return NextResponse.json({ configured: true, enabled: mode === "automatic" });
}

export async function POST(request: Request) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const ok = await setRecordingMode(Boolean(body.enabled));
  return NextResponse.json({ ok, enabled: Boolean(body.enabled) }, { status: ok ? 200 : 400 });
}
