import "server-only";

import { getAdminAuth, adminConfigured } from "./firebaseAdmin";
import { roleForEmail } from "./team";
import type { Role } from "./admin";

// Verify the caller's Firebase ID token and resolve their team role. Viewer
// accounts (chat sign-in) pass verifyIdToken but resolve to no role, so this
// keeps them out of the Studio API. Env owners always resolve to "owner".
// Returns the verified role, or null if not signed in / not on the team.
export async function requireRole(request: Request): Promise<Role | null> {
  if (!adminConfigured) return "owner"; // demo mode - no Firebase Admin configured
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const auth = getAdminAuth();
  if (!auth || !token) return null;
  try {
    const decoded = await auth.verifyIdToken(token);
    return await roleForEmail(decoded.email);
  } catch {
    return null;
  }
}

// True if the caller resolves to any role (env owner OR team member).
export async function requireAdmin(request: Request): Promise<boolean> {
  return (await requireRole(request)) != null;
}

// Verify the token and return the caller's email + role for the client gate.
export async function requireIdentity(
  request: Request
): Promise<{ email: string | null; role: Role | null }> {
  if (!adminConfigured) return { email: null, role: "owner" }; // demo mode
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const auth = getAdminAuth();
  if (!auth || !token) return { email: null, role: null };
  try {
    const decoded = await auth.verifyIdToken(token);
    const email = decoded.email ?? null;
    return { email, role: await roleForEmail(email) };
  } catch {
    return { email: null, role: null };
  }
}
