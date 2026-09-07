# South Coast Cane - Setup & Handoff Guide

This walks you (the developer) through standing up the whole platform **under your own
accounts first**, testing each piece, then onboarding the client. Every feature is driven
by environment variables, so the app runs at each stage and lights up one feature at a time.

Handoff later = swap the env vars to the client's accounts and redeploy. The code never changes.

---

## How the keys map

All secrets live in **environment variables**, never in the app UI:

- **Local testing:** put them in a file named `.env.local` (copy from `.env.local.example`).
- **Production:** paste them into **Vercel -> Project -> Settings -> Environment Variables**.

The client never sees these. Their only login is an admin user you create in Firebase.

---

## Phase 0 - Run it locally (no accounts needed)

```powershell
npm install
npm run dev
```

Open http://localhost:3000. Everything works in "demo mode": real YouTube embeds,
sample data, admin at /admin opens directly with a demo banner. Good baseline.

---

## Phase 1 - Deploy to Vercel (still demo mode, gets a real URL)

1. Push this repo to GitHub (see Phase 8 for git steps if needed).
2. Go to vercel.com -> New Project -> import the repo. Framework auto-detects as Next.js.
3. Deploy. You get a URL like `south-coast-cane.vercel.app`.

It still runs in demo mode until you add keys below. Add env vars in
**Settings -> Environment Variables**, then **redeploy** for them to take effect.

Note: `worker/` (the chat Worker) does NOT deploy to Vercel - it deploys to Cloudflare
separately (Phase 5).

---

## Phase 2 - Firebase (admin login + content saving)  [biggest unlock]

Create the project:

1. console.firebase.google.com -> **Add project** -> name it -> finish.
2. Add a **Web app** (the `</>` icon). Copy the `firebaseConfig` values into these env vars:

   | firebaseConfig | Env var |
   |---|---|
   | apiKey | NEXT_PUBLIC_FIREBASE_API_KEY |
   | authDomain | NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN |
   | projectId | NEXT_PUBLIC_FIREBASE_PROJECT_ID |
   | storageBucket | NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET |
   | messagingSenderId | NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID |
   | appId | NEXT_PUBLIC_FIREBASE_APP_ID |

3. **Authentication** -> Get started -> Sign-in method -> enable **Email/Password**.
4. **Firestore Database** -> Create database -> Production mode -> pick a region.
5. Firestore -> **Rules** -> paste and publish:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /site/{doc} {
         allow read: if true;
         allow write: if request.auth != null;
       }
     }
   }
   ```

6. **Service account** (lets the server verify logins + save): Project Settings ->
   Service accounts -> **Generate new private key** -> downloads a JSON file. Map:

   | JSON field | Env var |
   |---|---|
   | project_id | FIREBASE_ADMIN_PROJECT_ID |
   | client_email | FIREBASE_ADMIN_CLIENT_EMAIL |
   | private_key | FIREBASE_ADMIN_PRIVATE_KEY |

   For `FIREBASE_ADMIN_PRIVATE_KEY`, keep the whole value including `\n` sequences and wrap
   it in double quotes in `.env.local`. In Vercel, paste it as-is (the app converts `\n`).

7. **Create your admin login:** Authentication -> Users -> **Add user** -> your email +
   a password. That is the /admin sign-in.

**Test it:** restart `npm run dev`. Go to /admin -> you're redirected to /admin/login ->
sign in -> edit something in **Content** or **Branding** -> Save -> it should say "Saved."
Refresh the public site and see the change (branding color recolors the whole theme).

---

## Phase 3 - YouTube Data API (real videos + live status)

Firebase projects are also Google Cloud projects, so use the same project:

1. console.cloud.google.com -> pick your project -> **APIs & Services -> Library** ->
   search **YouTube Data API v3** -> Enable.
2. **APIs & Services -> Credentials -> Create credentials -> API key** -> copy it.
3. Set `YOUTUBE_API_KEY`. (Optional: restrict the key to the YouTube Data API.)

**Test it:** visit `/api/youtube?channel=cane-show` on your running site - it should return
real video items instead of `configured: false`.

---

## Phase 4 - Cloudflare Stream (live video + simulcast to YouTube)

1. dash.cloudflare.com -> **Stream**. Stream is usage-based, so add a payment method.
2. Create a **Live Input**. Copy:
   - The **RTMPS URL** + **Stream Key** -> these go into OBS (Studio -> Go Live shows where).
   - The live input **UID**.
3. Account + token:
   - `CLOUDFLARE_ACCOUNT_ID` - shown in the dashboard URL / Stream page.
   - My Profile -> API Tokens -> Create Token (permission **Stream: Edit**) ->
     `CLOUDFLARE_STREAM_API_TOKEN`.
   - `NEXT_PUBLIC_CF_STREAM_CUSTOMER_CODE` - the `customer-XXXX` part of a Stream embed URL.
4. **Simulcast to YouTube:** in the Live Input -> **Outputs** -> add YouTube's RTMP URL +
   stream key (from YouTube Studio -> Go Live -> Stream key). Now one OBS stream fans out to
   your site + YouTube.

**Test it:** stream to the Live Input from OBS. It appears on YouTube (via the output) and
is available to Cloudflare's player.

> Note: the site's `/live` page currently shows the **YouTube live embed** (works today).
> Swapping it to the native **Cloudflare Stream player** is a small code change - ask me to
> wire it when your Stream account is ready.

---

## Phase 5 - Cloudflare chat Worker (live chat)

```powershell
cd worker
npm install
npx wrangler login        # or use an API token (see main README)
npm run deploy
```

Copy the printed URL and set (use `wss://`):

