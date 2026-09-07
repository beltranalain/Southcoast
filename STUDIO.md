# Browser Studio - Setup & Notes

The **Studio** (Admin → Studio) is the in-browser replacement for OBS *and*
StreamYard: invite guests by link, they join in the browser, the host composites
everyone into one shot, and goes live to your site + YouTube. No software.

## How it works
- **Guests** open an invite link (`/join/main`) and pick **video / audio / both / neither**,
  then join. Their camera/mic publish to **Cloudflare Realtime** (the SFU).
- **Signaling** (who's in the room + their track names) runs on the same Cloudflare
  **Durable Objects** Worker as the chat (room `rt-main`).
- The **host** (Admin → Studio) subscribes to every guest, **composites** host + guests
  onto a canvas (Grid or Spotlight layout), mixes the audio, and pushes that single
  program feed to **Cloudflare Stream via WHIP** → simulcast to YouTube.

Everything is on Cloudflare + your own code. No per-seat SaaS.

## What must be connected for it to broadcast
1. **Cloudflare Realtime app** - dashboard → **Realtime** (Serverless SFU) → create an app.
   Set `CLOUDFLARE_REALTIME_APP_ID` and `CLOUDFLARE_REALTIME_APP_TOKEN`.
2. **Cloudflare Stream Live Input** (for the WHIP program output + YouTube simulcast) -
   set the `CLOUDFLARE_*` Stream vars (see SETUP.md).
3. **Worker URL** already set as `NEXT_PUBLIC_CHAT_WS_URL`.

Until Realtime + Stream are connected, the Studio still opens, shows the host camera,
and composites - but "Go Live" is disabled and guests won't have media transport.

## Status / testing
The signaling (roster) is tested and live. The WebRTC media path (Cloudflare Realtime
publish/subscribe + WHIP output + canvas compositing) is built to spec but needs one
**live test pass** with the real Realtime + Stream accounts and 2+ real browsers/cameras
to validate and tune (guest limits, layout sizing, audio levels). This is expected for
any multi-party WebRTC studio.

## Limits (browser-composited approach)
- Realistically ~4-6 guests (the host's computer does the mixing).
- Quality depends on the host's machine + connection.
- For bigger productions later, the alternative is server-side compositing (self-hosted
  LiveKit egress) - more power, more infrastructure.
