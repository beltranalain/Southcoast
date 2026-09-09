import { NextResponse } from "next/server";
import { adminConfigured } from "@/lib/firebaseAdmin";
import { requireRole, requireIdentity } from "@/lib/requireAdmin";
import { getTeam, upsertMember, removeMember } from "@/lib/team";
import { ADMIN_EMAILS, isRole, type Role } from "@/lib/admin";

// GET -> the full team (env owners marked "owner") plus the caller's identity.
// Any admin (owner/manager/moderator) may read. Non-admins get 401.
export async function GET(request: Request) {
  const { email, role } = await requireIdentity(request);
  if (!role) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const members = await getTeam();
  const withProtected = members.map((m) => ({
    email: m.email,
    role: m.role,
    protected: ADMIN_EMAILS.includes(m.email), // env owner - cannot be edited/removed
  }));

  return NextResponse.json({
    configured: adminConfigured,
    members: withProtected,
    me: { email, role, isOwner: role === "owner" },
  });
}

// POST { action: "add"|"remove"|"setRole", email, role? } - OWNER ONLY.
export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const role = await requireRole(request);
  if (!role) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  if (role !== "owner") {
    return NextResponse.json({ error: "Owners only." }, { status: 403 });
  }

  if (!adminConfigured) {
    return NextResponse.json({ ok: false, demo: true, members: await getTeam() });
  }

  const action = body?.action;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const wantRole: Role | undefined = isRole(body?.role) ? body.role : undefined;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  try {
    if (action === "remove") {
      const res = await removeMember(email);
      if (!res.ok) return NextResponse.json({ error: res.error || "Failed." }, { status: 400 });
      return NextResponse.json({ ok: true, members: await annotate() });
    }

    if (action === "add" || action === "setRole") {
      if (!wantRole) {
        return NextResponse.json({ error: "A valid role is required." }, { status: 400 });
      }
      const res = await upsertMember(email, wantRole);
      if (!res.ok) return NextResponse.json({ error: res.error || "Failed." }, { status: 400 });
      return NextResponse.json({ ok: true, members: await annotate() });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Save failed." }, { status: 500 });
  }
}

async function annotate() {
  const members = await getTeam();
  return members.map((m) => ({
    email: m.email,
    role: m.role,
    protected: ADMIN_EMAILS.includes(m.email),
  }));
}
