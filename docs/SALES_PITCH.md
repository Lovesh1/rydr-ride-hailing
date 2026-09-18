# 💼 Ryder — Complete Sales Kit
*What you sell · for how much · what the alternatives don't have · the exact demo*

---

## 1 · WHAT YOU ARE SELLING (your price menu)

### The core deal — ₹2,00,000 one-time
| You deliver | Detail |
|---|---|
| Full platform, his brand | Rider app + Driver app (one codebase: Android, iPhone, web) + Ops console + landing site, renamed & recolored to his brand |
| Source code ownership | He owns the code for his city — no monthly license to anyone |
| Hosting, set up & running | Deployed on cloud with health checks, backups, monitoring (included first 12 months) |
| Google Maps live | Places search + road distances + traffic ETAs wired with a real key |
| The Profit Engine | The Intelligence tab — his money-finding machine (Section 3) |
| Go-live support | 30 days of fixes + his first 10 drivers onboarded with him |

### Your recurring income after the sale (this is where YOU profit long-term)
| Add-on | Your price | Notes |
|---|---|---|
| **AMC** (updates, monitoring, backups, priority fixes) | **₹12,000–15,000 / month** | Pitch as mandatory year-2; ~₹1.5L/yr recurring per client |
| Payments go-live (Razorpay) + SMS OTP (Twilio) | ₹20,000 one-time | Code is ready; you plug keys, test, hand over |
| Second city / expansion pack | ₹50,000 per city | Zones, pricing card, launch config |
| Custom feature days | ₹6,000–8,000 / day | Scope anything he dreams up later |
| Driver-onboarding service | ₹200 per verified driver | Optional operations revenue |

**One client = ₹2,00,000 now + ~₹1,90,000/year recurring if he takes AMC + one add-on.**
And this same codebase sells to the next city's operator again — your marginal cost is a rebrand.

---

## 2 · THE VALUE ANCHOR (why ₹2L is a steal — say these numbers)

What each piece costs if he buys it separately from the market:

