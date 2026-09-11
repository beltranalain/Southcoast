import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { relayStatus } from "@/lib/relay";

// Live health of the relay's forwards (per-destination up/down). Used by the
// Sources tab to show whether YouTube is actually receiving.
export async function GET(request: Request) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  return NextResponse.json(await relayStatus());
}
