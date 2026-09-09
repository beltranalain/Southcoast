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

// Team roles. "owner" = full access incl. Team management; "manager" = full
// access except Team; "host" = go live, schedule, videos; "moderator" = go
// live + chat/user moderation only.
export type Role = "owner" | "manager" | "host" | "moderator";

export const ROLES: Role[] = ["owner", "manager", "host", "moderator"];

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as string[]).includes(v);
}

// True if this email is a hard-coded / env owner. These accounts are ALWAYS
// owners and can never be removed or demoted from the Team UI, so the owner
// can't accidentally lock themselves out.
export function isEnvOwner(email?: string | null): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}

export function isAdminEmail(email?: string | null): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}
