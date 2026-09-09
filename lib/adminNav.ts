import type { Role } from "./admin";

// `roles` = which roles may see this nav item AND reach the page. This is the
// SINGLE SOURCE OF TRUTH for admin page access - both the nav (navForRole) and
// the hard client/route guards (pageAllowed) read from it.
//   owner    = everything, including Team.
//   manager  = everything except Team.
//   host     = Go Live, Videos, Schedule (runs/schedules shows).
//   moderator= Go Live + Users (chat / user moderation).
export type AdminNavItem = { href: string; label: string; roles: Role[] };

const ALL_FULL: Role[] = ["owner", "manager"];

export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin", label: "Overview", roles: ["owner", "manager"] },
  { href: "/admin/go-live", label: "Go Live", roles: ["owner", "manager", "host", "moderator"] },
  { href: "/admin/videos", label: "Videos", roles: ["owner", "manager", "host"] },
  { href: "/admin/schedule", label: "Schedule", roles: ["owner", "manager", "host"] },
  { href: "/admin/content", label: "Content", roles: ALL_FULL },
  { href: "/admin/branding", label: "Branding", roles: ALL_FULL },
  { href: "/admin/users", label: "Users", roles: ["owner", "manager", "moderator"] },
  { href: "/admin/tips", label: "Tips", roles: ALL_FULL },
  { href: "/admin/costs", label: "Costs", roles: ALL_FULL },
  { href: "/admin/analytics", label: "Analytics", roles: ALL_FULL },
  { href: "/admin/settings", label: "Settings", roles: ALL_FULL },
  { href: "/admin/team", label: "Team", roles: ["owner"] },
  { href: "/admin/help", label: "Help", roles: ["owner", "manager", "host", "moderator"] },
];

// Extra (non-nav) pathnames that share access with a nav item. Studio + On Air
// are part of "Go Live" and follow the same role list.
const PATH_ALIASES: Record<string, string> = {
  "/admin/studio": "/admin/go-live",
  "/admin/on-air": "/admin/go-live",
};

// Map every known admin pathname to the roles allowed to reach it.
const ACCESS: Record<string, Role[]> = (() => {
  const map: Record<string, Role[]> = {};
  for (const item of ADMIN_NAV) map[item.href] = item.roles;
  for (const [alias, target] of Object.entries(PATH_ALIASES)) {
    if (map[target]) map[alias] = map[target];
  }
  return map;
})();

// Nav items visible to a role (drives the sidebar).
export function navForRole(role: Role | null): AdminNavItem[] {
  if (!role) return [];
  return ADMIN_NAV.filter((item) => item.roles.includes(role));
}

// Normalize a pathname to a known access key. Trailing slashes stripped; the
// login page is exempt (handled by the layout). Unknown /admin subpaths fall
// through to the safe default (owner/manager only).
function accessKey(pathname: string): string {
  let p = pathname || "";
  if (p.length > 1 && p.endsWith("/")) p = p.replace(/\/+$/, "");
  return p;
}

// HARD access check: may this role reach this pathname? Unknown admin subpaths
// default to owner/manager only (safe default). The login page is always
// allowed (the layout gates it separately).
export function pageAllowed(pathname: string, role: Role | null): boolean {
  if (!role) return false;
  const key = accessKey(pathname);
  if (key === "/admin/login") return true;
  const allowed = ACCESS[key];
  if (allowed) return allowed.includes(role);
  // Unknown admin subpath -> owner/manager only.
  return role === "owner" || role === "manager";
}

// Where to send a role when they land somewhere they can't access.
// owner/manager -> Overview; host/moderator -> Go Live.
export function defaultPathForRole(role: Role | null): string {
  if (role === "host" || role === "moderator") return "/admin/go-live";
  return "/admin";
}
