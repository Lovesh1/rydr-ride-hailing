# 🏭 Ryder — Production Engineering Spec

The complete path from this repo to a multi-city, production ride-hailing platform:
SLOs, measured performance, capacity math, the scale-out architecture, and every
ecosystem brick. Companion docs: [SECURITY.md](SECURITY.md) · [OPERATIONS.md](OPERATIONS.md).

---

## 1. Service level objectives (SLOs)

| Surface | Metric | Target | Why |
|---|---|---|---|
| Fare estimate API | p95 latency | < 150 ms | Rider is staring at a spinner pre-booking |
| Booking create | p99 latency | < 400 ms | Single most important tap in the product |
| Driver offer delivery | end-to-end | < 1.5 s from booking | Beats the rider's patience window |
| Location ingest | p95 | < 80 ms | 3–5 s ping cadence per online driver |
| Ride status stream | staleness | < 3 s | Map must feel live |
| API availability | monthly | 99.95 % (≤ 22 min down) | Rides are time-critical |
| Payment ledger writes | durability | zero loss (RPO 0 for ledger) | Money |
| OTP SMS delivery | p95 | < 8 s | Login abandonment cliff |

Error budget: 0.05%/month. Budget burn > 25% in any week freezes feature deploys
(see OPERATIONS.md §4).

## 2. Measured performance (this codebase, single node)

Load test: `npm run loadtest -- --conns 50 --secs 10` on a dev laptop (Windows,
Node 24, SQLite WAL). Mixed traffic: 50% fare estimates (full pricing engine +
surge SQL per request), 20% place search, 20% profile, 10% ride history.

```
OVERALL  n=39,156   p50=11.3ms  p90=16.2ms  p95=24.4ms  p99=32.7ms  max=65ms
throughput: 3,912 req/s sustained · errors: 0
```

With production rate limits ON, the same test is throttled to ~120 req/s with
41,955 requests correctly refused with `429 + Retry-After` — the limiter holds
under 30× overload without latency degradation for legitimate traffic.

### What that means in ride-hailing units
A booking generates ~40 API calls across its lifecycle (search, estimate, book,
poll/stream, driver actions, rating). At 3,900 req/s a single node ≈ **8,400
concurrent active rides** or ~350k rides/day — city-scale on one box. The
scale-out plan below is for when the fleet's *location firehose* (not the API)
becomes the bottleneck.

## 3. Capacity planning math

The load driver at scale is driver GPS pings, not bookings:

```
100,000 online drivers × 1 ping / 4 s            = 25,000 writes/s   (location)
peak bookings: 1M rides/day, 12% in peak hour    = 33 rides/s
  × ~3 matching offers each                      = 100 offer events/s
rider status polls/streams: 8,400 concurrent × 1/2.5s = 3,400 reads/s
```

Design consequences:
- **Location** never touches the relational DB → Redis GEO (in-memory), TTL 30 s,
  snapshot to analytics via Kafka. 25k writes/s is a single Redis node's light work.
- **Bookings/ledger** (33 writes/s + audit) is trivially Postgres-sized; what needs
  care is contention on hot driver rows → per-driver advisory locks / SELECT FOR
  UPDATE SKIP LOCKED on offer assignment.
- **Fan-out** (status to riders): SSE/WebSocket nodes are stateless; 10k
  connections/node, horizontal behind the LB, subscribed to Redis pub/sub.

## 4. The ecosystem, brick by brick

Every service a full platform runs, mapped to where it lives in this repo today
and what it becomes at scale:

