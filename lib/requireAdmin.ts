import "server-only";

import { getAdminAuth, adminConfigured } from "./firebaseAdmin";
import { isAdminEmail } from "./admin";

// Verify the caller's Firebase ID token AND that its email is on the admin
// allowlist. Viewer accounts (chat sign-in) pass verifyIdToken but are NOT
// admins, so this keeps them out of the Studio API.
export async function requireAdmin(request: Request): Promise<boolean> {
  if (!adminConfigured) return true; // demo mode - no Firebase Admin configured
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const auth = getAdminAuth();
  if (!auth || !token) return false;
  try {
    const decoded = await auth.verifyIdToken(token);
    return isAdminEmail(decoded.email);
  } catch {
    return false;
  }
}
