// South Coast Cane - live chat Worker (Cloudflare Durable Objects)
//
// One Durable Object instance per chat room holds every viewer's WebSocket,
// keeps the last ~100 messages, and broadcasts a live viewer count. Uses the
// WebSocket Hibernation API so idle rooms cost almost nothing.

export interface Env {
  CHAT_ROOM: DurableObjectNamespace;
}

type ChatMessage = {
  type: "chat";
  id: string;
  name: string;
  text: string;
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
    if (data?.type !== "chat") return;

    const text = String(data.text ?? "").slice(0, MAX_TEXT).trim();
    const name = (String(data.name ?? "Guest").slice(0, MAX_NAME).trim() || "Guest").replace(/[\r\n]/g, " ");
    if (!text) return;

    const msg: ChatMessage = {
      type: "chat",
      id: crypto.randomUUID(),
      name,
      text,
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
  }

  async webSocketError(): Promise<void> {
    this.broadcastCount();
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

    return new Response("South Coast Cane chat worker is running.", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  },
};
