"use client";

import { useEffect, useRef, useState } from "react";

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
  const [messages, setMessages] = useState<ChatMessage[]>(enabled ? [] : DEMO);
  const [count, setCount] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [name, setName] = useState("Guest");
  const [draft, setDraft] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setName(guestName()); }, []);

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
    if (!text || !connected || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: "chat", name, text }));
    setDraft("");
  }

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
      <form className="chat-f" onSubmit={send}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={enabled ? (connected ? `Chatting as ${name}` : "Connecting...") : "Say something"}
          disabled={!enabled || !connected}
          maxLength={500}
          aria-label="Chat message"
        />
        <button type="submit" disabled={!enabled || !connected}>Send</button>
      </form>
    </aside>
  );
}
