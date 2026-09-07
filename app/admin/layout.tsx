"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { firebaseConfigured, getFirebaseAuth } from "@/lib/firebase";
import { isAdminEmail } from "@/lib/admin";
import { onAuthStateChanged, type User } from "firebase/auth";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/admin/login";

  const [checked, setChecked] = useState(!firebaseConfigured);
  const [user, setUser] = useState<User | null>(null);

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

  const isAdmin = Boolean(user && isAdminEmail(user.email));

  useEffect(() => {
    if (!firebaseConfigured || isLogin || !checked) return;
    if (!user) router.replace("/admin/login");
    else if (!isAdmin) router.replace("/"); // a signed-in viewer, not an admin
  }, [checked, user, isAdmin, isLogin, router]);

  // The login page renders on its own, without the dashboard shell.
  if (isLogin) return <>{children}</>;

  // While verifying auth (or bouncing a non-admin), avoid flashing content.
  if (firebaseConfigured && (!checked || !isAdmin)) {
    return (
      <div className="signin-wrap">
        <p className="muted">Loading Studio...</p>
      </div>
    );
  }

  return <AdminShell>{children}</AdminShell>;
}
