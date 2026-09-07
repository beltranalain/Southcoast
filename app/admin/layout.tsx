"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { firebaseConfigured, getFirebaseAuth } from "@/lib/firebase";
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

  useEffect(() => {
    if (!firebaseConfigured) return;
    if (checked && !user && !isLogin) router.replace("/admin/login");
  }, [checked, user, isLogin, router]);

  // The login page renders on its own, without the dashboard shell.
  if (isLogin) return <>{children}</>;

  // While verifying auth, avoid flashing protected content.
  if (firebaseConfigured && (!checked || !user)) {
    return (
      <div className="signin-wrap">
        <p className="muted">Loading Studio...</p>
      </div>
    );
  }

  return <AdminShell>{children}</AdminShell>;
}
