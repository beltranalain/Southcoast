"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { firebaseConfigured, getFirebaseAuth, getIdToken } from "@/lib/firebase";
import { isEnvOwner } from "@/lib/admin";
import { AdminRoleProvider } from "@/lib/adminRole";
import type { Role } from "@/lib/admin";
import { onAuthStateChanged, type User } from "firebase/auth";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/admin/login";

  const [checked, setChecked] = useState(!firebaseConfigured);
  const [user, setUser] = useState<User | null>(null);
  // null = not yet resolved; "denied" = signed in but not on the team.
  const [role, setRole] = useState<Role | "denied" | null>(firebaseConfigured ? null : "owner");

  useEffect(() => {
    if (!firebaseConfigured) return;
    const auth = getFirebaseAuth();
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setChecked(true);
    });
    return () => unsub();
  }, []);

  // Resolve the caller's role. Env owners are fast-allowed synchronously; all
  // signed-in users are also verified against the team via /api/admin/whoami
  // (which re-verifies the token server-side). Viewers who aren't on the team
  // get role "denied" and are bounced.
  useEffect(() => {
    if (!firebaseConfigured || isLogin) return;
    if (!checked) return;
    if (!user) {
      setRole(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch("/api/admin/whoami", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
        });
        if (cancelled) return;
        if (res.ok) {
          const d = await res.json();
          setRole((d?.role as Role) || "denied");
        } else {
          // Fall back to env-owner fast path if the API is unreachable.
          setRole(isEnvOwner(user.email) ? "owner" : "denied");
        }
      } catch {
        if (!cancelled) setRole(isEnvOwner(user.email) ? "owner" : "denied");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [checked, user, isLogin]);

  const allowed = role !== null && role !== "denied";

  useEffect(() => {
    if (!firebaseConfigured || isLogin || !checked) return;
    if (!user) router.replace("/admin/login");
    else if (role === "denied") router.replace("/"); // signed-in viewer, not an admin
  }, [checked, user, role, isLogin, router]);

  // The login page renders on its own, without the dashboard shell.
  if (isLogin) return <>{children}</>;

  // While verifying auth + role (or bouncing a non-admin), avoid flashing content.
  if (firebaseConfigured && (!checked || !allowed)) {
    return (
      <div className="signin-wrap">
        <p className="muted">Loading Studio...</p>
      </div>
    );
  }

  const effectiveRole: Role = allowed ? (role as Role) : "owner";

  return (
    <AdminRoleProvider
      value={{
        role: effectiveRole,
        email: user?.email ?? null,
        isOwner: effectiveRole === "owner",
      }}
    >
      <AdminShell>{children}</AdminShell>
    </AdminRoleProvider>
  );
}
