import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { relayWarm } from "@/lib/relay";

// The relay scales to zero between broadcasts, so the first request after an
// idle period pays a cold start AND waits on MediaMTX. The studio calls this on
// mount so the machine is awake and warm by the time the host hits Go Live.
export async function POST(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  return NextResponse.json(await relayWarm());
}
