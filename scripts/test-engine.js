// scripts/test-engine.js — asserts the embedded browser engine (the free
// GitHub Pages runtime) runs the full ride loop, standalone in Node.
import '../app-mobile/src/engine.js';
const E = globalThis.RyderEngine;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let failures = 0;
const assert = (c, l) => { console.log((c ? '✓ ' : '✗ FAIL: ') + l); if (!c) failures++; };

const HSR = { name: 'HSR Layout, Sector 2', lat: 12.9116, lng: 77.6474 };
const PHX = { name: 'Phoenix Marketcity, Whitefield', lat: 12.9968, lng: 77.6966 };

(async () => {
  // rider auth
  const otp = await E.handle('POST', '/api/auth/otp', { phone: '+919876500123' });
  assert(otp.status === 200 && otp.data.demo_otp, 'engine: OTP issued');
  const ver = await E.handle('POST', '/api/auth/verify', { phone: '+919876500123', otp: otp.data.demo_otp, name: 'Engine Tester' });
  assert(ver.status === 200 && ver.data.token, 'engine: login');
  const tok = ver.data.token;

  // estimates
  const est = await E.handle('POST', '/api/fares/estimate', { pickup: HSR, drop: PHX }, tok);
  const auto = est.data.options?.find(o => o.category === 'auto');
  assert(auto?.fare > 0 && auto.breakdown.gst > 0, `engine: city estimate (auto ₹${auto?.fare})`);
  const rent = await E.handle('GET', '/api/fares/rentals', null, tok);
  assert(rent.data.options.length > 0, 'engine: rentals');
  const par = await E.handle('POST', '/api/fares/parcel', { pickup: HSR, drop: PHX }, tok);
  assert(par.data.options.length === 3, 'engine: parcel');

  // book + bot lifecycle
  const book = await E.handle('POST', '/api/rides',
    { pickup: HSR, drop: PHX, category: 'auto', promo_code: 'FIRST50' }, tok);
  assert(book.status === 200 && book.data.promo_discount > 0, `engine: booked ${book.data.id} @ ₹${book.data.fare_quoted}`);

  let r = null;
  for (let i = 0; i < 120; i++) {
    await sleep(1000);
    r = (await E.handle('GET', '/api/rides/' + book.data.id, null, tok)).data;
    if (r.status === 'COMPLETED') break;
    if (['CANCELLED', 'EXPIRED'].includes(r.status)) break;
  }
  assert(r?.status === 'COMPLETED', `engine: bot completed the ride (₹${r?.fare_final})`);

  const w = await E.handle('GET', '/api/wallet', null, tok);
  assert(w.data.transactions.some(t => t.type === 'ride_charge'), 'engine: wallet charged');
  const rate = await E.handle('POST', `/api/rides/${book.data.id}/rate`, { stars: 5 }, tok);
  assert(rate.status === 200, 'engine: rating');

  // admin
  const aOtp = await E.handle('POST', '/api/auth/otp', { phone: '+919999900000' });
  const aVer = await E.handle('POST', '/api/auth/verify', { phone: '+919999900000', otp: aOtp.data.demo_otp });
  const aTok = aVer.data.token;
  const ov = await E.handle('GET', '/api/admin/overview', null, aTok);
  assert(ov.status === 200 && ov.data.gmv_today >= r.fare_final, 'engine: admin overview reflects GMV');
  const zones = await E.handle('GET', '/api/admin/zones', null, aTok);
  const zs = await E.handle('POST', `/api/admin/zones/${zones.data[0].id}/surge`, { surge: 1.8 }, aTok);
  assert(zs.data.surge === 1.8, 'engine: surge dial');

  // rider is blocked from admin
  const rbac = await E.handle('GET', '/api/admin/overview', null, tok);
  assert(rbac.status === 403, 'engine: RBAC holds');

  console.log(failures === 0 ? '\n✅ ENGINE TEST PASSED' : `\n✗ ${failures} failures`);
  process.exit(failures === 0 ? 0 : 1);
})();
