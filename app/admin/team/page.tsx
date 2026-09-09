"use client";

import { useEffect, useState } from "react";
import { getIdToken } from "@/lib/firebase";
import { useAdminRole } from "@/lib/adminRole";
import { ROLES, type Role } from "@/lib/admin";

type Member = { email: string; role: Role; protected?: boolean };

const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  moderator: "Moderator",
};

const ROLE_HELP: { role: Role; text: string }[] = [
  { role: "owner", text: "Full access, including Team management." },
  { role: "manager", text: "Full access except Team management." },
  { role: "moderator", text: "Limited: Overview, Go Live, and Users (chat / user moderation) only." },
];

export default function AdminTeam() {
  const { isOwner } = useAdminRole();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string>("");
  const [err, setErr] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<Role>("moderator");

  async function load() {
    setLoading(true);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/admin/team", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      const d = await res.json();
      if (res.ok) setMembers(Array.isArray(d.members) ? d.members : []);
      else setErr(d.error || "Failed to load team.");
    } catch {
      setErr("Failed to load team.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isOwner) load();
    else setLoading(false);
  }, [isOwner]);

  async function post(action: string, email: string, role?: Role) {
    setBusy(true);
    setNote("");
    setErr("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/admin/team", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action, email, role }),
      });
      const d = await res.json();
      if (!res.ok) {
        setErr(d.error || "Save failed.");
        return;
      }
      if (Array.isArray(d.members)) setMembers(d.members);
      setNote(d.demo ? "Demo mode - changes are not saved." : "Saved.");
    } catch {
      setErr("Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!email.includes("@")) {
      setErr("Enter a valid email.");
      return;
    }
    await post("add", email, newRole);
    setNewEmail("");
  }

  if (!isOwner) {
    return (
      <>
        <div className="admin-topbar">
          <div>
            <h1>Team</h1>
            <div className="sub">Staff and roles.</div>
          </div>
        </div>
        <div className="notice">
          <strong>Owners only.</strong> Only an owner can manage the team.
        </div>
      </>
    );
  }

  return (
    <>
      <div className="admin-topbar">
        <div>
          <h1>Team</h1>
          <div className="sub">Add staff and control what each person can see.</div>
        </div>
        <div className="admin-actions">
          <button className="btn btn-ghost btn-sm" type="button" onClick={load} disabled={loading || busy}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {note && <div className="notice" style={{ marginBottom: 16 }}>{note}</div>}
      {err && <div className="notice" style={{ marginBottom: 16 }}><strong>Error.</strong> {err}</div>}

      <div className="two-col">
        <div>
          <div className="panel">
            <h3>Team members</h3>
            <div className="panel-sub">
              Owners marked &quot;protected&quot; are set in configuration and can&apos;t be removed or
              changed here, so you can never lock yourself out.
            </div>
            {loading ? (
              <p className="muted">Loading...</p>
            ) : members.length === 0 ? (
              <p className="muted">No team members yet.</p>
            ) : (
              members.map((m) => (
                <div className="dest-row" key={m.email}>
                  <div>
                    <div className="dest-name">{m.email}</div>
                    <div className="dest-meta">
                      {m.protected ? "Owner - protected" : ROLE_LABEL[m.role]}
                    </div>
                  </div>
                  {m.protected ? (
                    <span className="health health-ok"><span className="health-dot" />Owner</span>
                  ) : (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <select
                        value={m.role}
                        disabled={busy}
                        onChange={(e) => post("setRole", m.email, e.target.value as Role)}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                        ))}
                      </select>
                      <button
                        className="btn btn-ghost btn-sm"
                        type="button"
                        disabled={busy}
                        onClick={() => post("remove", m.email)}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="panel">
            <h3>Add team member</h3>
            <div className="panel-sub">Invite a staff account by email and pick a role.</div>
            <form onSubmit={addMember}>
              <div className="form-field">
                <label>Email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="person@example.com"
                  disabled={busy}
                />
              </div>
              <div className="form-field">
                <label>Role</label>
                <select value={newRole} disabled={busy} onChange={(e) => setNewRole(e.target.value as Role)}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                  ))}
                </select>
              </div>
              <button className="btn btn-sm" type="submit" disabled={busy}>
                {busy ? "Saving..." : "Add member"}
              </button>
            </form>
          </div>

          <div className="panel">
            <h3>What each role can do</h3>
            {ROLE_HELP.map((r) => (
              <div className="dest-row" key={r.role}>
                <div>
                  <div className="dest-name">{ROLE_LABEL[r.role]}</div>
                  <div className="dest-meta">{r.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
