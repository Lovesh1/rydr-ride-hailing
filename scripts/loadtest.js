// scripts/loadtest.js — zero-dependency HTTP load generator with real percentiles.
// Measures the hot read/compute paths a rider hammers: fare estimates (geo math +
// SQL surge lookup + full pricing), place search, profile reads, ride history.
//
//   node scripts/loadtest.js [--url http://localhost:4321] [--conns 50] [--secs 10]
//
// Prints RPS + p50/p90/p95/p99/max per endpoint and overall, plus error counts.
// CI budget (see docs/PRODUCTION.md §3): p95 < 100ms at 50 conns on a dev laptop.

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) =>
  a.startsWith('--') ? [a.slice(2), all[i + 1]] : []).filter(x => x.length));
const BASE = args.url || 'http://localhost:4321';
const CONNS = Number(args.conns || 50);
const SECS = Number(args.secs || 10);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function login() {
  const phone = '+9198999' + String(10000 + Math.floor(Math.random() * 89999));
  const o = await fetch(BASE + '/api/auth/otp', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  }).then(r => r.json());
  const v = await fetch(BASE + '/api/auth/verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, otp: o.demo_otp, name: 'Load ' + phone.slice(-4) }),
  }).then(r => r.json());
  return v.token;
}

const SCENARIOS = [
  { name: 'estimate', weight: 5, fn: (t) => fetch(BASE + '/api/fares/estimate', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
      body: JSON.stringify({
        pickup: { lat: 12.9116 + Math.random() * 0.05, lng: 77.6474 + Math.random() * 0.05 },
        drop: { lat: 12.9968, lng: 77.6966 },
      }) }) },
  { name: 'places', weight: 2, fn: (t) => fetch(BASE + '/api/places?q=ko', { headers: { Authorization: 'Bearer ' + t } }) },
  { name: 'me', weight: 2, fn: (t) => fetch(BASE + '/api/me', { headers: { Authorization: 'Bearer ' + t } }) },
  { name: 'history', weight: 1, fn: (t) => fetch(BASE + '/api/rides', { headers: { Authorization: 'Bearer ' + t } }) },
];
const deck = SCENARIOS.flatMap(s => Array(s.weight).fill(s));

const lat = Object.fromEntries(SCENARIOS.map(s => [s.name, []]));
let errors = 0, rateLimited = 0, total = 0;

async function worker(token, stopAt) {
  while (Date.now() < stopAt) {
    const s = deck[Math.floor(Math.random() * deck.length)];
    const t0 = process.hrtime.bigint();
    try {
      const res = await s.fn(token);
      await res.arrayBuffer();
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      if (res.status === 429) rateLimited++;
      else if (!res.ok) errors++;
      else { lat[s.name].push(ms); total++; }
    } catch { errors++; }
  }
}

function pct(arr, p) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(p / 100 * a.length))];
}

(async () => {
  console.log(`ryder loadtest → ${BASE} · ${CONNS} connections · ${SECS}s`);
  process.stdout.write('logging in workers… ');
  const tokens = [];
  for (let i = 0; i < CONNS; i++) {
    tokens.push(await login());
    if (i % 10 === 9) process.stdout.write(`${i + 1} `);
    await sleep(25); // stay under the auth rate limit while provisioning
  }
  console.log('done. firing.');

  const stopAt = Date.now() + SECS * 1000;
  const t0 = Date.now();
  await Promise.all(tokens.map(t => worker(t, stopAt)));
  const wall = (Date.now() - t0) / 1000;

  const all = Object.values(lat).flat();
  const row = (name, a) => console.log(
    `${name.padEnd(10)} n=${String(a.length).padEnd(7)} p50=${pct(a, 50).toFixed(1).padStart(7)}ms  p90=${pct(a, 90).toFixed(1).padStart(7)}ms  p95=${pct(a, 95).toFixed(1).padStart(7)}ms  p99=${pct(a, 99).toFixed(1).padStart(7)}ms  max=${Math.max(0, ...a).toFixed(1).padStart(8)}ms`);

  console.log('\n================ RESULTS ================');
  for (const s of SCENARIOS) row(s.name, lat[s.name]);
  row('OVERALL', all);
  console.log(`\nthroughput : ${(total / wall).toFixed(0)} req/s sustained over ${wall.toFixed(1)}s`);
  console.log(`errors     : ${errors} · rate-limited: ${rateLimited}`);
  const p95 = pct(all, 95);
  console.log(p95 < 100 ? `\n✅ within SLO budget (p95 ${p95.toFixed(1)}ms < 100ms)` : `\n⚠ p95 ${p95.toFixed(1)}ms exceeds 100ms budget`);
})();
