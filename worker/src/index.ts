// South Coast Cane - live chat Worker (Cloudflare Durable Objects)
//
// One Durable Object instance per chat room holds every viewer's WebSocket,
// keeps the last ~100 messages, and broadcasts a live viewer count. Uses the
// WebSocket Hibernation API so idle rooms cost almost nothing.

export interface Env {
  CHAT_ROOM: DurableObjectNamespace;
  CHAT_ADMIN_SECRET?: string; // shared secret for host moderation calls
}

type ChatMessage = {
  type: "chat";
  id: string;
  name: string;
  text: string;
  uid: string; // signed-in viewer id (for moderation)
  tip?: number; // dollar amount when this is a paid tip message
  ts: number;
};

const MAX_HISTORY = 100;
const MAX_TEXT = 500;
const MAX_NAME = 40;

export class ChatRoom {
  private state: DurableObjectState;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      // Secret-gated POSTs (checked at the edge): /moderate and /tip.
      if (request.method === "POST") {
        try {
          const body = await request.json();
          if (new URL(request.url).pathname.endsWith("/tip")) await this.handleTip(body);
          else await this.handleModerate(body);
          return new Response("ok");
        } catch {
          return new Response("bad request", { status: 400 });
        }
      }
      return new Response("Expected a WebSocket upgrade.", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    // Accept with hibernation so the DO can sleep between messages.
    this.state.acceptWebSocket(server);

    // Send recent history to the newcomer, then update everyone's count.
    const history = (await this.state.storage.get<ChatMessage[]>("history")) ?? [];
    server.send(JSON.stringify({ type: "history", messages: history }));
    this.broadcastCount();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(_ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;

    let data: any;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    // On-air overlay commands (banners, pinned comments) are relayed live to
    // everyone in the room (e.g. the OBS overlay page) and not stored.
    if (data?.type === "overlay") {
      this.broadcast(JSON.stringify(data));
      return;
    }

    // Studio signaling: participants announce themselves + their Cloudflare
    // Realtime track names so the host/guests can subscribe. We keep the roster
    // as per-socket attachments and broadcast it whenever it changes.
    if (data?.type === "studio") {
      if (data.action === "join" || data.action === "update") {
        _ws.serializeAttachment({ participant: data.participant });
        this.broadcastRoster();
      } else if (data.action === "leave") {
        _ws.serializeAttachment(null);
        this.broadcastRoster();
      } else if (data.action === "control" || data.action === "signal") {
        // host -> guest controls (mute/remove) or generic relay
        this.broadcast(JSON.stringify(data));
      }
      return;
    }

    if (data?.type !== "chat") return;

    const uid = String(data.uid ?? "").slice(0, 128);
    const muted = await this.mutedState(uid);
    if (muted) {
      try { _ws.send(JSON.stringify({ type: "muted", banned: muted.banned, until: muted.until })); } catch {}
      return;
    }

    const text = String(data.text ?? "").slice(0, MAX_TEXT).trim();
    const name = (String(data.name ?? "Guest").slice(0, MAX_NAME).trim() || "Guest").replace(/[\r\n]/g, " ");
    if (!text) return;

    const msg: ChatMessage = {
      type: "chat",
      id: crypto.randomUUID(),
      name,
      text,
      uid,
      ts: Date.now(),
    };

    const history = (await this.state.storage.get<ChatMessage[]>("history")) ?? [];
    history.push(msg);
    while (history.length > MAX_HISTORY) history.shift();
    await this.state.storage.put("history", history);

    this.broadcast(JSON.stringify(msg));
  }

  async webSocketClose(): Promise<void> {
    this.broadcastCount();
    this.broadcastRoster();
  }

  async webSocketError(): Promise<void> {
    this.broadcastCount();
    this.broadcastRoster();
  }

  // Is this uid banned (permanent) or timed out (until a future ts)?
  private async mutedState(uid: string): Promise<{ banned: boolean; until: number } | null> {
    if (!uid) return null;
    const bans = (await this.state.storage.get<string[]>("bans")) ?? [];
    if (bans.includes(uid)) return { banned: true, until: 0 };
    const timeouts = (await this.state.storage.get<Record<string, number>>("timeouts")) ?? {};
    const until = timeouts[uid] ?? 0;
    if (until > Date.now()) return { banned: false, until };
    return null;
  }

  // A paid tip: store it as a highlighted chat message + broadcast a tip event
  // so the studio can pop an on-air alert.
  private async handleTip(body: any): Promise<void> {
    const name = (String(body?.name ?? "A viewer").slice(0, MAX_NAME).trim() || "A viewer").replace(/[\r\n]/g, " ");
    const amount = Math.max(0, Math.round(Number(body?.amount) * 100) / 100);
    const message = String(body?.message ?? "").slice(0, MAX_TEXT).replace(/[\r\n]/g, " ");
    if (!amount) return;

    const msg: ChatMessage = { type: "chat", id: crypto.randomUUID(), name, text: message, uid: "", tip: amount, ts: Date.now() };
    const history = (await this.state.storage.get<ChatMessage[]>("history")) ?? [];
    history.push(msg);
    while (history.length > MAX_HISTORY) history.shift();
    await this.state.storage.put("history", history);

    this.broadcast(JSON.stringify(msg));
    this.broadcast(JSON.stringify({ type: "tip", id: msg.id, name, amount, message, ts: msg.ts }));
  }

  // Host moderation: ban / unban / timeout a viewer by uid.
  private async handleModerate(body: any): Promise<void> {
    const action = String(body?.action ?? "");
    const uid = String(body?.uid ?? "").slice(0, 128);
    const name = String(body?.name ?? "").slice(0, MAX_NAME);

    // Clear the room history (e.g. at the start of a new broadcast) and tell
    // everyone connected to empty their message list. No uid needed.
    if (action === "clear") {
      await this.state.storage.put("history", []);
      this.broadcast(JSON.stringify({ type: "clear" }));
      return;
    }

    if (!uid) return;

    const bans = new Set((await this.state.storage.get<string[]>("bans")) ?? []);
    const timeouts = (await this.state.storage.get<Record<string, number>>("timeouts")) ?? {};

    if (action === "ban") { bans.add(uid); delete timeouts[uid]; }
    else if (action === "unban") { bans.delete(uid); delete timeouts[uid]; }
    else if (action === "timeout") {
      const secs = Math.min(Math.max(Number(body?.seconds) || 300, 30), 86400);
      timeouts[uid] = Date.now() + secs * 1000;
    } else return;

    await this.state.storage.put("bans", Array.from(bans));
    await this.state.storage.put("timeouts", timeouts);
    this.broadcast(JSON.stringify({ type: "moderation", action, uid, name, until: timeouts[uid] ?? 0 }));
  }

  private broadcastRoster(): void {
    const participants = this.state
      .getWebSockets()
      .map((ws) => {
        try {
          return (ws.deserializeAttachment() as any)?.participant ?? null;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    this.broadcast(JSON.stringify({ type: "studio", action: "roster", participants }));
  }

  private broadcast(payload: string): void {
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(payload);
      } catch {
        // socket already gone; ignore
      }
    }
  }

  private broadcastCount(): void {
    const count = this.state.getWebSockets().length;
    this.broadcast(JSON.stringify({ type: "count", count }));
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Route: /room/<roomName>/ws  ->  the Durable Object for that room.
    const match = url.pathname.match(/^\/room\/([A-Za-z0-9_-]{1,64})\/ws$/);
    if (match) {
      const roomName = match[1];
      const id = env.CHAT_ROOM.idFromName(roomName);
      const stub = env.CHAT_ROOM.get(id);
      return stub.fetch(request);
    }

    // Routes: POST /room/<roomName>/moderate | /tip  (server-only, secret-gated).
    const secured = url.pathname.match(/^\/room\/([A-Za-z0-9_-]{1,64})\/(moderate|tip)$/);
    if (secured && request.method === "POST") {
      const auth = request.headers.get("Authorization") || "";
      if (!env.CHAT_ADMIN_SECRET || auth !== `Bearer ${env.CHAT_ADMIN_SECRET}`) {
        return new Response("unauthorized", { status: 401 });
      }
      const id = env.CHAT_ROOM.idFromName(secured[1]);
      return env.CHAT_ROOM.get(id).fetch(request);
    }

    return new Response("South Coast Cane chat worker is running.", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  },
};
