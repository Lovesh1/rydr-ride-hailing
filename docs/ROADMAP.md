# 🗺️ RYDR — Build Roadmap

Phased plan from these HTML prototypes to a launched product.

## Phase 0 — Foundation ✅ (this repo)
- [x] Design system (dark, neon lime + violet, glass)
- [x] Landing page prototype
- [x] Rider app prototype (booking flow, wallet, history)
- [x] Driver app prototype (requests, earnings, incentives)
- [x] Admin dashboard prototype (KPIs, tables, surge)
- [x] Full feature spec + architecture docs

## Phase 1 — MVP backend (4–6 weeks)
- [ ] Auth service: phone OTP, JWT
- [ ] User + driver profiles, vehicle registry
- [ ] Ride service with full state machine
- [ ] Matching v1 (Redis GEO, nearest driver, timeout cascade)
- [ ] Upfront pricing (static rate card, no surge)
- [ ] Cash payments only
- [ ] WebSocket live tracking
- [ ] Push notifications (FCM)

## Phase 2 — Rider & Driver apps (parallel, 6–8 weeks)
- [ ] React Native apps wired to MVP APIs
- [ ] Maps: geocoding, autocomplete, route preview
- [ ] OTP ride start, rating flow
- [ ] Driver onboarding + document upload
- [ ] Admin: KYC approval queue, live rides table, block/unblock

## Phase 3 — Money (4 weeks)
- [ ] Payment gateway (UPI, cards) + wallet ledger
- [ ] Driver payouts (weekly settlement)
- [ ] Promo code engine
- [ ] GST invoices

## Phase 4 — Growth & safety (4 weeks)
- [ ] Surge pricing + zone heatmaps
- [ ] SOS console, trip sharing, number masking
- [ ] Scheduled rides, rentals
- [ ] Referral program, RYDR Pass subscription
- [ ] Analytics pipeline (Kafka → ClickHouse)

## Phase 5 — Scale (ongoing)
- [ ] Multi-city config & geofencing
- [ ] Driver incentives engine + leaderboard
- [ ] Outstation & multi-stop
- [ ] EV fleet program
- [ ] ML: ETA prediction, fraud detection, demand forecasting

## Launch checklist
- [ ] Load test: 10k concurrent rides
- [ ] Security audit + pen test
- [ ] Transport authority licensing per city
- [ ] Support playbooks + on-call rotation
- [ ] App store / Play store review pass
