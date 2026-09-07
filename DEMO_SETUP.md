# Demo instance setup (for testers / prospects)

Goal: a **separate, isolated deployment** your testers can use hands-on — its own
users, chat, and broadcasts — without touching the real client's data. Same code
(this repo), different accounts/keys. Budget ~30–45 min.

Legend: **NEW** = create fresh for the demo · **REUSE** = same value as your
current `.env.local`.

---

## 1. New Firebase project (isolates users + data) — NEW

1. https://console.firebase.google.com → **Add project** → name it `cwac-demo`
   (Spark / free plan is fine). Disable Analytics if you want.
2. **Build → Authentication → Get started** → enable **Email/Password** and
   **Google** (set a support email, like you did before).
3. **Build → Firestore Database → Create database** (Production mode).
4. **Project settings (gear) → General → Your apps → Web app (`</>`)** → register
   an app → copy the config. These become:
   - `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`,
     `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`,
     `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`,
     `NEXT_PUBLIC_FIREBASE_DATABASE_URL`
5. **Project settings → Service accounts → Generate new private key** → the JSON
   gives:
   - `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`,
     `FIREBASE_ADMIN_PRIVATE_KEY` (paste WITHOUT surrounding quotes; keep the `\n`).

## 2. Cloudflare — REUSE account, NEW live input

- Reuse: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN`,
  `NEXT_PUBLIC_CF_STREAM_CUSTOMER_CODE`, `CLOUDFLARE_REALTIME_APP_ID`,
  `CLOUDFLARE_REALTIME_APP_TOKEN`.
- **Stream → Live Inputs → Create Live Input** ("Demo") → copy its UID →
  `CLOUDFLARE_STREAM_LIVE_INPUT_UID` **and** `NEXT_PUBLIC_CF_STREAM_LIVE_INPUT_UID`.
  (A separate input means a demo broadcast never collides with a real one.)

## 3. Demo chat/guest Worker — NEW (already configured)

```
cd worker
npx wrangler deploy -c wrangler.demo.toml
# pick a fresh secret and set it:
"REPLACE_WITH_A_RANDOM_SECRET" | npx wrangler secret put CHAT_ADMIN_SECRET -c wrangler.demo.toml
```
- Gives a URL like `https://cwac-demo-chat.<your-subdomain>.workers.dev`.
- `NEXT_PUBLIC_CHAT_WS_URL` = that URL with `https` → `wss`.
- `CHAT_ADMIN_SECRET` = the same random secret you just set.

## 4. New Vercel project (the demo site) — NEW

1. Vercel → **Add New → Project** → import the **same GitHub repo**
   (`beltranalain/Southcoast`).
2. Name it `cwac-demo` → gives `cwac-demo.vercel.app`.
3. **Environment Variables** — add everything below (Production + Preview), then
   **Deploy**:

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_FIREBASE_*` (7) | NEW — step 1 |
| `FIREBASE_ADMIN_*` (3) | NEW — step 1 (private key: no quotes) |
| `NEXT_PUBLIC_ADMIN_EMAILS` | NEW — the demo admin email (see step 5) |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN`, `NEXT_PUBLIC_CF_STREAM_CUSTOMER_CODE` | REUSE |
| `CLOUDFLARE_STREAM_LIVE_INPUT_UID`, `NEXT_PUBLIC_CF_STREAM_LIVE_INPUT_UID` | NEW — step 2 |
| `CLOUDFLARE_REALTIME_APP_ID`, `CLOUDFLARE_REALTIME_APP_TOKEN` | REUSE |
| `NEXT_PUBLIC_CHAT_WS_URL`, `CHAT_ADMIN_SECRET` | NEW — step 3 |
| `YOUTUBE_API_KEY` | REUSE (or a demo channel's) |
| `RESEND_API_KEY`, `CONTACT_TO_EMAIL` | REUSE or skip (contact form) |
| Stripe (`STRIPE_*`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) | Optional — use Stripe **test mode** keys so testers can try tipping with card `4242…` |

4. After the first deploy, add the demo domain to Firebase:
   **Firebase → Authentication → Settings → Authorized domains → Add** `cwac-demo.vercel.app`.

## 5. Demo admin + neutral branding — NEW

1. Set `NEXT_PUBLIC_ADMIN_EMAILS` = the email you'll give testers (e.g.
   `demo@donkeyideas.com`), then in the **demo** Firebase → Authentication → Users
   → **Add user** with that email + a password. That's the studio login.
2. Sign into `cwac-demo.vercel.app/admin` → **Branding** → set a neutral name
   ("Demo Studio"), a generic logo, and default colors.
3. Optional: add a few **Shows/Schedule** entries so it looks populated.

## 6. Share with testers

Send them: the **URL**, the **demo admin login**, and a 2–3 min Loom. They can:
- Browse the public site + sign up to chat (their own accounts, isolated).
- Log into the studio → go live from the browser, screen share, invite a guest,
  fire on-air graphics, moderate chat, and (if Stripe test keys set) test tipping.

If IP matters, have them sign a light NDA first.

---

### Notes
- The app is fully env-driven and single-tenant per deployment, so the demo is a
  clean copy — no code changes needed.
- To refresh the demo, delete its Firestore docs / Auth users, or just leave it.
- This same pattern (separate Firebase + Vercel + worker per customer) is the
  manual version of what a **multi-tenant SaaS** would automate later.
