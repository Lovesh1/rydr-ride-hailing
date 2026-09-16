# 📄 RYDR — Complete Feature Specification

Everything that needs to be built for a production-grade Ola-style ride-hailing platform.
Organized by surface: **Rider App**, **Driver App**, **Admin Dashboard**, and **Platform-wide**.

> **v1 production build shipped** (see [`server/`](../server) + [`web/`](../web)): phone-OTP auth,
> booking with upfront fares & promos, nearest-driver matching with offer cascade, the full ride
> state machine with OTP start, live SSE tracking, wallet ledger with driver earnings & tips,
> per-zone surge control, ratings, KYC queue, rider blocking, revenue analytics, SOS desk, audit log.

Legend: ✅ = in v1 prototype/build · 🔜 = documented, to build

---

## 1. 📱 Rider (Customer) App

### 1.1 Onboarding & Auth
- 🔜 Phone number login with OTP (SMS via Twilio/MSG91)
- 🔜 Social login (Google / Apple)
- 🔜 Profile setup — name, photo, email, emergency contact
- 🔜 Referral code entry at signup (both sides get ride credits)
- 🔜 Language selection (EN, HI, + regional)

### 1.2 Home & Booking
- ✅ Map-first home screen with current location
- ✅ "Where to?" search with recent & saved places (Home / Work / Custom)
- ✅ Pickup + drop location pins with drag-to-adjust
- ✅ Vehicle category selection:
  - **Bike** — cheapest, 1 rider
  - **Auto** — 3 seats, city classic
  - **Mini** — compact hatchback
  - **Prime Sedan** — comfy, top drivers
  - **Prime SUV** — 6 seats
  - **EV** — electric, green badge
- ✅ Upfront fare estimate per category with ETA
- 🔜 Fare breakdown (base + per-km + per-min + surge + taxes)
- 🔜 Ride now vs **Schedule ride** (up to 7 days ahead)
- 🔜 Multi-stop rides (up to 3 stops)
- 🔜 Book for someone else (guest rider with their phone number)
- 🔜 Rentals (hourly packages: 1h/10km, 2h/20km, …)
- 🔜 Outstation (one-way / round trip, city-to-city)

### 1.3 Matching & Live Ride
- ✅ Searching animation → driver assigned card (name, photo, rating, vehicle, plate, OTP)
- 🔜 Live driver location on map with route polyline + ETA updates
- 🔜 Start-ride OTP verification
- 🔜 In-app chat + masked calling (number privacy via Twilio Proxy)
- 🔜 Share live trip with contacts (link with live map)
- ✅ SOS button → emergency contacts + local emergency number + safety team
- 🔜 Route deviation alerts
- 🔜 Cancel ride with reason (fee after grace window)

### 1.4 Payments & Wallet
- ✅ RYDR Wallet — balance, add money, transaction history
- 🔜 Payment methods: UPI, cards, netbanking, cash, wallet
- 🔜 Auto-pay after ride, split fare with friends
- 🔜 Promo codes & discounts engine
- 🔜 Tips for driver post-ride
- 🔜 GST invoice download / email

### 1.5 Post-Ride & Retention
- ✅ Ride history with receipts
- ✅ Rate driver (1–5 ⭐ + tags + comment)
- 🔜 Lost item flow → contact driver
- 🔜 RYDR Pass (subscription: discounted rides, zero surge)
- 🔜 Rewards / coins on every ride, streaks 🔥
- 🔜 Refer & earn dashboard
- 🔜 Notifications: push, SMS, WhatsApp (ride status, offers)
- 🔜 Support center — FAQ, ticket, chat bot, call

---

## 2. 🛞 Driver (Partner) App

### 2.1 Onboarding & Verification
- 🔜 Phone OTP signup → document upload (DL, RC, insurance, permit, Aadhaar/ID, PAN)
- 🔜 Background verification pipeline + admin approval queue
- 🔜 Vehicle inspection checklist with photos
- 🔜 Training modules + quiz before first ride
- 🔜 Bank account / UPI payout setup

