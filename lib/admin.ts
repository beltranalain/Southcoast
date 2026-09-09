// Admin email allowlist. Not secret - it just decides which signed-in accounts
// may reach the Studio. Viewers who sign in to chat are NOT admins.
// Override via NEXT_PUBLIC_ADMIN_EMAILS (comma-separated) to change without a
// code edit. Keyed by EMAIL (not UID). Only these accounts can reach /admin.
const DEFAULT_ADMINS = ["info@donkeyideas.com", "southcoastcane@gmail.com"];

const fromEnv = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const ADMIN_EMAILS = fromEnv.length ? fromEnv : DEFAULT_ADMINS;

export function isAdminEmail(email?: string | null): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}
