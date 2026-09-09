import type { Role } from "./admin";

// `roles` = which roles may see this nav item. Omitted = all admins.
// moderator sees only Overview, Go Live, Users. manager sees all except Team.
// owner sees everything including Team.
export type AdminNavItem = { href: string; label: string; roles?: Role[] };

export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin", label: "Overview" }, // all roles
  { href: "/admin/go-live", label: "Go Live" }, // all roles
  { href: "/admin/videos", label: "Videos", roles: ["owner", "manager"] },
  { href: "/admin/schedule", label: "Schedule", roles: ["owner", "manager"] },
  { href: "/admin/content", label: "Content", roles: ["owner", "manager"] },
  { href: "/admin/branding", label: "Branding", roles: ["owner", "manager"] },
  { href: "/admin/users", label: "Users" }, // all roles (incl. moderator)
  { href: "/admin/tips", label: "Tips", roles: ["owner", "manager"] },
  { href: "/admin/costs", label: "Costs", roles: ["owner", "manager"] },
  { href: "/admin/analytics", label: "Analytics", roles: ["owner", "manager"] },
  { href: "/admin/settings", label: "Settings", roles: ["owner", "manager"] },
  { href: "/admin/team", label: "Team", roles: ["owner"] },
];

// Moderators are limited to these three sections.
const MODERATOR_ALLOWED = new Set(["/admin", "/admin/go-live", "/admin/users"]);

export function navForRole(role: Role | null): AdminNavItem[] {
  if (!role) return [];
  return ADMIN_NAV.filter((item) => {
    if (role === "moderator") return MODERATOR_ALLOWED.has(item.href);
    if (item.roles) return item.roles.includes(role);
    return true;
  });
}
