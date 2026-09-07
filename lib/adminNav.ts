export type AdminNavItem = { href: string; label: string };

export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/go-live", label: "Go Live" },
  { href: "/admin/on-air", label: "On Air" },
  { href: "/admin/videos", label: "Videos" },
  { href: "/admin/schedule", label: "Schedule" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/branding", label: "Branding" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/settings", label: "Settings" },
];
