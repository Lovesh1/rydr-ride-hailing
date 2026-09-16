# 🛰 Ryder — Operations Manual

Observability, alerting, runbooks, deploys, backups/DR, and on-call. Everything
marked ✅ exists in this repo and is exercised by CI.

---

## 1. Observability

### Metrics (✅ `/metrics`, Prometheus text format)
- `ryder_http_requests_total{route,status}` — traffic + error rates per route
- `ryder_http_request_duration_ms_bucket{route,le}` — latency histograms
  (buckets 5→2500 ms; route labels normalized to kill cardinality)
- `ryder_business_events_total{event}` — `otp_sent`, `otp_failed`, `login`,
  `ride_requested`, `ride_completed`, `topup`
- `ryder_process_rss_bytes`, `ryder_process_uptime_seconds`
- K8s pods carry `prometheus.io/scrape` annotations — zero-config scraping.

### Logs (✅ structured JSON, one line per event)
`{ts, level, msg, ...fields}` — ship stdout to Loki/CloudWatch. Notable events:
`ryder.server.started`, `auth.otp_sent` (phone truncated), `ride.completed`,
`scheduler.dispatched`, `http` (only slow/5xx at info level), `shutdown.*`.
`LOG_LEVEL=debug` turns on per-request logging.

### Probes (✅)
- `GET /health` — liveness (process up)
- `GET /ready` — readiness (DB answers; flips false during drain → LB removes pod)
- `GET /latency` — live per-route avg snapshot (used by the load tester)

### Dashboards to build (Grafana, panels map 1:1 to metrics above)
1. Traffic & errors: req/s by route, 4xx/5xx rate, 429 rate
2. Latency: p50/p95/p99 per route vs SLO lines
3. Business: rides requested vs completed (funnel gap = matching health),
   logins, topups, GMV/hr (from `ride_completed` × avg fare or ClickHouse)
4. Fleet: online drivers, offer-acceptance rate, avg pickup ETA
5. Saturation: RSS, event-loop lag (add `perf_hooks` monitor at Phase B), DB size

## 2. Alert rules (Prometheus expressions, severity mapped)

| Alert | Expression (5m windows) | Sev |
|---|---|---|
| API down | `up == 0` for 1m | P1 |
| Error surge | 5xx ratio > 1% | P1 |
| Latency SLO burn | p95 estimate route > 150ms for 10m | P2 |
| Matching failure | `ride_requested - ride_completed` gap growing & `EXPIRED` rides climbing | P1 |
| OTP failures spike | `otp_failed / otp_sent > 30%` | P2 (attack or SMS outage) |
| 429 flood | rate-limited > 20% of traffic | P3 (investigate source) |
| Disk (SQLite) | volume > 80% | P2 |
| Cert expiry | < 14 days | P3 |
| Backup stale | last CronJob success > 2h ago | P2 |

## 3. Runbooks

### RB-1 · Matching stalls (rides stuck SEARCHING → EXPIRED)
1. `GET /api/admin/overview` — online drivers > 0? If 0: bot fleet flag
   (`RYDER_BOT_FLEET`) / driver app outage / mass KYC suspension.
2. Check offer flow in logs; if offers emitted but never accepted → driver
   client push path down; if none emitted → dispatch tick died: restart pod
   (state machine is DB-backed; SEARCHING rides re-enter cascade on the next
   creation only — cancel stuck rides via admin, they auto-refund on cancel path).
3. Widen search: temporarily bump `SEARCH_RADIUS_KM` env and redeploy.

### RB-2 · Surge runaway (fares complaints spike)
1. Admin → Surge dial: check per-zone multipliers; anything ≥ 2.5× manual? Audit
   log names the admin (`action=set_surge`).
2. Reset zones to 1.0× (slider) — pricing changes take effect on the next
   estimate; no deploy needed. Hard cap is 3× in code.

