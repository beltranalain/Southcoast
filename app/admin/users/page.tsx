"use client";

import { useEffect, useState } from "react";
import { getIdToken } from "@/lib/firebase";
import { isAdminEmail } from "@/lib/admin";

type ViewerRow = {
  uid: string;
  email: string;
  name: string;
  photo: string;
  provider: "google" | "email" | "other";
  created: string;
  lastSignIn: string;
  disabled: boolean;
};

function fmt(d: string) {
  if (!d) return "-";
  const t = new Date(d);
  return isNaN(t.getTime()) ? "-" : t.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function within(d: string, days: number) {
  const t = new Date(d).getTime();
  return !isNaN(t) && Date.now() - t < days * 86400000;
}

const GoogleG = () => (
  <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z" /><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" /><path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" /><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" /></svg>
);

export default function AdminUsers() {
  const [users, setUsers] = useState<ViewerRow[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "demo" | "error">("loading");
  const [msg, setMsg] = useState("");

  async function authFetch(url: string, init: RequestInit = {}) {
    const token = await getIdToken();
    return fetch(url, { ...init, headers: { ...(init.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  }

  async function load() {
    try {
      const res = await authFetch("/api/admin/users", { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) { setState("error"); setMsg(d.error || "Could not load users."); return; }
      if (!d.configured) { setState("demo"); return; }
      setUsers(d.users || []);
      setState("ready");
    } catch { setState("error"); setMsg("Could not load users."); }
  }
  useEffect(() => { load(); }, []);

  async function moderate(action: "ban" | "timeout", u: ViewerRow, seconds?: number) {
    setMsg("");
    const res = await authFetch("/api/chat/moderate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, room: "live", uid: u.uid, name: u.name || u.email, seconds }),
    });
    setMsg(res.ok ? `${u.name || u.email} ${action === "ban" ? "banned from chat" : "timed out (10 min)"}.` : "Could not apply that.");
  }

  async function suspend(u: ViewerRow, disabled: boolean) {
    if (disabled && !confirm(`Suspend ${u.name || u.email}? They won't be able to sign in until you un-suspend them.`)) return;
    setMsg("");
    const res = await authFetch("/api/admin/users", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: u.uid, disabled }),
    });
    if (res.ok) { setUsers((l) => l.map((x) => (x.uid === u.uid ? { ...x, disabled } : x))); setMsg(`${u.name || u.email} ${disabled ? "suspended" : "un-suspended"}.`); }
    else setMsg("Could not update that account.");
  }

  async function remove(u: ViewerRow) {
    if (!confirm(`Remove ${u.name || u.email}? Their account is deleted; they'd have to sign up again.`)) return;
    setMsg("");
    const res = await authFetch(`/api/admin/users?uid=${u.uid}`, { method: "DELETE" });
    if (res.ok) { setUsers((l) => l.filter((x) => x.uid !== u.uid)); setMsg(`${u.name || u.email} removed.`); }
    else setMsg("Could not remove that account.");
  }

  // KPIs
  const total = users.length;
  const newWeek = users.filter((u) => within(u.created, 7)).length;
  const activeWeek = users.filter((u) => within(u.lastSignIn, 7)).length;
  const google = users.filter((u) => u.provider === "google").length;
  const email = users.filter((u) => u.provider === "email").length;
  const kpis = [
    { n: total, label: "Total users" },
    { n: newWeek, label: "New this week" },
    { n: activeWeek, label: "Active this week" },
    { n: google, label: "Google sign-ins" },
    { n: email, label: "Email sign-ins" },
  ];

  return (
    <>
      <div className="admin-topbar">
        <div>
          <h1>Users</h1>
          <div className="sub">Everyone who signed up to chat, and how they signed in.</div>
        </div>
        <div className="admin-actions">
          <span className="live-pill"><span className="dot" style={{ background: "var(--amber)" }} /><span>{total} accounts</span></span>
        </div>
      </div>

      {state === "ready" && (
        <div className="kpis">
          {kpis.map((k) => (
            <div className="kpi" key={k.label}><div className="kpi-n">{k.n}</div><div className="kpi-l">{k.label}</div></div>
          ))}
        </div>
      )}

      {msg && <div className="form-ok" style={{ marginBottom: 16 }}>{msg}</div>}

      <div className="panel">
        {state === "loading" && <p className="muted" style={{ fontSize: 13 }}>Loading users...</p>}
        {state === "demo" && <div className="notice"><strong>Connect Firebase to see users.</strong> Viewer accounts appear here once sign-in is live.</div>}
        {state === "error" && <p className="form-error">{msg}</p>}
        {state === "ready" && users.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No one has signed up yet.</p>}

        {state === "ready" && users.length > 0 && (
          <div className="users">
            <div className="users-head">
              <span>Person</span><span>Method</span><span>Joined</span><span>Last seen</span><span>Actions</span>
            </div>
            {users.map((u) => {
              const admin = isAdminEmail(u.email);
              const initials = (u.name || u.email || "?").slice(0, 2).toUpperCase();
              return (
                <div className="user-row" key={u.uid}>
                  <div className="user-id">
                    {u.photo ? <img src={u.photo} alt="" className="user-av" /> : <span className="user-av ph">{initials}</span>}
                    <div style={{ minWidth: 0 }}>
                      <div className="user-name">
                        {u.name || "(no name)"}
                        {admin && <span className="tag-admin">Admin</span>}
                        {u.disabled && <span className="tag-suspended">Suspended</span>}
                      </div>
                      <div className="user-email">{u.email || "-"}</div>
                    </div>
                  </div>
                  <span className={`prov prov-${u.provider}`}>{u.provider === "google" ? <><GoogleG /> Google</> : u.provider === "email" ? "Email" : "Other"}</span>
                  <span className="muted u-date">{fmt(u.created)}</span>
                  <span className="muted u-date">{fmt(u.lastSignIn)}</span>
                  <span className="u-actions">
                    {!admin && (
                      <>
                        <button className="btn btn-ghost btn-xs" type="button" title="10-minute chat timeout" onClick={() => moderate("timeout", u, 600)}>Timeout</button>
                        <button className="btn btn-ghost btn-xs" type="button" title="Ban from chat" onClick={() => moderate("ban", u)}>Ban</button>
                        {u.disabled
                          ? <button className="btn btn-ghost btn-xs" type="button" onClick={() => suspend(u, false)}>Unsuspend</button>
                          : <button className="btn btn-ghost btn-xs" type="button" title="Block sign-in" onClick={() => suspend(u, true)}>Suspend</button>}
                        <button className="btn btn-ghost btn-xs danger" type="button" onClick={() => remove(u)}>Remove</button>
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
