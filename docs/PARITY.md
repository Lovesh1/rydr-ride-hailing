# 🧩 Ryder ↔ Ola — Complete Feature Parity Ledger

The full teardown: every feature of the Ola consumer + driver + ops ecosystem,
from micro-interactions to whole subsystems, mapped to Ryder's implementation.
Compiled from public product surfaces (app-store listings, olacabs.com, press).
Ryder implements the same *capabilities* with original code and design.

**Legend** — ✅ shipped in Ryder · 🟡 partial · 🔵 shipped this round · ❌ deferred (with reason)

---

## 1. Rider — account & onboarding

| # | Detail | Ola behavior | Ryder |
|---|--------|--------------|-------|
| 1.1 | Phone-number-first login | OTP via SMS | ✅ OTP flow (hashed at rest, lockout); SMS gateway stub |
| 1.2 | New-user profile (name, email) | asked post-OTP | ✅ name at signup; email field in schema |
| 1.3 | Referral code at signup | both sides credited | ✅ ₹100 both sides |
| 1.4 | Welcome offers | first-ride coupons | ✅ FIRST50 auto-suggested + ₹500 welcome credit |
| 1.5 | Multi-language UI | EN + regional | ❌ deferred — i18n scaffold at launch localization pass |
| 1.6 | Account deletion / DPDP rights | in-app request | 🟡 documented (SECURITY.md §9); endpoint at compliance pass |

## 2. Rider — home screen

| # | Detail | Ola | Ryder |
|---|---|---|---|
| 2.1 | Map with nearby vehicles | live cars on map | ✅ stylised live map (real tiles = maps-vendor phase) |
| 2.2 | Current-location pickup with drag-adjust | pin drag | 🟡 fixed demo pickup; drag needs real map tiles |
| 2.3 | "Where to?" search bar | prominent | ✅ |
| 2.4 | Service tiles (city/rental/outstation/parcel…) | grid | ✅ + 🔵 Parcel tile |
| 2.5 | Saved places quick chips (Home/Work) | one-tap | ✅ save + one-tap booking |
| 2.6 | Recent destinations | list | 🟡 place list; per-user recents = one query, next pass |
| 2.7 | Promo/announcement banners | CMS-driven | ✅ static banner; CMS = admin phase |
| 2.8 | Wallet balance / Prime badge on home | header | ✅ |

## 3. Rider — booking flow (the micro-details)

| # | Detail | Ola | Ryder |
|---|---|---|---|
| 3.1 | Destination autocomplete | Google Places | ✅ place search API (vendor swap point marked) |
| 3.2 | Category list w/ ETA + seats + upfront fare | per category | ✅ six categories |
| 3.3 | Fare breakdown viewable pre-book | tap info | ✅ full component modal (base/slabs/time/fee/surge/night/GST) |
| 3.4 | Surge shown honestly | peak pricing flag | ✅ badge + amount in breakdown, admin-capped 3× |
| 3.5 | Night-fare indication | late-night rates | ✅ badge + 1.25× on distance+time |
| 3.6 | Coupon entry at checkout | apply code | ✅ validated server-side, per-user caps |
| 3.7 | Payment method choice at booking | Money/UPI/card/cash | ✅ wallet/cash live; UPI/card = PSP phase |
| 3.8 | **Multi-stop rides** | add stops | 🔵 add up to 2 stops in fare screen; fare covers full route |
| 3.9 | **Book for someone else** | guest rider w/ phone | 🔵 guest name+phone on booking; driver sees guest |
| 3.10 | **Corporate ride tag** | business profile | 🔵 corporate toggle + expense code stored on ride |
| 3.11 | Scheduled rides (up to 7 days) | date-time picker | ✅ quick-pick times; auto-dispatch T-2min |
| 3.12 | Retry / no-driver handling | graceful fail | ✅ 3-wave expanding cascade → EXPIRED + retry CTA |
| 3.13 | Insufficient balance guard | prompt topup | ✅ pre-book check with helpful message |
| 3.14 | Double-tap booking protection | dedupe | ✅ Idempotency-Key replay |

## 4. Rider — during the ride

| # | Detail | Ola | Ryder |
|---|---|---|---|
| 4.1 | Driver card (name, photo, rating, vehicle, plate) | on assign | ✅ (initials avatar; photos = storage phase) |
| 4.2 | Start OTP | 4-digit shown to rider | ✅ verified server-side |
| 4.3 | Live driver tracking | on map | ✅ 2.5s updates (SSE web / poll mobile) |
| 4.4 | Status timeline (assigned→arrived→ongoing) | steps | ✅ 4-step progress bar |
| 4.5 | Call driver (masked) | number privacy | 🟡 button + flow; Twilio Proxy = SMS-vendor phase |
| 4.6 | In-app chat | canned + free text | ❌ deferred — needs push infra; after FCM lands |
| 4.7 | Share live trip | link to contacts | ✅ native share sheet with trip details |
| 4.8 | SOS button | alerts + response desk | ✅ raises event → admin safety desk realtime |
| 4.9 | Emergency contacts | up to N contacts | ✅ manage up to 5 in profile |
| 4.10 | Cancel w/ reason + fee rules | reason sheet, grace | ✅ fee after 60s grace · 🔵 reason-picker sheet |
| 4.11 | Waiting-time meter after arrival | free window then ₹/min | ✅ 5 free min then per-category ₹/min, itemized |
| 4.12 | Ola Play (in-car entertainment) | music/TV in Primes | ❌ out of scope — hardware program, not app software |

## 5. Rider — post-ride

