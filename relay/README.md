# Simulcast relay

This is the small background service that lets the **browser studio** stream to
**YouTube (and Facebook/Twitch)** without OBS or StreamYard.

## Why it exists

The studio publishes to Cloudflare over WebRTC (WHIP). Cloudflare does **not**
forward a WebRTC input to its own "Live Outputs," so it cannot simulcast to
YouTube by itself. This service fills that gap:

```
Browser studio ──WHIP──► Cloudflare ──HLS──► THIS RELAY ──RTMP──► YouTube / Facebook / Twitch
```

It runs `ffmpeg -c copy` (a straight passthrough, no re-encoding), so it needs
almost no CPU and runs on the cheapest instance any host offers.

## What the app expects

Set these two environment variables in **Vercel** (the Next.js app):

| Variable       | Value                                             |
| -------------- | ------------------------------------------------- |
| `RELAY_URL`    | Public URL of this service, e.g. `https://cane-simulcast-relay.fly.dev` |
| `RELAY_SECRET` | Any long random string. Must match the relay's `RELAY_SECRET`. |

Set the same `RELAY_SECRET` on this service (below). That's the whole contract:
`POST /start`, `POST /stop`, `GET /status`, all with `Authorization: Bearer <RELAY_SECRET>`.

## Deploy (pick one — all one-time)

### Fly.io (recommended: scales to zero, ~free when idle)

```bash
cd relay
fly launch --copy-config --now          # creates the app from fly.toml
fly secrets set RELAY_SECRET=<long-random-string>
```

Grab the URL Fly prints (e.g. `https://cane-simulcast-relay.fly.dev`) and set
`RELAY_URL` + the same `RELAY_SECRET` in Vercel.

### Railway

1. New Project → Deploy from repo → point at this `relay/` folder (it has a Dockerfile).
2. Add a variable `RELAY_SECRET=<long-random-string>`.
3. Copy the public domain Railway gives you into Vercel as `RELAY_URL`.

### Any VPS with Docker

```bash
cd relay
docker build -t simulcast-relay .
docker run -d --restart=always -p 8080:8080 -e RELAY_SECRET=<long-random-string> simulcast-relay
```

Point `RELAY_URL` at `http://<server-ip>:8080` (put it behind HTTPS for production).

## Local test

```bash
cd relay
RELAY_SECRET=dev node server.js
# health check
curl localhost:8080/health
```

## Notes

- One broadcast at a time. `POST /start` replaces any previous session.
- Each destination gets its own ffmpeg process; a bad YouTube key won't affect
  Facebook/Twitch. The service auto-retries a destination if ffmpeg drops
  (e.g. HLS not ready the instant you go live).
- Stream keys are redacted in `/status` and logs.
