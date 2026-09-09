"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BRAND } from "@/lib/siteData";
import { firebaseConfigured, getFirebaseAuth } from "@/lib/firebase";
import { isEnvOwner } from "@/lib/admin";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Demo mode: no Firebase yet, just enter the dashboard.
    if (!firebaseConfigured) {
      router.push("/admin");
      return;
    }

    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      if (!auth) throw new Error("Auth unavailable.");
      const cred = await signInWithEmailAndPassword(auth, email, password);
      // Env owners are admitted immediately. Everyone else is checked against
      // the team via the server (whoami re-verifies the token + role).
      let allowed = isEnvOwner(cred.user.email);
      if (!allowed) {
        try {
          const token = await cred.user.getIdToken();
          const res = await fetch("/api/admin/whoami", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          allowed = res.ok;
        } catch {
          allowed = false;
        }
      }
      if (!allowed) {
        await signOut(auth);
        setError("This account isn't an admin.");
        return;
      }
      router.push("/admin");
    } catch {
      setError("Sign in failed. Check the email and password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="signin-wrap">
      <div className="signin-card">
        <div className="brand">
          <span className="brand-mark">SC</span>
          <span className="brand-name">{BRAND.name}<span>Studio Admin</span></span>
        </div>
        <h2>Studio sign in</h2>
        <p className="st">Private dashboard for the creator. Not part of the public site.</p>
        <form onSubmit={onSubmit}>
          <div className="form-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="you@southcoastcane.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" type="submit" style={{ width: "100%" }} disabled={busy}>
            {busy ? "Signing in..." : "Sign in to Studio"}
          </button>
          {error && <p className="form-error">{error}</p>}
          <p className="form-note">
            {firebaseConfigured
              ? "Protected by Firebase Authentication."
              : "Demo mode - connect Firebase to enable real sign-in. Press the button to enter."}
          </p>
        </form>
      </div>
    </div>
  );
}
