import { NextResponse } from "next/server";
import { listOutputs, createOutput, deleteOutput, updateOutput, streamConfigured } from "@/lib/stream";
import { requireAdmin } from "@/lib/requireAdmin";

// GET -> current simulcast outputs
export async function GET(request: Request) {
  if (!streamConfigured) return NextResponse.json({ configured: false, outputs: [] });
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  return NextResponse.json({ configured: true, outputs: await listOutputs() });
}

// POST { url, streamKey } -> add a destination
export async function POST(request: Request) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const url = String(body.url || "").trim();
  const streamKey = String(body.streamKey || "").trim();
  if (!url || !streamKey) return NextResponse.json({ error: "URL and stream key are required." }, { status: 400 });
  const r = await createOutput(url, streamKey);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}

// PATCH { id, enabled } -> pause/resume a destination
export async function PATCH(request: Request) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const ok = await updateOutput(id, Boolean(body.enabled));
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}

// DELETE ?id=<outputId> -> remove a destination
export async function DELETE(request: Request) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const ok = await deleteOutput(id);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
