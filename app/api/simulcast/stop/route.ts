import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { relayStop } from "@/lib/relay";

// Called when the studio ends a broadcast. Tells the relay to stop all forwards.
export async function POST(request: Request) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const r = await relayStop();
  return NextResponse.json(r);
}
