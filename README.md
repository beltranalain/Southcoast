# South Coast Cane - Website & Live Platform

Creator website and live-streaming platform for **South Coast Cane** (the "Cane with a
Camera 2.0" family of films). Built to replace a paid streaming subscription with an
owned platform that broadcasts on its own site **and** simulcasts to YouTube.

## Stack

| Layer | Tool | Why |
|---|---|---|
| Hosting | **Vercel** (Next.js) | Fast, cheap, scales automatically |
| Live video + VOD | **Cloudflare Stream** | Ingest from OBS, simulcast to YouTube, store recordings |
| Auth (admin) | **Firebase Authentication** | Secure the Studio dashboard |
| Content + settings | **Firebase Firestore** | What the admin edits; live-status doc |
| Image uploads | **Firebase Storage** | Logo, favicon, thumbnails |
| Live chat | **Firebase Realtime Database** | Low-latency chat + viewer count |
| Go-live alerts | **Firebase Cloud Messaging** | Notify fans when a broadcast starts |
| Video data | **YouTube Data API v3** | Pull real uploads + live status |
| Studio + guests | **OBS Studio + VDO.Ninja** | Free desktop studio and remote guests |

The app **runs with zero configuration** in demo mode (sample data + real YouTube embeds).
Add environment variables to switch on real auth, saving, live status, and API pulls.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

Public site is at `/`. The Studio dashboard is at `/admin`
(demo mode opens it directly; with Firebase set, it requires sign-in at `/admin/login`).

## Configuration

Copy the example env file and fill in values as each service is set up:

```bash
cp .env.local.example .env.local
```

Nothing is required to run locally. Fill in groups as you go:

- **Firebase (client + admin)** - real admin sign-in, content saving, chat.
- **YouTube Data API** - pulls real uploads/live status via `/api/youtube`.
- **Cloudflare Stream** - live ingest + the own-platform player; webhook at
  `/api/stream/webhook` flips live status and saves recordings.
- **Resend (optional)** - delivers contact-form email; otherwise submissions are logged.

## Project layout

```
app/
  (site)/            Public pages: home, live, shows, library, about, contact
  admin/             Studio dashboard: overview, go-live, videos, schedule,
                     content, branding, analytics, settings, login
  api/               youtube (proxy), contact, stream/webhook
components/          SiteHeader, SiteFooter, LibraryClient, ContactForm, AdminShell
lib/                 channels, siteData, firebase, firebaseAdmin, youtube, stream
mockup/             Original static HTML mock (design reference)
```

## How content saving works

The admin **Content** and **Branding** pages read and write two Firestore docs:
`site/content` and `site/branding`. The public site reads them server-side via
`lib/siteConfig.ts` (falling back to defaults in `lib/siteData.ts`), so edits appear on
the live site - including the accent color, which recolors the whole theme.

Writes go through `POST /api/site-config`, which verifies the admin's Firebase ID token
before saving. Recommended Firestore rules (only signed-in admins write, everyone can read
public config; server Admin SDK bypasses rules for reads):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /site/{doc} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

Until Firebase is connected, saving shows "Preview only" and nothing is lost.

## Live chat (Cloudflare Durable Objects)

Real-time chat runs on a separate Cloudflare Worker in `worker/` (Durable Objects, one
room per broadcast, last 100 messages kept, live viewer count). It deploys to Cloudflare,
not Vercel. See `worker/README.md` for deploy steps. After deploying, set:

```
NEXT_PUBLIC_CHAT_WS_URL=wss://south-coast-cane-chat.<your-subdomain>.workers.dev
```

Until that is set, the live page shows a demo chat panel with the input disabled - no
errors. SQLite-backed Durable Objects run on Cloudflare's free Workers plan.

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import it in Vercel (framework auto-detected as Next.js).
3. Add the environment variables from `.env.local.example` in Vercel project settings.
4. Point the domain (`southcoastcane.com`) at Vercel.

## Going live (creator workflow)

1. In OBS, set the stream server + key from **Studio → Go Live** (Cloudflare Stream input).
2. Add remote guests through **VDO.Ninja** into OBS if needed.
3. Enable simulcast destinations (own platform + YouTube) and start the broadcast.
4. The stream plays on `/live` and on YouTube at once; the recording is saved to the library.
