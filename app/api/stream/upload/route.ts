import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createDirectUpload, streamConfigured } from "@/lib/stream";

export const dynamic = "force-dynamic";

// POST -> a one-time Cloudflare Stream direct-upload URL. Admin only. The
// browser uploads the file straight to Cloudflare (never through our server).
export async function POST(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (!streamConfigured) {
    return NextResponse.json({ error: "Cloudflare Stream is not connected." }, { status: 400 });
  }
  const upload = await createDirectUpload();
  if (!upload) return NextResponse.json({ error: "Could not start the upload." }, { status: 502 });
  return NextResponse.json(upload);
}
