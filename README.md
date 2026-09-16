# ☀️ Ryder — Full-Stack Ride-Hailing Platform

> **Go places, joyfully.** A complete Ola-class ride-hailing product: a real backend,
> a React Native app for riders & driver partners, and a live ops console — in one repo.

Feature-parity with a production Indian ride-hailing platform (our own brand, design and code):
slab-based fare engine, surge & night pricing, hourly rentals, outstation, scheduled rides,
Prime membership, referrals, wallet ledger, KYC ops, SOS desk — all implemented, all working.

**Design**: warm porcelain light theme — ivory `#F6F4EF`, deep emerald `#0B8457`, soft gold
`#AE8A4A`, Manrope + Fraunces italics. Premium without the black.

## 🚀 Run it

**1. The server** (Node ≥ 22.5, zero npm dependencies — uses built-in `node:sqlite`):

```bash
npm start
```

**2. The React Native app** (Expo — rider + driver partner in one codebase):

```bash
cd app-mobile
npm install
npx expo start
```

Press `w` for the browser, scan the QR with Expo Go for a phone (set your LAN IP in
[`app-mobile/src/api.js`](app-mobile/src/api.js)), or `a` for the Android emulator.

| Surface | Where | Sign in |
|---|---|---|
| 📱 Rider app | Expo → "I need a ride" | any phone number (OTP shown on screen) |
| 🛞 Driver app | Expo → "I drive" | `+919000000010` (verified) or any new number (pending KYC) |
| 🧠 Ops console | http://localhost:4321/admin | `+919999900000` |
| 🌐 Landing | http://localhost:4321 | — |

> A simulated fleet of 14 bot drivers accepts rides, drives to pickup and completes trips
> (`RYDR_TIME_SCALE` env var controls speed, default 18×). OTPs display in-app because no
> SMS gateway is wired — the Twilio hook is marked in `server/routes.js`.

## 🧮 The fare engine (`server/pricing.js`)

City fares follow the full industry structure, and the app shows this exact breakdown
before every booking:

```
fare = base (covers first N km)
     + slab-1 per-km  (shorter hops, higher rate)
     + slab-2 per-km  (beyond ~10–12 km, lower rate)
     + per-minute ride-time charge
  × surge (zone-based, admin-dialled, capped 3×)
  × 1.25 night multiplier (11pm–5am)
  → floor at minimum fare
     + booking fee
     + waiting charge (per min beyond 5 free min after arrival)
     − Prime discount (10%, and Prime waives surge entirely)
     − promo discount
     + 5% GST
```

Plus two more pricing models:
- **Rentals** — 1/2/4/8/12-hour packages (10 km/hr included), per-category hourly rates, extra-km & extra-min rates
- **Outstation** — per-km with driver allowance/day and minimum-km billing (250–300 km/day), one-way vs round trip

## ✅ Feature parity checklist

**Rider** — phone-OTP auth · welcome credit · place search & saved places (home/work) ·
six vehicle classes · upfront fares with tap-to-view breakdown · promo codes · wallet or cash ·
hourly rentals · outstation (one-way/round) · scheduled rides (auto-dispatched at T-2min) ·
live driver tracking · ride OTP · SOS with emergency contacts · trip share · cancel with
late-fee logic · rate & tip · Ryder Prime (₹149/mo: zero surge + 10% off) · refer & earn ₹100 ·
support tickets · full trip history

**Driver partner** — separate sign-in mode · KYC-gated onboarding · online/offline ·
offer cards with countdown & surge flag · arrive → OTP verify → complete flow ·
earnings (today/week), 78% share, instant payout · acceptance rate · trip insurance

**Admin ops** — live KPI dashboard · SSE fleet map · rides ledger across all service types ·
KYC approve/reject/suspend/reinstate · rider block/Prime view · surge sliders (live prices) ·
revenue by category & service · SOS desk · support-ticket desk · audit log

## 🗂️ Repository layout

```
server/         zero-dependency Node.js backend (auth, matching, fare engine,
                state machine, wallet, scheduler, bot-fleet sim, SSE)
app-mobile/     React Native (Expo) app — rider + driver partner
  src/theme.js    light design tokens
  src/api.js      REST client + polling (works on web, Android, iOS)
  src/ui.js       component kit (buttons, map canvas, radar, OTP, toasts)
  src/screens/    auth · rider (8 screens) · driver (4 screens)
web/            landing page + ops console (light theme, SSE realtime)
docs/           feature spec · architecture · roadmap
mockups/        phase-1 static mockups (history)
```

## 🏭 Production readiness — measured, not promised

```
Load test (single node, dev laptop, mixed real traffic):
  39,156 requests · 3,912 req/s sustained · 0 errors
  p50 11.3ms · p90 16.2ms · p95 24.4ms · p99 32.7ms
Under 30× overload with production limits ON: 41,955 requests
  refused cleanly with 429 + Retry-After, legit traffic unaffected.
```

**In the code** — rate limiting (per-phone OTP / per-user API / per-IP auth), hashed OTPs with
constant-time compare + lockout, HMAC tokens, object-level authorization, `Idempotency-Key`
replay on booking & top-up (double-tap can't double-charge), append-only ledger, security
headers + CSP, structured JSON logs, Prometheus `/metrics`, `/health` + `/ready` probes,
graceful drain on SIGTERM, hot backups via `VACUUM INTO`, admin audit log.

**In the repo** — [`Dockerfile`](Dockerfile) (non-root, healthcheck) · [`docker-compose.yml`](docker-compose.yml)
(with hourly backup sidecar) · [`k8s/ryder.yaml`](k8s/ryder.yaml) (StatefulSet, probes, HPA,
Ingress+TLS, backup CronJob) · [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
(syntax gate → full-lifecycle smoke test → latency budget probe → Expo export → container boot test).

```bash
npm test                                   # end-to-end smoke: auth → book → complete → ledger → RBAC
npm run loadtest -- --conns 50 --secs 10   # your own latency/throughput report
npm run backup                             # consistent hot snapshot
```

**The engineering docs** — the complete ecosystem, brick by brick:
- [docs/PRODUCTION.md](docs/PRODUCTION.md) — SLOs, measured perf, capacity math (100k drivers → 25k loc-writes/s), all 25 ecosystem bricks mapped repo→scale, 4-phase scale-out, cost model
- [docs/SECURITY.md](docs/SECURITY.md) — STRIDE threat model, auth/authz design, secrets, input handling, PCI scope, DPDP compliance, fraud-signal backlog
- [docs/OPERATIONS.md](docs/OPERATIONS.md) — metrics/alerts/dashboards, 6 runbooks, release engineering, backup/DR (RPO/RTO), on-call
- [docs/FEATURES.md](docs/FEATURES.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/ROADMAP.md](docs/ROADMAP.md)

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
