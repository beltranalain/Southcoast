"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ADMIN_NAV } from "@/lib/adminNav";
import { BRAND } from "@/lib/siteData";
import { firebaseConfigured, getFirebaseAuth } from "@/lib/firebase";
import { signOut } from "firebase/auth";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const auth = getFirebaseAuth();
    if (auth) await signOut(auth);
    router.push("/admin/login");
  }

  return (
    <div className="admin">
      <aside className="admin-side">
        <div className="admin-brand">
          <span className="brand-mark">SC</span>
          <span className="brand-name">{BRAND.name}<span>Studio</span></span>
        </div>
        <ul className="admin-nav">
          {ADMIN_NAV.map((item) => {
            const active =
              item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link href={item.href} className={active ? "active" : ""}>
                  <span className="ico" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="admin-side-foot">
          <Link className="btn btn-ghost btn-sm" href="/" style={{ justifyContent: "center" }}>
            View public site
          </Link>
          {firebaseConfigured && (
            <button className="btn btn-ghost btn-sm" onClick={handleSignOut}>
              Sign out
            </button>
          )}
        </div>
      </aside>
      <main className="admin-main">
        {!firebaseConfigured && (
          <div className="notice" style={{ marginBottom: 20 }}>
            <strong>Demo mode.</strong> Connect Firebase (see .env.local.example) to turn on
            real sign-in and saving. Everything below is fully interactive with sample data.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
