import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { listDestinations, addDestination, removeDestination, setDestinationEnabled, toPublic } from "@/lib/simulcast";
import { relayConfigured } from "@/lib/relay";

// Simulcast destinations (YouTube/Facebook/Twitch) stored in Firestore. Keys
// are secret and never returned to the browser (only hasKey).

export async function GET(request: Request) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const destinations = (await listDestinations()).map(toPublic);
  return NextResponse.json({ relayConfigured, destinations });
}

export async function POST(request: Request) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const r = await addDestination({ platform: String(body.platform || "Custom"), url: String(body.url || ""), key: String(body.key || "") });
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}

export async function PATCH(request: Request) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const r = await setDestinationEnabled(id, Boolean(body.enabled));
  return NextResponse.json(r);
}

export async function DELETE(request: Request) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const r = await removeDestination(id);
  return NextResponse.json(r);
}
