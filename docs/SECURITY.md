# 🔐 Ryder — Security Architecture

Threat model, controls implemented in this codebase, and the hardening path to
public launch. Every control marked ✅ is live code you can point to.

---

## 1. Threat model (STRIDE, top risks for ride-hailing)

| Threat | Scenario | Controls |
|---|---|---|
| **S**poofing | Attacker logs in as another rider/driver | ✅ OTP login (rate-limited, hashed at rest, 5-attempt lockout, 5-min expiry); ✅ HMAC-signed tokens with expiry & constant-time verify |
| **T**ampering | Client submits a doctored fare | ✅ Fares computed **server-side only**; client sends locations, never prices; final fare re-derived at completion |
| **R**epudiation | "I never approved that charge" / rogue admin | ✅ Append-only wallet ledger with `balance_after` chain; ✅ `audit_log` on every admin action |
| **I**nformation disclosure | Rider PII / location history leaks | ✅ Object-level authz on every ride read (rider, assigned driver, or admin only); phone numbers truncated in logs; masked-calling planned (§8) |
| **D**enial of service | OTP-SMS pumping, booking floods | ✅ Per-phone+IP OTP limiter (5/min), per-user API limiter (240/min), per-IP auth limiter; 1 MB body cap; ✅ verified under 30× overload — 41,955 requests refused cleanly with 429 + Retry-After, zero latency impact on legit traffic |
| **E**levation of privilege | Rider calls admin APIs; driver acts on others' rides | ✅ Role checks on every namespace (`admins only`, `drivers only`, `riders only`); ✅ driver actions require `driver_id` match on the ride row (smoke-tested) |

## 2. Authentication

- **OTP at rest**: only `HMAC-SHA256(secret, phone:code)` is stored — a stolen DB
  cannot mint logins. Comparison is constant-time (`crypto.timingSafeEqual`).
- **Lockout**: 5 wrong attempts invalidates the code; new code required. OTP
  requests limited to 5/min per phone+IP (SMS-pumping economics killed).
- **Tokens**: HMAC-SHA256 signed, 7-day expiry, length-capped, constant-time
  verified (a malformed token is a clean 401 — regression-tested after the smoke
  suite caught a 500 here).
- **Production deltas**: short-lived access token (15 min) + rotating refresh
  token bound to device ID; sign-out-everywhere via token-version column;
  optional TOTP for admin accounts. `RYDER_EXPOSE_DEMO_OTP=false` removes the
  demo OTP from responses the moment an SMS gateway is wired.

## 3. Authorization (object level, not just role level)

- Ride reads: `rider_id == me || driver_id == me || role == admin` — enforced in
  `routes.js`, asserted in CI (`smoke.js`: "RBAC: rider blocked from admin API").
- Driver transitions (`accept/arrived/start/complete`) query
  `WHERE id = ? AND driver_id = ?` — a driver cannot act on someone else's trip.
- Wallet/ledger/saved-places/contacts: keyed by authenticated `user_id` only;
  no user-supplied user IDs accepted anywhere outside `/api/admin/*`.
- Admin role is only grantable via the seeded operator account — role is never
  accepted from client input on signup.

## 4. Secrets & configuration

- All secrets via env (`server/config.js`); **the server refuses to boot in
  production with the dev secret** (fail-closed).
- K8s: `Secret` object referenced by env; recommend Sealed Secrets / External
  Secrets Operator; rotate `RYDER_SECRET` by dual-accepting old+new for one
  token TTL window.
- No secrets in logs: OTPs are never logged (only truncated phone), tokens never
  logged, ledger notes carry no instruments.

## 5. Input handling

- JSON body cap 1 MB, parse failures → 400; phone regex-validated; promo codes
  upper-cased and length-capped; tips capped ₹500; topups capped ₹10k; surge
  admin-capped at 3×; idempotency keys length-capped 128.
- SQL: prepared statements **everywhere** — zero string-built SQL in the repo.
- XSS: web consoles escape all interpolated data via `esc()`; CSP on every HTML
  response (`script-src 'self' 'unsafe-inline'` today; moving inline scripts to
  files removes the `unsafe-inline` allowance — tracked).
- Path traversal on static serving: normalized path must stay under `web/` (403).

## 6. Transport & headers

- ✅ `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, `Permissions-Policy`, CSP on HTML, HSTS in production.
- TLS terminates at the ingress (`k8s/ryder.yaml` + cert-manager); internal
  traffic moves to mTLS at the service-split phase.
- `X-Forwarded-For`: only the first hop is trusted, and only because the LB is
  the sole ingress — document your LB's header-stripping behavior before relying
  on IP limits.

## 7. Platform hardening

- Container: non-root user, Alpine base, no npm deps in the server = **near-zero
  supply-chain surface** (the entire backend is stdlib).
- K8s: `runAsNonRoot`, resource limits, liveness/readiness separation, preStop
  drain; recommend NetworkPolicy default-deny + PodSecurity `restricted`.
- CI: syntax gate + full smoke (auth, RBAC, idempotency, lifecycle) + latency
  budget probe + container boot test on every push.

## 8. Money & payments

- **Ledger invariants**: every mutation goes through `ledger()` — computes
  `balance_after`, appends, never updates past rows. Rider charge and driver
  earning are written in the same completion path.
- **Idempotency**: `Idempotency-Key` on booking & topup replays the stored
  response — a double-tap or retry storm cannot double-charge (CI-asserted).
- **PCI scope**: card/UPI data never touches Ryder servers — PSP-hosted
  checkout + webhook credit keeps us in SAQ-A. Webhooks must be
  signature-verified + idempotent by `payment_id` (marked in `routes.js`).
- Reconciliation: daily job diffs PSP settlement files vs ledger (OPERATIONS §6).

## 9. Privacy & compliance (India)

- **DPDP Act**: purpose-limited collection (phone, name, trip locations);
  consent at signup; data-principal rights = export + delete endpoints (delete
  anonymizes user row, retains ledger for statutory 7-year books).
- **Location retention**: raw GPS 30 days → aggregate; trip start/end retained
  with the ride record.
- **Number masking**: rider↔driver calls via Twilio Proxy (planned; the call
  buttons are already stubbed for it) — personal numbers never exchanged.
- **GST**: 5% computed and itemized per fare; invoice generation job planned.
- **SOS data**: location shared with the safety desk on explicit user action only.

## 10. Fraud signals (risk service backlog, ordered by ROI)

1. OTP/SMS pumping — ✅ shipped (rate limits kill the economics)
2. Promo multi-accounting — device fingerprint + payment-instrument dedupe
3. GPS spoofing (fake trips for incentives) — speed/teleport sanity on pings,
   route-shape vs road-network checks
4. Rider–driver collusion (cash-loop incentives) — repeated-pair graph analysis
5. Stolen-wallet drain — velocity limits (topup cap ✅), device change step-up

## 11. Incident response

Severity ladder, on-call, and the security-incident runbook (token compromise →
rotate secret dual-accept → force re-login) live in [OPERATIONS.md](OPERATIONS.md) §7.
