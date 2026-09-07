"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { firebaseConfigured, getFirebaseAuth } from "@/lib/firebase";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";

type ChatMessage = { id: string; name: string; text: string; ts: number };

const WS_BASE = process.env.NEXT_PUBLIC_CHAT_WS_URL || "";
const ROOM = "live";
const HOST = "South Coast Cane";

const DEMO: ChatMessage[] = [
  { id: "d1", name: "OrangeBowl82", text: "been saying this since August", ts: 0 },
  { id: "d2", name: "PatioRegular", text: "third quarter adjustment was the whole ballgame", ts: 0 },
  { id: "d3", name: "CoralWayKev", text: "run it back next week same time?", ts: 0 },
  { id: "d4", name: HOST, text: "same time, and I'm bringing the tape", ts: 0 },
];

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

  const wsRef = useRef<WebSocket | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { if (!requireAuth) setGuest(guestName()); }, [requireAuth]);

  useEffect(() => {
    if (!requireAuth) return;
    const auth = getFirebaseAuth();
    if (!auth) { setAuthReady(true); return; }
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

  function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !canSend || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: "chat", name, text }));
    setDraft("");
  }

  async function google() {
    const auth = getFirebaseAuth();
    if (!auth) return;
    setAuthErr("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch {
      setAuthErr("Google sign-in was cancelled or blocked.");
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
        {messages.map((m) => (
          <div className={`msg${m.name === HOST ? " host" : ""}`} key={m.id}>
            <span className="src">Site</span><b>{m.name}</b>{m.text}
          </div>
        ))}
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
            placeholder={canSend ? `Chatting as ${name}` : connected ? "Connecting..." : "Say something"}
            disabled={!canSend}
            maxLength={500}
            aria-label="Chat message"
          />
          <button type="submit" disabled={!canSend}>Send</button>
        </form>
      )}

      {requireAuth && viewer && (
        <div className="chat-who">
          Signed in as <b>{name}</b> · <button type="button" onClick={leave}>Sign out</button>
        </div>
      )}
    </aside>
  );
}
