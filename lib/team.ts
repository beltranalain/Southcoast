import "server-only";

import { getAdminDb } from "./firebaseAdmin";
import { ADMIN_EMAILS, isRole, type Role } from "./admin";

// Server-only team logic. The team lives in Firestore at site/team as
// { members: [{ email, role }] }. Env/default owners (ADMIN_EMAILS) are ALWAYS
// merged in as role "owner" and can never be removed or demoted, so the owner
// can't lock themselves out. If Firestore is unavailable we fall back to the
// env owners alone.

export type TeamMember = { email: string; role: Role };

function envOwners(): TeamMember[] {
  return ADMIN_EMAILS.map((email) => ({ email: email.toLowerCase(), role: "owner" as Role }));
}

// Read the raw Firestore team members (no env merge). Best-effort: returns []
// if Firestore is unavailable or the doc is missing/malformed.
async function readRawMembers(): Promise<TeamMember[]> {
  try {
    const db = getAdminDb();
    if (!db) return [];
    const snap = await db.collection("site").doc("team").get();
    const data = snap.exists ? snap.data() : null;
    const raw = Array.isArray(data?.members) ? data!.members : [];
    const out: TeamMember[] = [];
    for (const m of raw) {
      const email = typeof m?.email === "string" ? m.email.trim().toLowerCase() : "";
      const role = m?.role;
      if (email && isRole(role)) out.push({ email, role });
    }
    return out;
  } catch {
    return [];
  }
}

// The full, merged team. Env owners always appear as "owner" and take
// precedence over any Firestore entry for the same email. Deduped by email.
export async function getTeam(): Promise<TeamMember[]> {
  const owners = envOwners();
  const ownerEmails = new Set(owners.map((o) => o.email));
  const stored = await readRawMembers();

  const merged: TeamMember[] = [...owners];
  const seen = new Set(ownerEmails);
  for (const m of stored) {
    if (seen.has(m.email)) continue; // env owner wins; dedupe
    merged.push(m);
    seen.add(m.email);
  }
  return merged;
}

// Resolve a user's effective role, or null if they are not on the team.
export async function roleForEmail(email?: string | null): Promise<Role | null> {
  if (!email) return null;
  const target = email.toLowerCase();
  // Env owners are always owners, even if Firestore is down.
  if (ADMIN_EMAILS.includes(target)) return "owner";
  const team = await getTeam();
  const found = team.find((m) => m.email === target);
  return found ? found.role : null;
}

// Any non-null role (env owner OR team member) counts as an admin.
export async function isAdminEmailServer(email?: string | null): Promise<boolean> {
  return (await roleForEmail(email)) != null;
}

// --- Mutations (owner-only; enforced by the API route) -------------------

type WriteResult = { ok: boolean; members: TeamMember[]; error?: string };

async function writeMembers(members: TeamMember[]): Promise<void> {
  const db = getAdminDb();
  if (!db) throw new Error("no db");
  await db.collection("site").doc("team").set({ members });
}

// Add or update a member. Env owners are protected: you may not change their
// role (they stay "owner"). Returns the merged team on success.
export async function upsertMember(email: string, role: Role): Promise<WriteResult> {
  const target = email.trim().toLowerCase();
  if (!target || !target.includes("@")) return { ok: false, members: await getTeam(), error: "Invalid email." };
  if (!isRole(role)) return { ok: false, members: await getTeam(), error: "Invalid role." };
  if (ADMIN_EMAILS.includes(target)) {
    // Protected env owner - no-op, they are always owner.
    return { ok: true, members: await getTeam() };
  }
  const stored = await readRawMembers();
  const idx = stored.findIndex((m) => m.email === target);
  if (idx >= 0) {
    if (stored[idx].role === role) return { ok: true, members: await getTeam() }; // no-op
    stored[idx] = { email: target, role };
  } else {
    stored.push({ email: target, role });
  }
  await writeMembers(stored);
  return { ok: true, members: await getTeam() };
}

// Remove a member. Env owners can never be removed.
export async function removeMember(email: string): Promise<WriteResult> {
  const target = email.trim().toLowerCase();
  if (ADMIN_EMAILS.includes(target)) {
    return { ok: false, members: await getTeam(), error: "This owner is protected and cannot be removed." };
  }
  const stored = await readRawMembers();
  const next = stored.filter((m) => m.email !== target);
  if (next.length === stored.length) return { ok: true, members: await getTeam() }; // no-op
  await writeMembers(next);
  return { ok: true, members: await getTeam() };
}
