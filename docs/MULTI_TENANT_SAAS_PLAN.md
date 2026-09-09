# Multi‑Tenant SaaS — Scoping & Roadmap

How to turn the platform from "one studio per deploy" into a self‑serve SaaS where
**each company signs up and gets their own isolated studio**. This is the "real
business" (monetization model #3). Written 2026‑09‑09.

---

## 1. The opportunity

Today the product is a complete, working creator‑live platform (web + native app)
with team roles (owner / manager / host / moderator). It's sold **one instance per
company** (the white‑label template = one deploy each). The next level is a **SaaS**:
a company visits your site, signs up, and instantly has `theirname.yourplatform.com`
with their own branding, streams, chat, tips, and staff — while you host everyone on
one codebase and bill them monthly.

- **Model today:** done‑for‑you / license (one instance per client). Support‑heavy.
- **Model here:** one platform, many tenants, recurring revenue, low marginal cost.
- **Why it's valuable:** highest LTV, no per‑client setup burden, sellable as a company.

---

## 2. Where we are today (single‑tenant)

- **One Firebase project** (Auth + Firestore). Data lives at fixed paths: `site/branding`,
  `site/schedule`, `site/scene`, `site/sounds`, `site/bumper`, `site/settings`,
  `site/team`, and a top‑level `tips` collection.
- **One Cloudflare Stream account** with **one live input** (the studio publishes to it via WHIP).
- **One chat Worker** (Durable Objects); rooms are addressed by name (`live`, `rt-main`).
- **One Stripe account** (secret key in env) for tips; **one YouTube API key**.
- **Config is env‑vars per deploy** — every instance is a separate set of keys.
- **Admin allowlist / roles** are global to the instance (env owners + `site/team`).

**Implication:** everything assumes a single "site". Multi‑tenant means adding a
**tenant** dimension to data, auth, routing, media, and billing.

---

## 3. Target architecture (multi‑tenant)

### 3.1 Tenant model & data isolation
- Introduce a `tenants/{tenantId}` document (name, slug, plan, status, ownerUid,
  createdAt, connected‑accounts).
- Move all per‑site config under the tenant: `tenants/{tenantId}/config/...` and
  `tenants/{tenantId}/tips/...`, `tenants/{tenantId}/schedule`, etc.
- **Firestore Security Rules** enforce that a user can only read/write their tenant's
  data (membership check). This is the backbone of isolation — get it right.

### 3.2 Auth & roles, scoped per tenant
- Keep Firebase Auth, but a user's **role is per tenant**. Two options:
  - **Custom claims**: `{ tenants: { [tenantId]: role } }` set via Admin SDK on
    invite/role‑change. Fast checks, works in security rules.
  - **Membership docs**: `tenants/{tid}/members/{uid} = { role }`. Simpler to manage,
    a touch slower. (Recommended to start; can add claims later for rules.)
- A user can belong to **multiple tenants** (agencies, staff who freelance) → a
  tenant switcher in the UI.
- **Firebase / GCIP note:** Google's Identity Platform has *native* multi‑tenancy, but
  it complicates sign‑in; the claims/membership approach on one project is usually
  enough and simpler.

### 3.3 Routing (which tenant is this request?)
- **Subdomain per tenant:** `slug.yourplatform.com`. Wildcard DNS + a **Vercel
  wildcard domain**; Next.js **middleware** reads the hostname → resolves `tenantId`
  → puts it in the request context (header/cookie) for every page + API route.
- Optional **custom domains** per tenant (their own domain) via the Vercel Domains API
  — a premium feature.

### 3.4 Per‑tenant media (the genuinely hard part)
- **Cloudflare Stream:** one account can hold **many live inputs**. On tenant
  provisioning, call the Stream API to **create a live input for that tenant** and
  store its UID + customer code in the tenant doc. Each tenant streams to their own
  input; simulcast outputs are created under that input. VOD/uploads are **tagged with
  the tenantId** and the library query filters by tag.
- **Chat Worker:** already room‑addressed — namespace rooms as `{tenantId}:live` and
  `{tenantId}:rt-main`. Minimal change.
- **Realtime (Calls):** sessions are ephemeral; the signaling room becomes per‑tenant.
  Minimal change.
- **Costs:** all tenants' usage aggregates on **your** Cloudflare account → you meter
  per tenant (by live input / tag) and bill it back (or bundle into the plan).

### 3.5 Billing (two separate money flows — don't conflate them)
- **Tenants pay YOU (subscriptions):** Stripe **Billing** on your platform account.
  Plans (e.g. Starter/Pro), usage add‑ons for delivery minutes, a customer portal,
  and webhooks that set `tenant.status` (active / past_due / canceled) — which gates
  access.