| # | Detail | Ola | Ryder |
|---|---|---|---|
| 5.1 | Auto wallet charge / collect cash | on complete | ✅ ledger-backed |
| 5.2 | Rate driver (stars + tags) | 5★ + chips | ✅ updates driver aggregate |
| 5.3 | Tip after ride | added post-trip | ✅ wallet→driver, driver notified |
| 5.4 | **Itemized receipt in history** | per-trip invoice | 🔵 tap any completed trip → full fare-component receipt |
| 5.5 | GST invoice download/email | PDF | 🟡 components stored per-ride; PDF render = invoicing job |
| 5.6 | Lost item flow | contact driver | ✅ support ticket type `lost_item` → admin desk |
| 5.7 | Fare dispute | support flow | ✅ ticket type `fare_dispute` |

## 6. Rider — money

| # | Detail | Ola | Ryder |
|---|---|---|---|
| 6.1 | Wallet (Ola Money) | store value | ✅ double-entry ledger |
| 6.2 | Topup via UPI/card | PSP | ✅ demo gateway; Razorpay order+webhook point marked |
| 6.3 | **Postpaid (pay later, settle monthly)** | credit limit, billed cycle | 🔵 Ryder Postpaid: ₹500 credit line, wallet may go negative within limit, settle via topup |
| 6.4 | Transaction history | list | ✅ typed ledger w/ notes |
| 6.5 | Refunds | to source/wallet | ✅ refund ledger type + admin path |
| 6.6 | Membership (Select/Prime) | subscription perks | ✅ Ryder Prime ₹149/mo: zero surge + 10% + priority |
| 6.7 | Refer & earn dashboard | code, count, share | ✅ |

## 7. Services beyond city rides

| # | Detail | Ola | Ryder |
|---|---|---|---|
| 7.1 | Rentals (hourly packages) | 1–12h slabs, extra km/min | ✅ full package engine |
| 7.2 | Outstation one-way/round | per-km + allowance + min-km | ✅ full engine |
| 7.3 | **Parcel (send packages)** | pickup→drop courier on bikes | 🔵 full flow: sender/receiver details, size tier, bike courier pricing, delivery OTP |
| 7.4 | Prime Plus (top-driver tier, no-cancel promise) | curated drivers | 🟡 modeled via Prime priority matching; separate tier = fleet-density phase |
| 7.5 | Corporate program (central billing) | org accounts | 🟡 ride tagging 🔵; org invoicing = B2B phase |
| 7.6 | Electric (S1 scooters, EV categories) | EV category | ✅ EV category (vehicle program itself out of scope) |

## 8. Driver partner — full surface

| # | Detail | Ola | Ryder |
|---|---|---|---|
| 8.1 | Separate partner onboarding + docs + KYC | upload → verify | ✅ pending→verified pipeline w/ admin queue |
| 8.2 | Online/offline, no slot booking | full flexibility | ✅ |
| 8.3 | Ride offers w/ countdown + fare + surge | accept/decline | ✅ 12s modal, cascade on decline |
| 8.4 | Arrive → OTP → complete flow | staged | ✅ |
| 8.5 | Daily real-time earnings + cash-out | daily settlement | ✅ today/week + instant-payout action |
| 8.6 | Low commission transparency | shown per trip | ✅ 78% share itemized in every settlement note |
| 8.7 | **GoTo / preferred destination mode** | rides toward home, limited/day | 🔵 set GoTo pin → matcher prefers rides dropping near it; 2 activations/day |
| 8.8 | **Driving-hours fatigue alert** | break reminders | 🔵 online-hours tracked; "take a break" banner past 8h |
| 8.9 | Incentives (daily/weekly targets) | progress cards | 🟡 metrics live (trips/earnings/acceptance); target-card engine = growth phase |
| 8.10 | Heatmap of demand | surge zones map | 🟡 admin has it; driver surfacing next |
| 8.11 | Driver referral bonus | invite drivers | ✅ referral codes exist for drivers too |
| 8.12 | In-app SOS + 24×7 support | button | ✅ SOS API works for drivers; ticket desk shared |
| 8.13 | Fleet-operator app (multi-car owners) | separate app | ❌ deferred — B2B surface after core density |

## 9. Platform / ops (already deep — see PRODUCTION.md)

Matching cascade ✅ · surge control ✅ · KYC desk ✅ · rider mgmt ✅ · revenue ✅ ·
SOS desk ✅ · tickets ✅ · audit ✅ · metrics/alerts/runbooks ✅ · rate limiting ✅ ·
idempotent money ✅ · backups/DR ✅ · CI ✅ · load-tested ✅

## 10. Deliberately out of scope (and why)

- **Ola Play** in-car screens, **Ola Store/Dash**, **Ola Electric vehicle sales**,
  **Krutrim AI** — separate business lines, not ride-hailing app software.
- Google Maps tiles, Twilio SMS/masking, Razorpay — vendor keys; every
  integration point is already marked in code.

---

### Scorecard after this round
**58 capabilities shipped ✅/🔵 · 8 partial 🟡 · 6 deferred ❌ (each with a stated reason)**

*Sources: [Ola on Google Play](https://play.google.com/store/apps/details?id=com.olacabs.customer) · [Ola on the App Store](https://apps.apple.com/us/app/ola-book-cab-auto-bike-taxi/id539179365) · [olacabs.com](https://www.olacabs.com/) · [Ola Outstation](https://www.olacabs.com/features-outstation) · [Ola Driver on Google Play](https://play.google.com/store/apps/details?id=com.olacabs.oladriver&hl=en_IN) · [Inc42 on driver incentives](https://inc42.com/buzz/revamped-pay-incentives-bring-ola-drivers-back-to-the-platform/) · [TechCrunch on tipping](https://techcrunch.com/2020/06/29/indian-ride-hailing-giant-ola-adds-tipping-option-to-its-app-globally)*
