import { NextResponse } from "next/server";
import { getAdminAuth, adminConfigured } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

type ViewerRow = {
  uid: string;
  email: string;
  name: string;
  photo: string;
  provider: "google" | "email" | "other";
  created: string;
  lastSignIn: string;
};

function providerOf(record: any): ViewerRow["provider"] {
  const ids = (record.providerData || []).map((p: any) => p.providerId);
  if (ids.includes("google.com")) return "google";
  if (ids.includes("password")) return "email";
  return "other";
}

// GET -> list of viewer/admin accounts (email, provider, dates).
export async function GET(request: Request) {
  if (!adminConfigured) return NextResponse.json({ configured: false, users: [] });
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const auth = getAdminAuth();
  if (!auth) return NextResponse.json({ configured: false, users: [] });

  try {
    const res = await auth.listUsers(1000);
    const users: ViewerRow[] = res.users.map((u) => ({
      uid: u.uid,
      email: u.email || "",
      name: u.displayName || "",
      photo: u.photoURL || "",
      provider: providerOf(u),
      created: u.metadata.creationTime || "",
      lastSignIn: u.metadata.lastSignInTime || "",
    }));
    // Newest first.
    users.sort((a, b) => (new Date(b.created).getTime() || 0) - (new Date(a.created).getTime() || 0));
    return NextResponse.json({ configured: true, users });
  } catch {
    return NextResponse.json({ error: "Could not load users." }, { status: 500 });
  }
}

// DELETE ?uid=... -> remove a viewer account.
export async function DELETE(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const uid = new URL(request.url).searchParams.get("uid") || "";
  if (!uid) return NextResponse.json({ error: "Missing uid." }, { status: 400 });
  const auth = getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Not configured." }, { status: 400 });
  try {
    await auth.deleteUser(uid);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not remove that account." }, { status: 500 });
  }
}
