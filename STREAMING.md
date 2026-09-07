# Going Live - Creator Playbook

How to run a broadcast on Cane with a Camera. This replaces StreamYard with free
tools you own. One-time setup, then a repeatable routine.

## One-time setup

### 1. Install the studio
- **OBS Studio** (free): https://obsproject.com - this is your studio (scenes, overlays, screen share).
- **VDO.Ninja** (free, no account): https://vdo.ninja - brings remote guests into OBS.

### 2. Point OBS at the platform (Cloudflare Stream)
In OBS: **Settings -> Stream -> Service: Custom**, then paste the Server + Stream Key
from **Studio -> Go Live** in the admin dashboard. (Set once; OBS remembers it.)

### 3. Add the on-air graphics overlay
In OBS: **Sources -> + -> Browser**, URL = `https://<your-site>/overlay`, size **1920 x 1080**.
Put this source on top. It's invisible until you push a banner or comment from the admin.

### 4. Add the chat (optional, on-screen)
Add another **Browser** source pointing at your live page or a chat widget if you want the
chat visible on the video. (The overlay above already handles pinned comments and banners.)

## Every broadcast (the routine)

1. **Open OBS.** Pick your scene (camera, screen share, guest layout).
2. **Guests?** Send them your VDO.Ninja invite link; add each as a Browser source in OBS.
3. **Start Streaming** in OBS. You're now live on:
   - your own site's Live page, and
   - YouTube (via Cloudflare Stream's simulcast output) at the same time.
4. **Put messages on screen:** open **Studio -> On Air** in the admin:
   - Type a **lower-third banner** (title + subtitle) -> *Show on stream*.
   - **Pin a viewer comment**: click *Pin* next to any live chat message -> it appears on the broadcast.
   - *Clear stream* removes everything.
5. **End:** Stop Streaming in OBS. The recording is saved to Cloudflare Stream and joins the archive.

## What this replaces from StreamYard
- Multistreaming to YouTube -> Cloudflare Stream simulcast
- Overlays / lower-thirds / on-screen comments -> OBS + the On Air control above
- Remote guests -> VDO.Ninja into OBS
- Recording -> Cloudflare Stream auto-records
- The studio itself -> OBS (free, more powerful; a small learning curve vs a browser)

The trade: OBS is a desktop app instead of a browser tab, but you own everything and pay no
per-seat subscription.
