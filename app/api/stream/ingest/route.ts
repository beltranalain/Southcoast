import { NextResponse } from "next/server";
import { getLiveInput, streamConfigured } from "@/lib/stream";
import { getAdminAuth, adminConfigured } from "@/lib/firebaseAdmin";

// GET -> ingest details for the live input (WHIP publish URL + OBS keys).
// The WHIP URL is a publish credential, so this route requires the admin to be
// signed in (when Firebase is configured).
export async function GET(request: Request) {
  if (!streamConfigured) {
    return NextResponse.json({ configured: false });
  }

  if (adminConfigured) {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const auth = getAdminAuth();
    if (!auth || !token) {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    try {
      await auth.verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
  }

  const ingest = await getLiveInput();
  return NextResponse.json({ configured: true, ingest });
}
