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
};

function fmt(d: string) {
  if (!d) return "-";
  const t = new Date(d);
  return isNaN(t.getTime()) ? "-" : t.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminUsers() {
  const [users, setUsers] = useState<ViewerRow[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "demo" | "error">("loading");
  const [msg, setMsg] = useState("");

  async function load() {
    try {
      const token = await getIdToken();
      const res = await fetch("/api/admin/users", { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
      const d = await res.json();
      if (!res.ok) { setState("error"); setMsg(d.error || "Could not load users."); return; }
      if (!d.configured) { setState("demo"); return; }
      setUsers(d.users || []);
      setState("ready");
    } catch { setState("error"); setMsg("Could not load users."); }
  }
  useEffect(() => { load(); }, []);

  async function remove(u: ViewerRow) {
    if (!confirm(`Remove ${u.name || u.email}? They'll lose their account and can't chat until they sign up again.`)) return;
    setMsg("");
    const token = await getIdToken();
    const res = await fetch(`/api/admin/users?uid=${u.uid}`, { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (res.ok) { setUsers((list) => list.filter((x) => x.uid !== u.uid)); setMsg(`${u.name || u.email} removed.`); }
    else setMsg("Could not remove that account.");
  }

  const label = { google: "Google", email: "Email", other: "Other" };

  return (
    <>
      <div className="admin-topbar">
        <div>
          <h1>Users</h1>
          <div className="sub">Everyone who signed up to chat, and how they signed in.</div>
        </div>
        <div className="admin-actions">
          <span className="live-pill"><span className="dot" style={{ background: "var(--amber)" }} /><span>{users.length} accounts</span></span>
        </div>
      </div>

      {msg && <div className="form-ok" style={{ marginBottom: 16 }}>{msg}</div>}

      <div className="panel">
        {state === "loading" && <p className="muted" style={{ fontSize: 13 }}>Loading users...</p>}
        {state === "demo" && <div className="notice"><strong>Connect Firebase to see users.</strong> Viewer accounts appear here once sign-in is live.</div>}
        {state === "error" && <p className="form-error">{msg}</p>}
        {state === "ready" && users.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No one has signed up yet.</p>}

        {state === "ready" && users.length > 0 && (
          <div className="users">
            <div className="users-head">
              <span>Person</span><span>Method</span><span>Joined</span><span>Last seen</span><span />
            </div>
            {users.map((u) => {
              const admin = isAdminEmail(u.email);
              const initials = (u.name || u.email || "?").slice(0, 2).toUpperCase();
              return (
                <div className="user-row" key={u.uid}>
                  <div className="user-id">
                    {u.photo ? <img src={u.photo} alt="" className="user-av" /> : <span className="user-av ph">{initials}</span>}
                    <div style={{ minWidth: 0 }}>
                      <div className="user-name">{u.name || "(no name)"}{admin && <span className="tag-admin">Admin</span>}</div>
                      <div className="user-email">{u.email || "-"}</div>
                    </div>
                  </div>
                  <span className={`prov prov-${u.provider}`}>{label[u.provider]}</span>
                  <span className="muted u-date">{fmt(u.created)}</span>
                  <span className="muted u-date">{fmt(u.lastSignIn)}</span>
                  <span style={{ textAlign: "right" }}>
                    {!admin && <button className="btn btn-ghost btn-xs" type="button" onClick={() => remove(u)}>Remove</button>}
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