| # | Brick | In this repo | At scale |
|---|---|---|---|
| 1 | Identity & OTP auth | `routes.js` auth + HMAC tokens, hashed OTPs | Dedicated auth svc; Twilio Verify/MSG91; refresh-token rotation; device binding |
| 2 | Rider profile & saved places | `users`, `saved_places` | Profile svc + Redis cache |
| 3 | Driver onboarding & KYC | `drivers.kyc_status` + admin queue | Doc-upload svc, liveness check vendor, background-verification vendor pipeline, expiry re-verification cron |
| 4 | Vehicle registry | `drivers` columns | Separate `vehicles` svc w/ inspection history |
| 5 | Geo & places | `PLACES` seed + haversine | Google Places/Mapbox geocoding; snap-to-road; H3 indexing |
| 6 | Routing & ETA | route-factor × straight line | OSRM/Valhalla self-hosted + live-traffic ETA model |
| 7 | Pricing engine | `pricing.js` (slabs, surge, night, waiting, GST) | Same rules externalized to a config service, versioned rate cards per city, A/B rails |
| 8 | Surge | zone circles + admin dial | Demand/supply per H3 cell, auto-computed each minute, ML-smoothed, hard caps + audit |
| 9 | Matching/dispatch | nearest-driver cascade in-process | Dispatch svc: Redis GEO candidates → scoring (ETA, rating, acceptance, fairness) → offer FSM in Redis; batched (Hungarian) assignment at high density |
| 10 | Ride lifecycle | `rides.js` state machine | Same FSM, events → Kafka (`ride_events` topic) as source of truth for analytics |
| 11 | Realtime tracking | SSE hub + polling (mobile) | WebSocket/MQTT gateway fleet; Redis pub/sub; regional brokers |
| 12 | Wallet & ledger | double-entry `wallet_ledger`, idempotency keys | Ledger svc (append-only, daily close), PSP integration (Razorpay/Stripe): order → webhook → credit; reconciliation job |
| 13 | Payments/payouts | 78% driver share computed at completion | Payout svc: daily settlement files + instant payout rails (IMPS/UPI), driver ledger statements |
| 14 | Promos & referrals | `promos`, referral codes + ₹100 credits | Promo svc with budgets, fraud caps, cohort targeting |
| 15 | Membership (Prime) | `prime_until` + pricing hooks | Subscription svc, auto-renew via UPI mandate |
| 16 | Rentals & outstation | package + per-km engines | Same, plus driver-allowance settlement & odometer capture |
| 17 | Scheduled rides | `SCHEDULED` + dispatcher tick | Reservation svc with driver pre-assignment + guarantees |
| 18 | Notifications | SSE + in-app | FCM/APNs push svc, SMS/WhatsApp templates, per-event routing table |
| 19 | Safety/SOS | `sos_events` + admin desk | 24/7 response desk tooling, IVR bridge, authority escalation APIs, trip-anomaly detection (route deviation, long stop) |
| 20 | Support | `tickets` + admin desk | Ticketing (queues, SLAs, macros), masked-call bridge, lost-item flow |
| 21 | Fraud & risk | rate limits, OTP lockout, blocked users | Risk svc: device fingerprint, GPS-spoof detection, collusion graphs (rider↔driver), payment-risk scoring |
| 22 | Ops console | `web/admin.html` | Same console productized: RBAC roles, audit on every action (already), config UIs |
| 23 | Analytics | `revenue` SQL aggregates | Kafka → ClickHouse; funnels, cohort LTV, driver utilization, city P&L |
| 24 | Experimentation | — | Flag service + exposure logging |
| 25 | Data platform / ML | — | Feature store; models: ETA, surge, fraud, driver churn, demand forecast |

## 5. Scale-out sequence (each step is independently shippable)

**Phase A — now (this repo)**: single node, SQLite WAL, in-proc timers.
Verified: 3.9k req/s, p95 24 ms. Fine to city launch scale.

**Phase B — stateless tier**
1. Swap `node:sqlite` → Postgres (schema ports 1:1; `db.js` is the only touchpoint)
2. Offer timers + rate-limit buckets + SSE fan-out → Redis (key schemes already match)
3. `replicas: N` behind the LB; HPA in `k8s/ryder.yaml` becomes active
4. Sessions already stateless (HMAC tokens) — nothing to do

**Phase C — service split** (split only what has independent scaling pressure)
- `dispatch` (CPU + Redis heavy) · `location-gateway` (connection heavy) ·
  `ledger` (isolation for money) · everything else stays a modular monolith
- Kafka between them; the `ride_events` topic becomes the audit + analytics spine

**Phase D — multi-city / multi-region**
- City = logical shard key on every table; per-region deployments with city
  affinity; global control plane for config/pricing
- DR: cross-region replica, RPO ≤ 5 min (ledger streams synchronously), RTO ≤ 30 min

## 6. Performance engineering details already in the code

- **Keep-alive tuning**: `keepAliveTimeout 65 s > LB idle 60 s` prevents the
  classic 502-on-race (`server/index.js`)
- **Route-level histograms** with normalized route labels (low cardinality) —
  `/metrics`, Prometheus format
- **Graceful drain**: readiness flips false on SIGTERM → LB stops sending →
  in-flight requests finish → DB closes (`shutdown()`)
- **SQLite WAL** + prepared statements throughout; indices on every hot lookup
  (`rides(status)`, `rides(rider_id, requested_at)`, ledger by user)
- **Body cap 1 MB**, JSON parse guarded, 429s carry `Retry-After`
- **Static assets** cached 1 h; HTML no-cache (deploys take effect immediately)

## 7. Cost model (order of magnitude, Phase B on managed cloud)

| Component | Size | ~$/mo |
|---|---|---|
| API nodes ×3 (2 vCPU) | handles ≥ 10k concurrent rides | 150 |
| Postgres (2 vCPU HA) | bookings + ledger | 120 |
| Redis (2 GB HA) | geo + offers + pub/sub | 60 |
| LB + egress | | 40 |
| Observability stack | Prometheus/Grafana/Loki self-host | 40 |
| SMS (Twilio Verify) | ~₹0.15–0.5/OTP — dominates at scale | usage |
| Maps API | biggest external line item; mitigate w/ OSRM self-host | usage |

Infrastructure is cheap; **SMS + maps are the real variable costs** — both have
self-hostable/negotiable mitigations noted above.
