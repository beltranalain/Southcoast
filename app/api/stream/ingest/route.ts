import { NextResponse } from "next/server";
import { getLiveInput, streamConfigured } from "@/lib/stream";
import { requireAdmin } from "@/lib/requireAdmin";

// GET -> ingest details for the live input (WHIP publish URL + OBS keys).
// The WHIP URL is a publish credential, so this route requires an admin.
export async function GET(request: Request) {
  if (!streamConfigured) {
    return NextResponse.json({ configured: false });
  }
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const ingest = await getLiveInput();
  return NextResponse.json({ configured: true, ingest });
}
