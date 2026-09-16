// scripts/smoke.js — end-to-end smoke test used by CI and pre-deploy gates.
// Boots a fresh server on a scratch port + scratch DB, then exercises the full
// business loop: OTP login → estimate → book (idempotent) → bot driver accepts
// → drives → OTP start → complete → wallet charged → rating → admin metrics.
// Exit 0 = healthy build. Any assertion failure = exit 1.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PORT = 4599;
const BASE = `http://127.0.0.1:${PORT}`;
const scratch = mkdtempSync(path.join(tmpdir(), 'ryder-smoke-'));

const child = spawn(process.execPath, ['server/index.js'], {
  env: {
    ...process.env,
    PORT: String(PORT),
    RYDR_TIME_SCALE: '120',          // bots drive fast so the loop finishes in seconds
    RYDER_DATA_DIR: scratch,         // isolated DB
    LOG_LEVEL: 'warn',
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let TOKEN = null;

async function api(method, p, body, headers = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function assert(cond, label) {
  if (!cond) { console.error(`✗ FAIL: ${label}`); throw new Error('assertion failed: ' + label); }
  console.log(`✓ ${label}`);
}

function cleanup(code) {
  try { child.kill(); } catch {}
  setTimeout(() => { try { rmSync(scratch, { recursive: true, force: true }); } catch {} ; process.exit(code); }, 500);
}

try {
  // wait for readiness
  let up = false;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try { const r = await fetch(BASE + '/ready'); if (r.ok) { up = true; break; } } catch {}
  }
  assert(up, 'server becomes ready');

  // auth
  const otp = await api('POST', '/api/auth/otp', { phone: '+919876599999' });
  assert(otp.status === 200 && otp.data.demo_otp, 'OTP issued');
  const ver = await api('POST', '/api/auth/verify', { phone: '+919876599999', otp: otp.data.demo_otp, name: 'Smoke Rider' });
  assert(ver.status === 200 && ver.data.token, 'OTP verify → token');
  TOKEN = ver.data.token;

  // wrong OTP is refused
  const badv = await api('POST', '/api/auth/verify', { phone: '+919876599999', otp: '000000' });
  assert(badv.status === 400, 'wrong OTP refused');

  // estimate with full breakdown
  const est = await api('POST', '/api/fares/estimate', {
    pickup: { lat: 12.9116, lng: 77.6474 }, drop: { lat: 12.9968, lng: 77.6966 },
  });
  const auto = est.data.options?.find(o => o.category === 'auto');
  assert(est.status === 200 && auto?.fare > 0 && auto.breakdown.gst > 0, `city estimate w/ breakdown (auto ₹${auto?.fare})`);

  // rentals + outstation engines
  const rent = await api('GET', '/api/fares/rentals');
  assert(rent.status === 200 && rent.data.options.length > 0, 'rental pricing');
  const outst = await api('POST', '/api/fares/outstation', {
    pickup: { lat: 12.9116, lng: 77.6474 }, drop: { lat: 12.2958, lng: 76.6394 }, trip_type: 'round',
  });
  assert(outst.status === 200 && outst.data.options[0].breakdown.driver_allowance > 0, 'outstation pricing');

  // book with idempotency — same key twice must not double-book
  const key = 'smoke-' + Date.now();
  const book1 = await api('POST', '/api/rides', {
    pickup: { lat: 12.9116, lng: 77.6474, name: 'HSR' },
    drop: { lat: 12.9968, lng: 77.6966, name: 'Phoenix' },
    category: 'auto', promo_code: 'FIRST50',
  }, { 'Idempotency-Key': key });
  assert(book1.status === 200 && book1.data.id, `ride booked ${book1.data.id} @ ₹${book1.data.fare_quoted}`);
  assert(book1.data.promo_discount > 0, 'promo applied');
  const book2 = await api('POST', '/api/rides', { pickup: {}, drop: {}, category: 'auto' }, { 'Idempotency-Key': key });
  assert(book2.status === 200 && book2.data.id === book1.data.id, 'idempotent retry returns same ride');

  // lifecycle to completion (bot fleet)
  let ride = null;
  for (let i = 0; i < 120; i++) {
    await sleep(1000);
    const r = await api('GET', '/api/rides/' + book1.data.id);
    ride = r.data;
    if (ride.status === 'COMPLETED') break;
    if (['CANCELLED', 'EXPIRED'].includes(ride.status)) assert(false, `ride ended ${ride.status}`);
  }
  assert(ride.status === 'COMPLETED', `ride completed (fare_final ₹${ride.fare_final})`);

  // wallet charged exactly the final fare
  const w = await api('GET', '/api/wallet');
  const charge = w.data.transactions.find(t => t.type === 'ride_charge');
  assert(charge && Math.abs(charge.amount) === ride.fare_final, 'wallet charged final fare');

  // rating
  const rate = await api('POST', `/api/rides/${ride.id}/rate`, { stars: 5, tags: ['smooth'] });
  assert(rate.status === 200, 'rating recorded');

  // unauthorized access is refused
  const savedToken = TOKEN; TOKEN = 'bogus.token';
  const noAuth = await api('GET', '/api/wallet');
  assert(noAuth.status === 401, 'bogus token refused');
  TOKEN = savedToken;

  // rider cannot hit admin
  const notAdmin = await api('GET', '/api/admin/overview');
  assert(notAdmin.status === 403, 'RBAC: rider blocked from admin API');

  // ops endpoints
  const health = await fetch(BASE + '/health'); assert(health.ok, '/health ok');
  const metrics = await (await fetch(BASE + '/metrics')).text();
  assert(metrics.includes('ryder_http_requests_total') && metrics.includes('ride_completed'), '/metrics exposes counters');

  console.log('\n✅ SMOKE PASSED — full ride lifecycle + security assertions green');
  cleanup(0);
} catch (e) {
  console.error('✗ smoke crashed:', e);
  cleanup(1);
}