### RB-3 · Payment/ledger mismatch
1. Never edit ledger rows. Compute expected: `SUM(amount)` per user must equal
   `users.wallet_balance` — the invariant query:
   `SELECT u.id FROM users u JOIN (SELECT user_id, SUM(amount) s FROM wallet_ledger GROUP BY user_id) l ON l.user_id=u.id WHERE ABS(l.s - u.wallet_balance) > 0.01;`
2. Discrepancy → append a correcting `refund`/`ride_charge` entry with a note
   referencing the incident ticket; both sides (rider & driver) if fare-related.
3. If PSP is live: diff settlement file vs ledger `topup` rows by `gateway_ref`.

### RB-4 · Database corruption / node loss
1. Latest hourly backup: `data/backups/ryder-<ts>.db` (VACUUM'd, consistent).
2. `RYDER_DATA_DIR` → point to restored file, start server, `/ready` green.
3. Loss window ≤ 1h (RPO); Phase B (Postgres streaming replica) takes RPO→~0.

### RB-5 · Token secret compromise
1. Rotate `RYDER_SECRET` (all sessions invalidate — by design under HMAC).
2. Users re-login via OTP; announce in-app. 3. Audit admin actions in window.

### RB-6 · SOS event
Ops console → Safety desk (alert badge is live via SSE). Call rider through
masked line; live position is on the ride record; escalate per city playbook;
resolve with notes. SOS events are never bulk-resolved.

## 4. Release engineering

- ✅ CI on every push: syntax gate → **full-lifecycle smoke test** (auth, RBAC,
  idempotent booking, bot-driven completion, wallet assert, metrics) → latency
  probe → RN web export → Docker build + boot check.
- Deploy: build image → roll StatefulSet; readiness gate + preStop drain give
  zero-dropped-request rolls (verified pattern: `/ready` flips before SIGTERM).
- Rollback = redeploy previous tag; DB schema changes must be
  backwards-compatible one version (expand → migrate → contract).
- Error-budget policy: p95 burn or 5xx budget spent 25% in a week → only fixes
  ship until burn normalizes.

## 5. Scheduled jobs

| Job | Cadence | Where |
|---|---|---|
| Scheduled-ride dispatcher | 15 s tick | ✅ in-process (`index.js`) |
| Idempotency-key prune (>24h) | boot + daily | ✅ `db.js` / cron |
| Hot backup (VACUUM INTO) | hourly | ✅ `scripts/backup.js` · compose sidecar · k8s CronJob |
| Ledger invariant check (RB-3 query) | hourly | add to CronJob, alert on rows>0 |
| KYC document expiry scan | daily | Phase B |
| PSP reconciliation | daily 06:00 | when PSP lands |

## 6. Backup & DR

- ✅ Hourly consistent snapshots via `VACUUM INTO` (safe under WAL while serving).
- Ship snapshots off-node (object storage + 30-day lifecycle) — sidecar/CronJob
  already produce the files; add the upload step for your cloud.
- **RPO 1 h / RTO < 15 min** today → **RPO ≈ 0 / RTO < 5 min** at Phase B
  (Postgres HA + WAL shipping). Ledger is the RPO-0 priority stream.
- Quarterly restore drill: restore latest snapshot to a scratch env, run
  `npm test` against it, record time-to-green.

## 7. On-call & incidents

- Sev ladder: **P1** users cannot book / money wrong / data breach (page, 15 min
  ack) · **P2** degraded SLO (page in hours) · **P3** annoyance (next business day).
- Roles: incident commander + comms + operator; timeline doc from first page.
- Postmortems blameless, within 5 working days, action items tracked to close.
- Weekly ops review: SLO dashboards, error-budget spend, alert noise triage.

## 8. Local ops cheat-sheet

```bash
npm start                                  # run server
npm test                                   # full smoke (isolated port + scratch DB)
npm run loadtest -- --conns 50 --secs 10   # latency/throughput report
npm run backup                             # consistent snapshot now
docker compose up --build                  # prod-like stack + hourly backup sidecar
kubectl apply -f k8s/ryder.yaml            # full k8s deploy (edit secret first)
curl localhost:4321/metrics                # prometheus scrape
LOG_LEVEL=debug npm start                  # per-request logs
```
