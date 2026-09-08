"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import TipModal from "@/components/TipModal";
import { firebaseConfigured, getFirebaseAuth } from "@/lib/firebase";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";

type ChatMessage = { id: string; name: string; text: string; ts: number; tip?: number };

const WS_BASE = process.env.NEXT_PUBLIC_CHAT_WS_URL || "";
const ROOM = "live";
const HOST = "South Coast Cane";
const TIP_PRESETS = [2, 5, 10, 20];

const DEMO: ChatMessage[] = [
  { id: "d1", name: "OrangeBowl82", text: "been saying this since August", ts: 0 },
  { id: "d2", name: "PatioRegular", text: "third quarter adjustment was the whole ballgame", ts: 0 },
  { id: "d3", name: "CoralWayKev", text: "run it back next week same time?", ts: 0 },
  { id: "d4", name: HOST, text: "same time, and I'm bringing the tape", ts: 0 },
];

function googleErr(code?: string): string {
  switch (code) {
    case "auth/operation-not-allowed":
      return "Google sign-in isn't turned on yet in Firebase (Authentication - Sign-in method - enable Google).";
    case "auth/unauthorized-domain":
      return "This site isn't authorized for Google sign-in (Firebase - Authentication - Settings - Authorized domains).";
    case "auth/popup-blocked":
      return "Your browser blocked the sign-in popup. Allow popups and try again.";
    default:
      return `Google sign-in failed${code ? ` (${code})` : ""}. Try email instead.`;
  }
}

function guestName(): string {
  if (typeof window === "undefined") return "Guest";
  const saved = window.localStorage.getItem("cwac-chat-name");
  if (saved) return saved;
  const name = "Guest" + Math.floor(1000 + Math.random() * 9000);
  window.localStorage.setItem("cwac-chat-name", name);
  return name;
}

