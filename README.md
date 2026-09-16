# ⚡ RYDR — Production Ride-Hailing Platform (Ola-style)

> **Move beautifully.** A complete, working ride-hailing product — not a mockup.

RYDR is a full-stack Ola/Uber-style platform with a **zero-dependency Node.js backend**
(real SQLite database, real matching engine, real wallet ledger) and **premium web clients**
for every surface — designed dark, gold and emerald, like it costs money.

<p align="center"><i>Rider · Driver · Admin · Landing — all live against one real API.</i></p>

## 🚀 Run it (no install, no build)

Requires Node.js ≥ 22.5 (uses built-in `node:sqlite`). There are **zero npm dependencies**.

```bash
npm start
```

| Surface | URL | Sign in with |
|---|---|---|
| 🌐 Landing | http://localhost:4321 | — |
| 📱 Rider app | http://localhost:4321/rider | any phone number (OTP shown on screen) |
| 🛞 Driver app | http://localhost:4321/driver | `+919000000010` (Ramesh, verified) or any new number (pending KYC) |
| 🧠 Ops console | http://localhost:4321/admin | `+919999900000` |

> **Demo notes** — OTPs are displayed in the UI because no SMS gateway is wired (the code
> path is marked for Twilio Verify). All three roles share `localStorage`, so use separate
> browser profiles/incognito windows to run rider + driver + admin simultaneously.
> A simulated fleet of 12 bot drivers accepts rides, drives to pickup, and completes trips
> (`RYDR_TIME_SCALE` env var controls how fast they move; default 18× real time).

## ✅ What actually works (end to end)

- **Auth** — phone + OTP (rate-limited, expiring), HMAC-signed tokens, roles (rider/driver/admin)
- **Booking** — place search, upfront fare estimates for 5 categories, promo codes, wallet/cash
- **Matching** — nearest-driver dispatch over expanding radius, 15s offer cascade across 3 waves
- **Ride state machine** — `SEARCHING → ACCEPTED → ARRIVED → (OTP) ONGOING → COMPLETED`, plus cancellation with late-fee logic and expiry
- **Live tracking** — driver GPS streamed to the rider & admin over SSE, drawn on a stylised map
- **Wallet** — real ledger (topups, ride charges, driver earnings at 78%, tips, promo credits)
- **Pricing** — base + per-km + per-min + GST, per-zone surge (admin-controlled, capped 3×)
- **Ratings** — 5-star with tags, aggregates update the driver's rating
- **Driver app** — online toggle (KYC-gated), offer accept/decline with countdown, arrive → OTP verify → complete flow, earnings summary
- **Admin console** — live KPIs, SSE fleet map, rides ledger, KYC approve/reject/suspend, rider block/unblock, surge sliders that change real prices, revenue analytics, SOS desk, audit log
- **Safety** — SOS events raised from an active ride, alerting connected admins in real time

## 🗂️ Repository layout

```
server/            zero-dependency Node.js backend
  index.js         HTTP server (static + API + SSE)
  db.js            node:sqlite schema + seed (zones, promos, bot fleet)
  routes.js        REST API — auth, rider, driver, admin
  rides.js         state machine, matching cascade, wallet ledger
  pricing.js       rate cards, surge, fare estimation, promo engine
  sim.js           bot driver fleet (accepts, drives, completes)
  events.js        SSE hub (per-user channels + admin firehose)
  lib.js           tokens, geo math, http helpers
web/               premium clients (no framework, no build step)
  index.html       landing
  rider.html       rider app (SPA)
  driver.html      partner app (SPA)
  admin.html       ops console (SPA)
  assets/          design system + client SDK
docs/              product docs (features, architecture, roadmap)
mockups/           phase-1 static mockups (superseded by web/)
data/              SQLite database (gitignored — delete to reseed)
```

## 🔌 API surface (summary)

```
POST /api/auth/otp            /api/auth/verify
GET  /api/me                  /api/events (SSE)         /api/places?q=
POST /api/fares/estimate
POST /api/rides               GET /api/rides[/active|/:id]
POST /api/rides/:id/cancel|rate|tip|sos
GET  /api/wallet              POST /api/wallet/topup
POST /api/driver/status|ping  GET /api/driver/offer|summary
POST /api/driver/rides/:id/accept|decline|arrived|start|complete
GET  /api/admin/overview|rides|drivers|riders|zones|revenue|positions|sos|audit
POST /api/admin/drivers/:id/kyc   /api/admin/users/:id/block
POST /api/admin/zones/:id/surge   /api/admin/sos/:id/resolve
```

## 🎨 Design system

Obsidian `#08090B` · porcelain ink · champagne gold `#D9C08A` · emerald `#1FCE8B` ·
Clash Display + Satoshi (Fontshare) with Instrument Serif italics · hairline borders ·
film grain · slow reveals. Tokens live in [`web/assets/base.css`](web/assets/base.css).

## 🏭 Taking it to real production

The deliberate gaps between this build and a public launch:

1. **SMS** — wire `routes.js` OTP path to Twilio Verify / MSG91 (marked with comments)
2. **Payments** — replace demo topup with Razorpay/Stripe order + webhook confirmation
3. **Maps** — swap the stylised canvas for Google Maps / Mapbox tiles + real routing ETAs
4. **Scale-out** — move offer timers & SSE fan-out to Redis pub/sub when running >1 instance
5. **Hardening** — HTTPS, secret rotation, rate limiting on all endpoints, backups

Full specs: [docs/FEATURES.md](docs/FEATURES.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/ROADMAP.md](docs/ROADMAP.md)

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