| Module | Market rate (agency/Freelancer quotes) |
|---|---|
| Rider app (6 vehicle classes, live tracking, wallet) | ₹3,00,000 – 4,50,000 |
| Driver app (offers, OTP flow, earnings, GoTo mode) | ₹1,50,000 – 2,50,000 |
| Admin console (live fleet, KYC, surge, safety desk) | ₹1,50,000 – 2,00,000 |
| Rentals + Outstation + Parcel + Scheduled modules | ₹1,00,000 – 1,50,000 |
| **Analytics + Profit-Intelligence engine** | ₹1,50,000+ *(agencies don't even offer this)* |
| Payments/wallet ledger + promo/referral/subscription systems | ₹1,00,000 |
| Production hardening (security, rate-limits, backups, load-tested 3,900 req/s, 39 automated tests) | ₹75,000 |
| Hosting + Maps setup + docs + runbooks | ₹50,000 |
| **Total if built piecemeal** | **₹10,75,000 – 13,75,000 · 4–6 months** |
| **Your price** | **₹2,00,000 · live this week** |

> Line to say: *"An agency will quote you ten to fourteen lakhs and six months, and you still won't get the profit engine. I'm handing you the finished thing for two — because I make my money helping you run it, not billing you to build it."*

---

## 3 · WHAT THE ALTERNATIVES DON'T HAVE (your kill-table)

| Capability | ₹40k clone script (CodeCanyon-type) | Agency custom build (₹10L+) | SaaS white-label (rev-share) | **Ryder (yours)** |
|---|---|---|---|---|
| He owns the source | ❌ license only | ✅ after full payment | ❌ never | ✅ |
| Monthly fees to a vendor forever | — | — | ❌ ₹/ride or ₹20–50k/mo | ✅ none |
| Working demo he can touch TODAY | ❌ screenshots | ❌ wait 4–6 months | partial | ✅ live URL, his phone |
| **Profit Engine** — ₹-valued opportunities, RFM segments, LTV/ARPU, churn detection | ❌ | ❌ | ❌ basic charts at best | ✅ |
| **One-click ₹50 win-back** that actually credits the rider | ❌ | ❌ | ❌ | ✅ |
| **Demand forecast** (hour-of-day) + lost-revenue ledger | ❌ | ❌ | ❌ | ✅ |
| **Fare Lock** (₹5 surge-freeze — a revenue line) | ❌ | ❌ | ❌ | ✅ |
| **Ryder Wrapped** (shareable rider story = free marketing) | ❌ | ❌ | ❌ | ✅ |
| Prime subscription MRR + Postpaid + coins/streaks | ❌ | asks extra | rarely | ✅ |
| Parcel + Rentals + Outstation + Scheduled in one app | partial, buggy | asks extra per module | varies | ✅ |
| Proven performance numbers | ❌ | "trust us" | opaque | ✅ 3,900 req/s, p95 24 ms, printed in docs |
| Automated test suite protecting his business | ❌ | rarely delivered | internal | ✅ 39 assertions, runs on every change |
| Security: hashed OTPs, rate-limits, audit log, idempotent payments | ❌ notoriously leaky | varies | vendor-controlled | ✅ documented in SECURITY.md |

> Line to say: *"Clone scripts are toys, agencies sell you a construction project, SaaS keeps taxing every ride you ever do. This is the only option where the meter runs for YOU."*

---

## 4 · HIS MONEY (the numbers that close)

The **Owner Profit Simulator** is on the Intelligence tab — put his fingers on the sliders:

| His city looks like | Owner profit / month | ₹2L pays back in |
|---|---|---|
| 10 drivers · 10 rides/day · ₹120 fare · 20% | ₹72,000 | 84 days |
| **25 drivers · 12 rides/day · ₹140 · 20% + 60 Prime** | **₹2,60,940** | **23 days** |
| 60 drivers · 14 rides/day · ₹150 · 20% + 150 Prime | ₹7,78,350 | 8 days |

And beyond commission, the platform hands him revenue lines competitors don't have:
Prime MRR (₹149 × members), Fare-Lock fees, and the Profit Engine's recovered churn.

---

## 5 · THE DEMO — READY TO RUN

### Prepare (5 minutes, before he arrives)
```bash
# Option A — local machine demo (richest):
npm run demo:seed        # fills 30 days of history: 8 riders, all segments, leaks
npm start                # server up → open localhost:4321/admin.html

# Option B — his phone, zero setup:
# app   : https://lovesh1.github.io/rydr-ride-hailing/app/
# console (pre-fattened): https://lovesh1.github.io/rydr-ride-hailing/admin.html?demo=rich
```
Checklist: two browser tabs open (app + admin logged in as +919999900000),
phone on the live URL, Intelligence tab pre-loaded so the ₹-banner is first thing he sees.

### Act 1 — his rider's phone (3 min)
1. He signs up with HIS number → ₹500 welcome credit lands.
2. Books an Auto → watch the driver drive in live, OTP card, arrival → coins + CO₂ chips.
   *"Every ride mints loyalty points and a green story. Riders screenshot this."*
3. Open **Wrapped**. *"Spotify made Wrapped a marketing event. Your riders share this — that's free installs."*

### Act 2 — the feature nobody has (2 min)
4. On the fare screen tap **🔒 Lock this fare ₹5**. Switch to console → Surge zones → drag his zone to 2×.
   Book anyway — the locked price holds, the receipt shows the saving.
   *"He paid you ₹5 for peace of mind. Multiply by every rainy evening."*

### Act 3 — the console is his business (2 min)
5. Overview: his live ride is on the fleet map. Analytics: the funnel and demand pulse moved because of HIM.

### Act 4 — the close (3 min)
6. **Intelligence tab.** Point at the black banner: *"The engine already found ₹—— a month sitting in this demo city. Yours will do this every morning with your real data."*
7. Walk the top 3 cards — each has the rupees, the why, the action.
8. **Click 💌 Send ₹50** on Kabir Shah. Show it land in his wallet on the phone. *"Churn, handled in one click."*
9. **Simulator**: hand over the mouse. His drivers, his fares → *"pays for itself in N days."*
10. Slide the paper with Section 1's price menu across the table.

### The WhatsApp opener (send before the meeting)
> Bhai, before we meet — open this on your phone: (app link). Book one ride, takes 60 seconds.
> Then open (console link) — the Intelligence tab is what I really want to show you:
> it finds money in your city and tells you in rupees. Full platform, your brand,
> you own the code, live in a week. ₹2L all-in with hosting + Google Maps. See you Tuesday.

---

## 6 · OBJECTIONS & TERMS

- **"₹2L is a lot."** → Anchor table (Section 2). Then: *"What does ONE month of running at even 10 drivers make you? ₹72k. You're not spending, you're pre-buying three months of profit."*
- **"I saw a ₹50k app online."** → Kill-table row 1: license, no source, no engine, no support, and it dies at the first crash — *"who fixes it at 11 pm on Diwali?"* (You do — AMC.)
- **"Can I see it working first?"** → It IS working. Live URL, his phone, right now. No other seller can say that sentence.
- **"What if drivers/riders don't come?"** → The Profit Engine is exactly the tool for that: win-back credits, Prime conversion, peak-hour targeting. *"The app doesn't just take bookings, it grows them."*
- **Terms to hold:** 50% advance / 50% on go-live · AMC from month 2 · source handed over on final payment · his cloud + Maps accounts (billing his, keys included) · you keep the right to sell other cities.
- **Floor:** don't go below ₹1,50,000 + mandatory 6-month AMC — below that, walk; the demo will sell the next buyer.
