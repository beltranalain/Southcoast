# South Coast Cane - Chat Worker

Live chat backend using **Cloudflare Durable Objects**. Separate from the Next.js
app (which deploys to Vercel); this deploys to Cloudflare.

## Deploy

```bash
cd worker
npm install
npx wrangler login        # opens the browser to authorize your Cloudflare account
npm run deploy
```

Wrangler prints a URL like `https://south-coast-cane-chat.<your-subdomain>.workers.dev`.

Then, in the Next.js app, set the WebSocket URL (use `wss://`, not `https://`):

```
NEXT_PUBLIC_CHAT_WS_URL=wss://south-coast-cane-chat.<your-subdomain>.workers.dev
```

Add it to `.env.local` for local dev and to the Vercel project's environment variables
for production. The live page connects to `<that URL>/room/live/ws`.

## Local development

```bash
npm run dev   # runs the Worker locally, usually on http://localhost:8787
```

For local testing, point the app at `NEXT_PUBLIC_CHAT_WS_URL=ws://localhost:8787`.

## How it works

- `ChatRoom` is a Durable Object: one instance per room name (we use `live`).
- It holds every viewer's WebSocket via the Hibernation API (cheap when idle),
  keeps the last 100 messages in SQLite storage, and broadcasts a viewer count.
- SQLite-backed Durable Objects run on the **free** Workers plan.
