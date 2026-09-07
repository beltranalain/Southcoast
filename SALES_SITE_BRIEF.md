# Sales Site Brief — "Showrunner" (working name)

The positioning + build brief for a **standalone marketing site** that sells this
live-broadcasting platform to other creators. This is a sales/landing site, NOT
the platform itself. Hand this whole file to Claude (or a designer) to build the
mock site from.

> Decisions to confirm before building (my recommendations are baked in below):
> 1. **Product name** — I'm using **"Showrunner"** as a placeholder. It captures the
>    multi-show angle and isn't tied to your client's "South Coast Cane / Cane with a
>    Camera" brand. Alternates: **Slate**, **Channelcast**, **OwnAir**. Swap freely.
> 2. **Hero offer** — leading with **Done-For-You setup** (service), license second.
>    This matches the competitive reality (you can't out-SaaS a $150M-funded Uscreen;
>    you win on a niche service at a price nobody serves).

---

## 1. Positioning

**One-liner:**
> Your own multi-show broadcast network — live on your site and simulcast to YouTube,
> with your shows routed to the right channels automatically. You own the code and the
> audience.

**The wedge (why anyone picks you over Uscreen/BoxCast/Owncast):**
- **Multi-show routing** is the differentiator. A network of shows with per-show
  destination rules — the football show never lands on the everyday-life channel.
  Nobody packages this: Owncast is single-user; Uscreen is a video library with live
  bolted on; the church tools don't think in "shows and channels."
- **Own your code + audience.** Not renting a platform. Not building on rented land.
- **The price gap.** Agencies charge $50k–200k. SaaS is $50–500/mo forever. You sit in
  the empty middle: a few thousand up front, you own it, low monthly.

**The enemy / narrative:** "You're building on rented land." Social platforms and OTT
SaaS both own your audience and your economics. Showrunner gives you the broadcast
network without the landlord.

---

## 2. Who it's for (ICP — pick ONE, don't say "creators")

**Primary:** Independent **multi-show creators and small niche networks** — commentary,
sports/fan channels, faith orgs unhappy with BoxCast/Subsplash pricing — who **already
simulcast to YouTube** and are tired of renting their platform.

Why this ICP: it's literally who the product was built for (South Coast Cane runs
multiple shows/channels and simulcasts). The differentiator (multi-show routing +
keep-your-code + merged chat) speaks directly to them. Churches as a whole are locked up
by BoxCast/Subsplash/Resi — target the ones actively shopping on price, not the market.

**Not for (say this to yourself, not on the site):** first-time streamers, people who
want a one-click hosted product with zero setup, anyone who needs an app-store app on
day one.

---

## 3. What you're selling (offers + pricing)

### Offer 1 — Done-For-You Setup  (HERO OFFER)
Productized service. Same stack every time, fixed scope.
- **Price:** $3,000–$8,000 one-time setup + **$150–$300/mo** hosting + support retainer.
- **Includes:** their own Firebase + Cloudflare Stream + Realtime + YouTube keys wired
  up, branding applied, shows/channels configured, deployed to their domain, a go-live
  walkthrough. They keep the code.
- **Positioning line:** "We stand up your entire broadcast network in ~2 weeks. You own
  everything when we're done."

### Offer 2 — Boilerplate License  (SECONDARY / passive + lead-gen)
- **Price:** $149–$499 one-time, self-deploy.
- **Includes:** the codebase + setup docs. Sold via Gumroad or Lemon Squeezy (they
  handle tax/licensing).
- **Positioning line:** "Technical? Deploy it yourself for the price of one month of
  the alternatives."

### (Later, not on the mock site yet) Managed SaaS
Mention only as "hosted plans coming soon / join the waitlist" if you want to gauge
demand. Do NOT build the site around it — it needs a single-tenant → multi-tenant
refactor + Stripe billing first.

**Comparison framing to use on the Pricing page** (numbers are public competitor pricing
as of early 2025 — verify before publishing):
| | Showrunner (DFY) | Uscreen | BoxCast (church) | Agency build |
|---|---|---|---|---|
| Up front | $3k–8k | $0 | $0 | $50k–200k |
| Monthly | $150–300 | $149–449 + per-subscriber | $109–249 | — |
| Own the code | Yes | No | No | Sometimes |
| Multi-show routing | Yes | No | No | Custom |

---

