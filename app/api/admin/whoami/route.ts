import { NextResponse } from "next/server";
import { requireIdentity } from "@/lib/requireAdmin";

// Returns the verified caller's identity + role, used by the client admin gate
// to know whether to allow access and which nav to show. Any signed-in viewer
// who is not on the team resolves to role: null (not authorized).
export async function GET(request: Request) {
  const { email, role } = await requireIdentity(request);
  if (!role) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  return NextResponse.json({ email, role, isOwner: role === "owner" });
}
