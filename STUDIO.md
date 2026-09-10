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

## Stage vs backstage (how 10 guests work)

The host's browser decodes and composites everyone **on stage**, so that number is
a hardware limit. Guests beyond it wait **backstage**: they are in the room and on
the roster, but the studio never pulls their media, so they cost the host no
decode, no bandwidth and no canvas time.

- `NEXT_PUBLIC_MAX_ON_STAGE` (default **6**) caps the shot.
- Guests auto-promote until the stage is full, then queue backstage.
- **Bring on** / **Backstage** move people in and out; subscriptions are added and
  torn down as they move, so leaving someone backstage genuinely costs nothing.
- Ten or more people in the room is fine. Ten *on screen* is not, and would look
  bad anyway.

Raise the cap only after testing on the machine that will actually run the show.
If a client needs many faces on screen at once, that is the point where
server-side compositing (LiveKit egress) becomes the right answer instead.

## Why there are two Cloudflare live inputs

A WHIP (WebRTC) input produces **no HLS and no recording**, and Cloudflare will
not forward it to Live Outputs. So:

```
studio --WHIP--> input A --WHEP--> relay --RTMP--> YouTube / Facebook
                                         --RTMPS-> input B --> site player + VOD
```

Input B is an ordinary RTMPS live input with `recording.mode: automatic`. The
relay always pushes a copy into it, even when there are no external
destinations, because the public player and the archive depend on it. Set
`CLOUDFLARE_STREAM_PLAYBACK_INPUT_UID` and
`NEXT_PUBLIC_CF_STREAM_PLAYBACK_INPUT_UID`. Without them the site player is
black during a studio broadcast and nothing is recorded.

## Going live, end to end

1. Studio mounts -> POSTs `/api/simulcast/warm` (wakes the relay).
2. **Go Live** -> `whipPublish()` sends the composited canvas to input A.
3. Immediately after, the studio POSTs `/api/simulcast/start`, which resolves the
   WHEP URL (retrying while Cloudflare catches up) and tells the relay to forward
   to input B plus every enabled destination.
4. While live the studio polls `/api/simulcast/status` every 5s and shows
   per-destination health, so a dead YouTube key is visible instead of silent.
5. **Stop broadcast** -> `/api/simulcast/stop`. Closing the tab stops it too.

If `vcodec` shows anything other than `h264`, the relay is re-encoding rather
than copying. Check that `whipPublish` codec preferences are being honoured
before blaming the relay's CPU.