```
NEXT_PUBLIC_CHAT_WS_URL=wss://south-coast-cane-chat.<your-subdomain>.workers.dev
```

**Test it:** open `/live` in two browser windows and chat between them; the "X here"
count updates. SQLite-backed Durable Objects run on Cloudflare's free plan.

---

## Phase 6 - Contact email (optional, Resend)

1. resend.com -> sign up -> API Keys -> create -> `RESEND_API_KEY`.
2. Set `CONTACT_TO_EMAIL` to where messages should go.
3. For testing you can send from `onboarding@resend.dev`; to send from your own domain,
   verify the domain in Resend.

**Test it:** submit the Contact form -> the message arrives by email. Without a key, the
form still works and logs submissions server-side.

---

## Phase 7 - Create the client's login

When you're happy with everything:

- Firebase -> Authentication -> Users -> **Add user** -> the client's email + a temporary
  password. Send it to them. They sign in at `/admin` and can change the password.
- Only users you create here can access the dashboard - there is no public signup.

---

## Phase 8 - Handoff to the client

Because everything is env-var driven, you have two clean options:

**Option A - keep your accounts, add the client as a member** (fast):
- Cloudflare: Manage Account -> Members -> invite the client.
- Vercel: create/move the project into a team the client is on.
- Firebase: Project Settings -> Users and permissions -> add the client as Owner.

**Option B - move to the client's own accounts** (best for full ownership):
1. Client creates their own Firebase, Cloudflare, and Vercel accounts (or you do, with their
   email).
2. Recreate the pieces there: new Firebase project (repeat Phase 2), new Stream live input
   (Phase 4), redeploy the chat Worker to their Cloudflare (Phase 5).
3. In Vercel, replace the env vars with the client's keys and **redeploy**. The app code is
   unchanged.
4. Point the domain (`southcoastcane.com`) at the client's Vercel project.
5. Content is small - re-enter it in the admin, or export/import the Firestore `site`
   collection.

---

## Quick env var checklist

Copy `.env.local.example` to `.env.local` and fill in as you complete each phase:

- Phase 2: `NEXT_PUBLIC_FIREBASE_*`, `FIREBASE_ADMIN_*`
- Phase 3: `YOUTUBE_API_KEY`
- Phase 4: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN`, `NEXT_PUBLIC_CF_STREAM_CUSTOMER_CODE`
- Phase 5: `NEXT_PUBLIC_CHAT_WS_URL`
- Phase 6: `RESEND_API_KEY`, `CONTACT_TO_EMAIL`

Studio -> **Settings -> Integrations** shows which of these are connected (green) at a glance.
