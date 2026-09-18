# 💼 Ryder — Buyer One-Pager (₹2,00,000 · hosting + Google Maps included)

*The pitch, the math, and the 10-minute demo script.*

## The one-liner
> "You're not buying an app. You're buying a machine that finds money in your city —
> and it tells you, in rupees, where that money is, every morning."

## What the buyer gets for ₹2,00,000
- Complete rider + driver app (one codebase, Android/iOS/web), premium modern design
- Six vehicle classes · rentals · outstation · parcel courier · scheduled rides
- Full ops console: live fleet, KYC, surge dial, safety desk, tickets, audit trail
- **The Profit Engine** (the differentiator — see below)
- Revenue features competitors don't have: Prime subscriptions (recurring ₹149/mo),
  Fare Lock micro-fees, postpaid credit line, refer-&-earn, coins & streaks, Wrapped
- Hosting + Google Maps API wired in · production hardening (rate-limits, backups,
  metrics, 34-assertion test suite, load-tested at 3,900 req/s)

## The Profit Engine (why he wins with THIS app)
Not dashboards — decisions. The Intelligence tab computes from his live data:
- **"Money on the table"**: ranked opportunities each priced in ₹/month with the
  why and a one-click action (Prime conversion targets, win-back list, zone
  peak-pricing, cash→wallet shift, supply gaps at forecast peak hours)
- **One-click ₹50 win-back** that actually lands in a fading rider's wallet
- **Unit economics**: his take revenue, ARPU, rider LTV, Prime MRR, promo ROI
- **RFM segments**: champions / loyal / at-risk / new / dormant with value totals
- **Lost-revenue ledger**: every expired & cancelled fare, counted
- **Demand forecast**: hour-of-day curve telling him where to park drivers

## The payback math (shown live in the simulator)
| Scenario | Drivers | Rides/driver/day | Avg fare | Commission | Owner/month | Pays back ₹2L in |
|---|---|---|---|---|---|---|
| Small start | 10 | 10 | ₹120 | 20% | ₹72,000 | ~84 days |
| Realistic | 25 | 12 | ₹140 | 20% + 60 Prime | **₹2,60,940** | **23 days** |
| Growth | 60 | 14 | ₹150 | 20% + 150 Prime | ₹7,78,350 | 8 days |

*The simulator is on the Intelligence tab — hand him the sliders and let him type
his own city's numbers. His numbers, his profit, live.*

## 10-minute demo script
1. **Phone in his hand** → live URL → book an EV → live tracking → arrival screen
   (coins + CO₂ chips) → open **Wrapped** ("your riders will screenshot this")
2. **Fare Lock** → lock a fare, crank surge from the console, book anyway at the
   locked price → "features people pay ₹5 for, straight to your ledger"
3. **Console** → watch HIS ride in the funnel & demand pulse (Analytics)
4. **Intelligence tab** → the ₹-banner: "the engine already found this much/month"
   → click **Send ₹50** on an at-risk rider → it lands instantly
5. **Simulator** → his city's numbers → *"pays for itself in N days"* → close.

## Objection killers
- "Why not build cheaper?" → agency quotes for this scope run 8–15L and 4–6 months;
  this is live today, hosted, tested, with the analytics layer they never include.
- "Will it scale?" → load-tested 3,900 req/s on one node; docs include the scale path.
- "What about maps/SMS/payments?" → Google Maps included in price; Twilio & Razorpay
  are plug-keys-and-go (already coded, one env file).