- **Viewers pay TENANTS (tips):** switch tips from one shared secret key to **Stripe
  Connect** — each tenant connects their own Stripe account; tip funds go **to them**,
  and you can take an optional **platform fee**. This replaces the current
  `STRIPE_SECRET_KEY` model.

### 3.6 Per‑tenant integrations
- **YouTube:** move from one API key to **per‑tenant OAuth** (each tenant connects
  their channel; store refresh tokens in the tenant doc). Bigger change; can ship a
  v1 where YouTube is optional/simulcast‑only.
- **Branding, schedule, scene, sounds, team, tips** → all already exist; they just
  move under the tenant.

### 3.7 Provisioning & onboarding (self‑serve)
- Sign‑up flow: create the Firebase user → create the `tenant` doc → **call Cloudflare
  to create the live input** → seed default config → assign the owner role → redirect
  to `slug.yourplatform.com/admin`. Automate this so it's zero‑touch.
- A **super‑admin** area for you (list tenants, suspend, impersonate for support).

---

## 4. Two paths (recommended: bridge first)

### Path A — "Managed multi‑instance" (bridge, near‑term)
Keep the current single‑tenant code. Build a **provisioning script/CLI** that stands
up a new client fast: create their Firebase project (or config), create a Cloudflare
live input, set env/config, deploy. You still host each, but onboarding drops from
days to ~an hour. **Validates demand, earns revenue now, ~1–2 weeks of work.** This is
monetization model #2 productized.

### Path B — True multi‑tenant SaaS (the real product)
The Section 3 refactor. Higher effort, but it's the scalable business. Do it **after**
Path A proves paying demand.

---

## 5. Phased plan (Path B) with rough effort

Estimates assume one senior full‑stack dev; parallelizable in places.

| Phase | Scope | Effort |
|---|---|---|
| **0. Bridge** | Path A provisioning automation (optional but recommended) | 1–2 wks |
| **1. Tenant core** | Tenant model + membership/roles + Firestore rules + hostname→tenant middleware + move config under tenant + tenant switcher | 3–5 wks |
| **2. Media per tenant** | Provision Cloudflare live input per tenant; namespace chat + realtime rooms; tag VOD by tenant; per‑tenant cost metering | 2–3 wks |
| **3. Money** | Stripe Billing (subscriptions + portal + status gating) and Stripe Connect for tips; per‑tenant YouTube OAuth | 3–4 wks |
| **4. Self‑serve + ops** | Sign‑up/onboarding, super‑admin console, custom domains, polish, docs | 2–3 wks |

**Total: ~3–4 months to a real SaaS MVP.** (Path A alone: ~1–2 weeks.)

---

## 6. Pricing & cost implications
- Your only real variable cost is **Cloudflare Stream delivery** (~$1 / 1,000 min) +
  storage (~$5 / 1,000 min). At ~$0.001 / viewer‑minute, margins on a $29–$99/mo plan
  are very healthy until a tenant gets big — then usage‑based add‑ons cover it.
- Suggested tiers: **Starter $29/mo** (limited delivery minutes, 1–2 staff),
  **Pro $99/mo** (more minutes, guests, custom domain, more staff), **usage overage**
  beyond included minutes. Optional **platform fee on tips** (e.g. 1–2%).
- Break‑even is low; the model is high‑margin once onboarding is self‑serve.

---

## 7. Key risks & decisions
- **Security rules are critical** — a bug leaks one tenant's data to another. Budget
  real time for rules + tests before launch.
- **Cloudflare live‑input limits/quotas** — confirm you can create enough live inputs
  on one account for your target tenant count; talk to Cloudflare for scale.
- **Stripe Connect onboarding** adds friction for tenants (KYC) — but it's the correct
  way to route tip money to them and keep you out of the flow.
- **Support & abuse** — self‑serve invites abuse (content/DMCA on YouTube simulcast,
  payment fraud). Need moderation + suspend tooling (the super‑admin console).
- **Migration** — the current single‑tenant client (South Coast) becomes "tenant #1";
  plan a clean data migration into the tenant model.

---

## 8. Recommendation
1. **Ship Path A** (managed multi‑instance automation) now — earn while validating.
2. If 3–5 companies pay, commit to **Path B** starting with Phase 1 (tenant core) and
   Phase 3's **Stripe Connect for tips** (the highest‑value money change).
3. Treat security rules + billing status‑gating as first‑class, not afterthoughts.

The platform is already feature‑complete per tenant — the SaaS work is almost entirely
**isolation, routing, provisioning, and billing**, not new creator features. That's a
well‑understood body of work with a clear payoff.
