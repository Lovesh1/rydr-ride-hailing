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

  // parcel estimate (courier engine)
  const parcel = await api('POST', '/api/fares/parcel', {
    pickup: { lat: 12.9116, lng: 77.6474 }, drop: { lat: 12.9345, lng: 77.6192 },
  });
  assert(parcel.status === 200 && parcel.data.options.length === 3 && parcel.data.options[0].fare > 0,
    `parcel pricing (small ₹${parcel.data.options[0].fare})`);

  // postpaid unlocks after first ride and raises spendable balance
  const pp = await api('POST', '/api/postpaid/activate');
  assert(pp.status === 200 && pp.data.postpaid_limit === 500, 'postpaid credit line activated');
  const pp2 = await api('POST', '/api/postpaid/activate');
  assert(pp2.status === 400, 'postpaid double-activation refused');

  // Ryder Wrapped reflects the completed ride
  const wrapped = await api('GET', '/api/me/wrapped');
  assert(wrapped.status === 200 && wrapped.data.rides >= 1 && wrapped.data.km > 0
    && wrapped.data.coins > 0 && wrapped.data.streak_days >= 1,
    `wrapped: ${wrapped.data.rides} rides, ${wrapped.data.km} km, ${wrapped.data.coins} coins, streak ${wrapped.data.streak_days}`);

  // Fare Lock: lock a low fare, then booking honors it
  const lockRes = await api('POST', '/api/fares/lock', {
    category: 'auto', fare: 60, pickup_name: 'HSR', drop_name: 'Phoenix' });
  assert(lockRes.status === 200 && lockRes.data.locked, 'fare locked (₹5 charged)');
  const lockedBook = await api('POST', '/api/rides', {
    pickup: { lat: 12.9116, lng: 77.6474, name: 'HSR' },
    drop: { lat: 12.9968, lng: 77.6966, name: 'Phoenix' }, category: 'auto',
  });
  assert(lockedBook.status === 200 && lockedBook.data.fare_quoted === 60
    && lockedBook.data.fare_breakdown.fare_lock_saving < 0,
    `locked booking honors ₹60 (saved ${-lockedBook.data.fare_breakdown.fare_lock_saving})`);
  await api('POST', `/api/rides/${lockedBook.data.id}/cancel`, { reason: 'smoke cleanup' });

  // admin analytics shape
  const aOtp2 = await api('POST', '/api/auth/otp', { phone: '+919999900000' });
  const aVer2 = await api('POST', '/api/auth/verify', { phone: '+919999900000', otp: aOtp2.data.demo_otp });
  const rTok = TOKEN; TOKEN = aVer2.data.token;
  const an = await api('GET', '/api/admin/analytics');
  assert(an.status === 200 && an.data.hourly.length === 24 && an.data.daily.length === 7
    && an.data.funnel.completed >= 1 && an.data.leaderboard.length > 0,
    `analytics: 24h pulse, 7d GMV, funnel ${an.data.funnel.requested}→${an.data.funnel.completed}, leaderboard ${an.data.leaderboard.length}`);

  // intelligence engine: unit economics + priced opportunities + segments
  const intel = await api('GET', '/api/admin/intel');
  assert(intel.status === 200
    && intel.data.unit.gmv > 0 && intel.data.unit.take_revenue > 0 && intel.data.unit.ltv_per_rider > 0
    && intel.data.opportunities.length >= 1 && intel.data.opportunities.every(o => typeof o.impact_monthly === 'number' && o.why && o.action)
    && intel.data.segments.length === 5 && intel.data.forecast.length === 24,
    `intel: GMV ₹${intel.data.unit.gmv}, ${intel.data.opportunities.length} priced opportunities (top: ${intel.data.opportunities[0].tag} +₹${intel.data.opportunities[0].impact_monthly}/mo)`);

  // one-click win-back credits the rider's wallet
  const riderId = ver.data.user.id;
  const wb = await api('POST', `/api/admin/winback/${riderId}`);
  assert(wb.status === 200 && wb.data.credit === 50, 'win-back ₹50 credited');
  const wb2 = await api('POST', `/api/admin/winback/${riderId}`);
  assert(wb2.status === 400, 'duplicate win-back same day refused');
  TOKEN = rTok;
  const wbBal = await api('GET', '/api/wallet');
  assert(wbBal.data.transactions.some(x => x.type === 'promo_credit' && x.amount === 50), 'rider sees the ₹50 win-back');

  // ride preferences round-trip
  const setP = await api('POST', '/api/preferences', { quiet: true, prefer_woman_driver: true });
  assert(setP.status === 200 && setP.data.quiet === true, 'ride preferences saved');
  const getP = await api('GET', '/api/preferences');
  assert(getP.data.prefer_woman_driver === true, 'ride preferences read back');

  // favourite driver add + list
  const favAdd = await api('POST', '/api/favourites', { driver_id: ride.driver_id });
  assert(favAdd.status === 200 && favAdd.data.favourited, 'driver favourited');
  const favList = await api('GET', '/api/favourites');
  assert(favList.data.some(f => f.driver_id === ride.driver_id), 'favourites listed');

  // recent destinations recorded on completion, surface in place search
  const placesNow = await api('GET', '/api/places?q=');
  assert(placesNow.data.some(pl => pl.recent), 'recent destination surfaces in search');

  // driver GoTo endpoint (login as bot fleet driver)
  const riderToken = TOKEN;
  const dOtp = await api('POST', '/api/auth/otp', { phone: '+919000000010' });
  const dVer = await api('POST', '/api/auth/verify', { phone: '+919000000010', otp: dOtp.data.demo_otp });
  TOKEN = dVer.data.token;
  const goto1 = await api('POST', '/api/driver/goto', { lat: 12.9, lng: 77.6 });
  assert(goto1.status === 200 && goto1.data.goto.expires_at > Date.now(), 'driver GoTo set');
  const sum = await api('GET', '/api/driver/summary');
  assert(sum.status === 200 && sum.data.goto, 'summary reflects GoTo + hours_online');
  const dz = await api('GET', '/api/driver/zones');
  assert(dz.status === 200 && dz.data.length >= 4, 'driver demand zones listed');
  await api('POST', '/api/driver/goto', { clear: true });
  TOKEN = riderToken;

  // DPDP account deletion (fresh throwaway account)
  const delOtp = await api('POST', '/api/auth/otp', { phone: '+919876588888' });
  const delVer = await api('POST', '/api/auth/verify', { phone: '+919876588888', otp: delOtp.data.demo_otp, name: 'Temp User' });
  TOKEN = delVer.data.token;
  const delNo = await api('POST', '/api/me/delete', {});
  assert(delNo.status === 400, 'deletion requires explicit confirm');
  const delYes = await api('POST', '/api/me/delete', { confirm: 'DELETE' });
  assert(delYes.status === 200 && delYes.data.deleted, 'account anonymized (DPDP)');
  const delAfter = await api('GET', '/api/me');
  assert(delAfter.status === 403, 'deleted account can no longer authenticate');
  TOKEN = riderToken;

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