export default function LiveChat() {
  const enabled = Boolean(WS_BASE);
  const requireAuth = firebaseConfigured; // signed-in viewers only when Firebase is on
  const [messages, setMessages] = useState<ChatMessage[]>(enabled ? [] : DEMO);
  const [count, setCount] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [guest, setGuest] = useState("Guest");
  const [draft, setDraft] = useState("");

  // Viewer auth
  const [, force] = useReducer((x) => x + 1, 0);
  const [viewer, setViewer] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!requireAuth);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [dname, setDname] = useState("");
  const [authErr, setAuthErr] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const [muted, setMuted] = useState<{ banned: boolean; until: number } | null>(null);

  // Editable display name (people can pick a username instead of their real name)
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [nameErr, setNameErr] = useState("");

  // Tipping
  const [tipping, setTipping] = useState(false);
  const [tipAmount, setTipAmount] = useState(5);
  const [tipMsg, setTipMsg] = useState("");
  const [tipBusy, setTipBusy] = useState(false);
  const [tipErr, setTipErr] = useState("");
  const [tipThanks, setTipThanks] = useState(false);
  const [tipSecret, setTipSecret] = useState<string | null>(null); // open modal when set

  const wsRef = useRef<WebSocket | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { if (!requireAuth) setGuest(guestName()); }, [requireAuth]);

  useEffect(() => {
    if (!requireAuth) return;
    const auth = getFirebaseAuth();
    if (!auth) { setAuthReady(true); return; }
    // Complete a redirect-based Google sign-in if we came back from one.
    getRedirectResult(auth).catch((e: any) => { if (e?.code) setAuthErr(googleErr(e.code)); });
    const unsub = onAuthStateChanged(auth, (u) => { setViewer(u); setAuthReady(true); });
    return () => unsub();
  }, [requireAuth]);

  const name = requireAuth
    ? viewer?.displayName || viewer?.email?.split("@")[0] || "Viewer"
    : guest;
  const canSend = enabled && connected && (!requireAuth || Boolean(viewer));

  useEffect(() => {
    if (!enabled) return;
    let closedByUnmount = false;
    function connect() {
      const ws = new WebSocket(`${WS_BASE}/room/${ROOM}/ws`);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!closedByUnmount) retryRef.current = setTimeout(connect, 2500);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (event) => {
        let data: any;
        try { data = JSON.parse(event.data); } catch { return; }
        if (data.type === "history" && Array.isArray(data.messages)) setMessages(data.messages);
        else if (data.type === "chat") setMessages((prev) => [...prev.slice(-199), data]);
        else if (data.type === "count") setCount(data.count);
        else if (data.type === "muted") setMuted({ banned: Boolean(data.banned), until: Number(data.until) || 0 });
        else if (data.type === "moderation") {
          const auth = getFirebaseAuth();
          if (auth?.currentUser && data.uid === auth.currentUser.uid) {
            if (data.action === "unban") setMuted(null);
            else setMuted({ banned: data.action === "ban", until: Number(data.until) || 0 });
          }
        }
      };
    }
    connect();
    return () => {
      closedByUnmount = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [enabled]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages]);

  const isMuted = Boolean(muted && (muted.banned || muted.until > Date.now()));

  function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !canSend || isMuted || !wsRef.current) return;
    const uid = getFirebaseAuth()?.currentUser?.uid || "";
    wsRef.current.send(JSON.stringify({ type: "chat", name, text, uid }));
    setDraft("");
  }

  async function google() {
    const auth = getFirebaseAuth();
    if (!auth) return;
    setAuthErr("");
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (e: any) {
      const code = e?.code || "";
      // Popup blocked / closed / unsupported -> fall back to full-page redirect.
      if (["auth/popup-blocked", "auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/operation-not-supported-in-this-environment"].includes(code)) {
        try { await signInWithRedirect(auth, provider); return; } catch (e2: any) { setAuthErr(googleErr(e2?.code)); return; }
      }
      setAuthErr(googleErr(code));
    }
  }

  async function emailAuth(e: React.FormEvent) {
    e.preventDefault();
    const auth = getFirebaseAuth();
    if (!auth) return;
    setAuthErr("");
    setAuthBusy(true);
    try {
      if (mode === "signup") {
        if (!dname.trim()) { setAuthErr("Pick a display name."); return; }
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), pw);
        await updateProfile(cred.user, { displayName: dname.trim() });
        force();
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), pw);
      }
      setEmail(""); setPw(""); setDname("");
    } catch {
      setAuthErr(mode === "signup" ? "Could not create the account (the email may already be in use)." : "Sign in failed. Check your email and password.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function leave() {
    const auth = getFirebaseAuth();
    if (auth) await signOut(auth);
  }

  async function saveName() {
    const auth = getFirebaseAuth();
    const u = auth?.currentUser;
    const n = newName.trim();
    if (!u) return;
    if (n.length < 2) { setNameErr("Pick a name (2+ characters)."); return; }
    setNameErr("");
    try { await updateProfile(u, { displayName: n }); force(); setEditingName(false); }
    catch { setNameErr("Could not update your name."); }
  }

  // Show a thank-you when returning from Stripe checkout, and clean the URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    if (p.get("tip") === "thanks") {
      setTipThanks(true);
      window.history.replaceState({}, "", window.location.pathname);
      const t = setTimeout(() => setTipThanks(false), 8000);
      return () => clearTimeout(t);
    }
  }, []);

  const tipValue = Math.max(1, Math.min(500, Number(tipAmount) || 0));

  async function startTip() {
    setTipErr(""); setTipBusy(true);
    try {
      const res = await fetch("/api/tips/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: tipValue, message: tipMsg.trim(), name, uid: getFirebaseAuth()?.currentUser?.uid || "" }),
      });
      const d = await res.json();
      if (d.clientSecret) { setTipSecret(d.clientSecret); return; } // open the on-site modal
      setTipErr(d.error || "Could not start the tip.");
    } catch { setTipErr("Could not start the tip."); }
    finally { setTipBusy(false); }
  }

  function onTipPaid() {
    setTipSecret(null);
    setTipping(false);
    setTipMsg("");
    setTipThanks(true);
    setTimeout(() => setTipThanks(false), 8000);
  }

  const showAuth = enabled && requireAuth && authReady && !viewer;

  return (
    <aside className="chat">
      <div className="chat-h">
        <b>Live chat</b>
        <span>
          {enabled
            ? connected
              ? `${count ?? 1} here - Site + YouTube`
              : "Connecting..."
            : "Site + YouTube, merged"}
        </span>
      </div>
      <div className="chat-b" ref={bodyRef}>
        {messages.length === 0 && <p className="muted" style={{ fontSize: "13px" }}>No messages yet. Say hello.</p>}
        {messages.map((m) =>
          m.tip ? (
            <div className="msg tipmsg" key={m.id}>
              <span className="tipamt">${m.tip.toFixed(2)}</span><b>{m.name}</b>{m.text ? <span> {m.text}</span> : null}
            </div>
          ) : (
            <div className={`msg${m.name === HOST ? " is-host" : ""}`} key={m.id}>
              <span className="src">Site</span><b>{m.name}</b>{m.text}
            </div>
          )
        )}
        {!enabled && (
          <p style={{ marginTop: 14, color: "var(--text-dim)", fontSize: "12px" }}>
            Chat backend connects when NEXT_PUBLIC_CHAT_WS_URL is set.
          </p>
        )}
      </div>

      {showAuth ? (
        <div className="chat-auth">
          <p className="chat-auth-t">Sign in to join the chat</p>
          <button type="button" className="btn btn-ghost btn-sm gbtn" onClick={google}>
            <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/></svg>
            Continue with Google
          </button>
          <div className="chat-auth-or"><span>or</span></div>
          <form onSubmit={emailAuth} className="chat-auth-form">
            {mode === "signup" && (
              <input type="text" placeholder="Display name" value={dname} onChange={(e) => setDname(e.target.value)} maxLength={30} />
            )}
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            <input type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
            <button type="submit" className="btn btn-primary btn-sm" disabled={authBusy}>
              {authBusy ? "..." : mode === "signup" ? "Create account" : "Sign in"}
            </button>
          </form>
          <button type="button" className="chat-auth-toggle" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setAuthErr(""); }}>
            {mode === "signup" ? "Have an account? Sign in" : "New here? Create an account"}
          </button>
          {authErr && <p className="form-error" style={{ fontSize: "12px", marginTop: 6 }}>{authErr}</p>}
        </div>
      ) : (
        <form className="chat-f" onSubmit={send}>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              isMuted
                ? muted?.banned ? "You've been removed from chat" : "You're on timeout"
                : canSend ? `Chatting as ${name}` : connected ? "Connecting..." : "Say something"
            }
            disabled={!canSend || isMuted}
            maxLength={500}
            aria-label="Chat message"
          />
          <button type="submit" disabled={!canSend || isMuted}>Send</button>
        </form>
      )}

      {tipThanks && <div className="tip-thanks">Thanks for the tip! It'll show on the stream.</div>}

      {!showAuth && canSend && !isMuted && (
        tipping ? (
          <div className="tip-panel">
            <div className="tip-row">
              {TIP_PRESETS.map((a) => (
                <button key={a} type="button" className={`tip-chip${tipAmount === a ? " on" : ""}`} onClick={() => setTipAmount(a)}>${a}</button>
              ))}
              <input type="number" min={1} max={500} value={tipAmount} onChange={(e) => setTipAmount(Number(e.target.value))} className="tip-custom" aria-label="Custom tip amount" />
            </div>
            <input type="text" placeholder="Add a message (optional)" value={tipMsg} onChange={(e) => setTipMsg(e.target.value)} maxLength={200} className="tip-message" />
            <div className="tip-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={startTip} disabled={tipBusy}>{tipBusy ? "..." : `Tip $${tipValue}`}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setTipping(false); setTipErr(""); }}>Cancel</button>
            </div>
            {tipErr && <p className="form-error" style={{ fontSize: 12 }}>{tipErr}</p>}
          </div>
        ) : (
          <button type="button" className="tip-open" onClick={() => setTipping(true)}>Send a tip</button>
        )
      )}

      {isMuted && (
        <div className="chat-who" style={{ color: "var(--live)" }}>
          {muted?.banned ? "You've been removed from this chat by the host." : "You're on a timeout - you can watch, but can't chat for a bit."}
        </div>
      )}

      {requireAuth && viewer && !isMuted && (
        <div className="chat-who">
          {editingName ? (
            <span className="name-edit">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Pick a display name" maxLength={30} autoFocus onKeyDown={(e) => e.key === "Enter" && saveName()} />
              <button type="button" onClick={saveName}>Save</button>
              <button type="button" onClick={() => { setEditingName(false); setNameErr(""); }}>Cancel</button>
              {nameErr && <span className="form-error" style={{ fontSize: 11 }}>{nameErr}</span>}
            </span>
          ) : (
            <>Signed in as <b>{name}</b> · <button type="button" onClick={() => { setNewName(name); setEditingName(true); }}>Edit name</button> · <button type="button" onClick={leave}>Sign out</button></>
          )}
        </div>
      )}

      {tipSecret && (
        <TipModal
          clientSecret={tipSecret}
          amount={tipValue}
          onSuccess={onTipPaid}
          onClose={() => setTipSecret(null)}
        />
      )}
    </aside>
  );
}