## 4. Feature list to showcase (all already built)

Lead with the first two; the rest are the "and it also does everything else" proof.
- **Multi-show / multi-channel routing** — per-show destination rules (HERO FEATURE)
- **Browser studio, no OBS** — go live from a browser; camera + guests + graphics
- **Simulcast** — your site + YouTube (and other RTMP) at the same time
- **Guest green room** — guests join by link over WebRTC; host admits them
- **On-air graphics** — lower-thirds, pinned comments, branded scene (frame/logo/ticker),
  AI virtual background + green screen
- **Merged cross-platform live chat** with real accounts (the OTT players won't do this —
  they want you off YouTube)
- **Screen share, local recording, VOD library**
- **Schedule + go-live alerts, admin dashboard, tips**

---

## 5. Proof / trust

- **Live demo** — the parked isolated demo instance (see DEMO_SETUP.md) or a 60–90s
  Loom walkthrough of a real go-live. A working demo is the single highest-leverage
  asset on the site.
- **Flagship case study** — South Coast Cane: "Built and running this for a working
  multi-show creator who left StreamYard to own his platform." One real quote.
- **Built-on logos** — Cloudflare, Vercel, Firebase (credibility that it's real infra).

---

## 6. Pages / structure

1. **Home / landing** — hero (one-liner + primary CTA), the "rented land" narrative,
   the 3 differentiators, feature highlights, demo embed, comparison teaser, final CTA.
2. **How it works** — 3 steps: (1) we wire up your stack, (2) you brand your shows &
   channels, (3) go live everywhere at once. ~2 weeks.
3. **Features** — the list above, multi-show routing first, with screenshots.
4. **Pricing** — the two offers + comparison table.
5. **Demo** — embedded Loom or link to the live demo instance.
6. **FAQ** — "Do I own it?", "What does hosting cost me?", "Do I need OBS?", "Can I keep
   my YouTube audience?", "What if I have one show, not five?", "Who maintains it?"
7. **Contact / Book a call** — the conversion surface (Calendly).

---

## 7. Conversion goal (the single most important thing)

- **Primary CTA (everywhere):** **Book a setup call** → Calendly. The hero offer is a
  service; the sale happens on a call, not a checkout.
- **Secondary CTA:** **Buy the license** → Gumroad/Lemon Squeezy link (for the self-serve
  technical buyer).
- **Tertiary:** "Hosted plans coming — join the waitlist" (email capture) to gauge SaaS
  demand without building it.
- **Where leads go:** Calendly + your email; waitlist to a simple list.

---

## 8. Design direction

- **Reuse the existing dark cinematic system** — it already looks like premium broadcast
  tech and it's a live demo of your own product's taste. Tokens: Anton (display) + Inter
  (body), near-black `#0A0908` + amber `#F5A524` + cream `#F3EFE7`, live red `#E8402A`,
  gradient art wells, pill buttons, big Anton headlines.
- **Vibe:** premium broadcast-tech, confident, a little bit "network launch." Not
  cutesy, not startup-generic.
- **Hero visual:** a mock of the multi-show routing view or the browser studio Program
  preview — show the product doing the thing nobody else does.

---

## 9. Practical build notes (for whoever builds it)

- This is a **mock / marketing** site — static is fine. No real backend required yet;
  wire the CTA to a real Calendly and a real Gumroad link if you have them, else
  placeholders clearly marked.
- **Stack:** a standalone Next.js app (or single-file HTML mock first, like the original
  `mockup/preview.html` approach) deployed to Vercel on its own domain.
- Mark any invented copy/stats so they can be replaced with real ones.
- **Do not** put the platform's admin/studio behind this — it's a separate marketing site
  pointing at a demo.

---

## 10. The distribution reality (read before you spend on the site)

The site is necessary but it is **not** the bottleneck. Built by Foundry wins your
customers' searches with weekly SEO content, not better tech. Plan to publish content
(multi-show streaming, "leave StreamYard," "own your church stream") from day one. A
beautiful site nobody finds loses to an ugly one that ranks. Budget as much attention to
getting in front of the ICP as to the site itself.

**First moves, in order:** (1) stand up the demo, (2) build this site with a Book-a-call
CTA, (3) land 3–5 done-for-you setups to learn the real support cost, (4) package the
license as passive income, (5) only consider SaaS once you're turning setup requests away.