### 2.2 Core Driving
- ✅ Online/Offline toggle with daily status
- ✅ Incoming ride request card — pickup, drop, distance, fare, surge badge, accept/decline timer
- 🔜 Turn-by-turn navigation (Google Maps / Mapbox deep link or in-app)
- 🔜 OTP start ride → end ride → collect payment flow
- 🔜 Auto-accept mode, preferred destination mode (2×/day)
- 🔜 Heatmap of demand zones
- ✅ Trip queue (back-to-back ride while finishing current)

### 2.3 Earnings & Incentives
- ✅ Earnings dashboard — today / week / month, per-ride breakdown
- ✅ Incentive cards — daily targets (e.g., 12 rides = ₹300 bonus), streaks
- 🔜 Instant payout vs weekly settlement
- 🔜 Fuel/EV-charging partner discounts
- 🔜 Insurance & benefits hub

### 2.4 Quality & Account
- ✅ Rating & acceptance-rate display
- 🔜 Feedback details with improvement tips
- 🔜 Document expiry reminders & re-upload
- 🔜 In-app support + dispute a fare/cancellation
- 🔜 Leaderboard (city-level, gamified) 🏆

---

## 3. 🧠 Admin Dashboard

### 3.1 Live Operations
- ✅ KPI overview — active rides, online drivers, today's revenue, cancellations
- ✅ Live rides table with status (searching / ongoing / completed / cancelled)
- 🔜 Live map of all vehicles (clustered)
- 🔜 God-view of a single ride (route, events, chat logs)
- 🔜 Manual ride assignment / rebooking on failure
- ✅ Surge zone monitor & manual surge override

### 3.2 User & Driver Management
- ✅ Riders table — search, profile, ride count, wallet, block/unblock
- ✅ Drivers table — status, rating, acceptance %, earnings, KYC state
- ✅ Driver verification queue (approve / reject documents)
- 🔜 Penalties & suspension workflows
- 🔜 Bulk comms (push/SMS to segments)

### 3.3 Money
- ✅ Revenue analytics — GMV, take rate, net revenue graphs
- 🔜 Payouts ledger + reconciliation
- 🔜 Refund management queue
- 🔜 Promo code manager (create, cap, audience, expiry)
- 🔜 Pricing engine config per city/category (base, per-km, per-min, surge caps)

### 3.4 Growth & Config
- ✅ Analytics — rides/day, DAU, funnel (search → book → complete)
- 🔜 City launch config (geofences, categories, pricing)
- 🔜 CMS for banners/offers in rider app
- 🔜 SOS / safety incident console with escalation
- 🔜 Role-based admin access (super admin, ops, support, finance)
- 🔜 Audit logs for every admin action

---

## 4. 🌐 Landing Page (Marketing)

- ✅ Hero with app download CTAs (App Store / Play Store)
- ✅ How it works (3 steps)
- ✅ Vehicle categories showcase with fares
- ✅ Safety features section
- ✅ Driver acquisition section ("Drive with RYDR")
- ✅ Stats strip (rides, cities, drivers)
- ✅ Testimonials, FAQ, footer with legal links
- 🔜 SEO meta, OG images, blog, city pages

---

## 5. ⚙️ Platform-wide / Non-functional

| Area | Requirement |
|------|-------------|
| **Matching** | Nearest-driver dispatch with acceptance timeout cascade; H3/geohash indexing |
| **Pricing** | Upfront pricing, surge (demand/supply per zone), tolls, taxes |
| **Maps** | Geocoding, reverse geocoding, routing, ETA, snap-to-road |
| **Realtime** | WebSocket/MQTT for locations (driver ping every 3–5s), ride state machine |
| **Payments** | PCI-compliant gateway (Razorpay/Stripe), wallet ledger with double-entry |
| **Notifications** | FCM/APNs push, SMS, WhatsApp, email receipts |
| **Safety** | SOS, trip share, number masking, driver KYC, telematics |
| **Scale** | Multi-city sharding, read replicas, event-driven (Kafka) |
| **Compliance** | GDPR/DPDP data rights, GST invoicing, local transport regs |
| **Observability** | Metrics, tracing, alerting, on-call runbooks |

See [ARCHITECTURE.md](ARCHITECTURE.md) for system design and [ROADMAP.md](ROADMAP.md) for build phases.
