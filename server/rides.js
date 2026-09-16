// server/rides.js — ride state machine, driver matching cascade, wallet ledger
// Supports city rides (with stops), hourly rentals, outstation, and scheduled dispatch.
import { db } from './db.js';
import { uid, now, otp4, haversineKm, rupees, round2 } from './lib.js';
import {
  cityFare, routeMetrics, surgeAt, applyPromo, isNight, isPrime,
  RATE_CARD, RENTAL_PACKAGES, RENTAL_RATES, OUTSTATION_RATES,
  estimateOutstation, estimateParcel,
} from './pricing.js';
import { emitTo, emitAdmins } from './events.js';
import { inc } from './metrics.js';
import { log } from './logger.js';

const OFFER_TIMEOUT_MS = 15000;
const MAX_WAVES = 3;
const SEARCH_RADIUS_KM = [3, 6, 10];
const TAKE_RATE = 0.22;

/** in-memory offer state: rideId -> { driverId, timer, wave, tried:Set } */
const offers = new Map();

/** hook so the bot simulator can react to offers without circular imports */
let offerHook = null;
export function setOfferHook(fn) { offerHook = fn; }

/* ============ wallet ============ */
export function ledger(userId, type, amount, note, rideId = null) {
  const u = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(userId);
  const bal = Math.round((u.wallet_balance + amount) * 100) / 100;
  db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(bal, userId);
  db.prepare('INSERT INTO wallet_ledger (id,user_id,ride_id,type,amount,balance_after,note,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(uid('tx'), userId, rideId, type, amount, bal, note, now());
  return bal;
}

/* ============ ride views ============ */
export function rideView(rideId) {
  const r = db.prepare(`
    SELECT r.*, ru.name AS rider_name, ru.rating AS rider_rating,
           du.name AS driver_name, du.rating AS driver_rating,
           d.vehicle_make, d.plate, d.lat AS driver_lat, d.lng AS driver_lng, d.category AS driver_cat
    FROM rides r
    JOIN users ru ON ru.id = r.rider_id
    LEFT JOIN users du ON du.id = r.driver_id
    LEFT JOIN drivers d ON d.user_id = r.driver_id
    WHERE r.id = ?`).get(rideId);
  if (r) {
    try { r.fare_breakdown = JSON.parse(r.fare_breakdown || 'null'); } catch {}
    try { r.stops = JSON.parse(r.stops || '[]'); } catch {}
    try { r.parcel_details = JSON.parse(r.parcel_details || 'null'); } catch {}
  }
  return r;
}

function pushRide(rideId, extra = {}) {
  const v = rideView(rideId);
  if (!v) return;
  emitTo(v.rider_id, 'ride', { ...v, ...extra });
  if (v.driver_id) emitTo(v.driver_id, 'ride', { ...v, ...extra });
  emitAdmins('ride', { ...v, ...extra });
}

/* ============ quoting ============ */
function quoteFor(riderId, body) {
  const type = body.type || 'city';
  const prime = isPrime(riderId);

  if (type === 'rental') {
    const pkg = RENTAL_PACKAGES.find(p => p.id === body.package_id);
    const rate = RENTAL_RATES[body.category];
    if (!pkg || !rate) throw new Error('unknown rental package/category');
    let price = rate.perHour * pkg.hours;
    const primeDiscount = prime ? round2(price * 0.10) : 0;
    price -= primeDiscount;
    const gst = round2(price * 0.05);
    return {
      fare: rupees(price + gst), surge: 1, distKm: pkg.km, durMin: pkg.hours * 60,
      breakdown: { package_price: rate.perHour * pkg.hours, prime_discount: -primeDiscount,
        extra_km_rate: rate.extraKm, extra_min_rate: rate.extraMin, gst },
    };
  }

  if (type === 'parcel') {
    const est = estimateParcel([body.pickup, body.drop], riderId);
    const opt = est.options.find(o => o.size === (body.parcel_size || 'small'));
    if (!opt) throw new Error('unknown parcel size');
    return { fare: opt.fare, surge: 1, distKm: est.distKm, durMin: est.durMin, breakdown: opt.breakdown };
  }

  if (type === 'outstation') {
    const est = estimateOutstation(
      [body.pickup, ...(body.stops || []), body.drop], body.trip_type || 'oneway', riderId);
    const opt = est.options.find(o => o.category === body.category);
    if (!opt) throw new Error('category not available for outstation');
    return { fare: opt.fare, surge: 1, distKm: est.oneWayKm, durMin: est.durMin, breakdown: opt.breakdown };
  }

  // city — body._route carries a real routing-provider result when available
  const points = [body.pickup, ...(body.stops || []), body.drop];
  const { distKm, durMin } = body._route || routeMetrics(points);
  const { surge } = surgeAt(body.pickup.lat, body.pickup.lng);
  const f = cityFare(body.category, distKm, durMin, { surge, night: isNight(), prime });
  if (!f) throw new Error('unknown category');
  // Fare Lock honored: ride at the locked amount even if surge moved since
  if (body._locked_fare && body._locked_fare < f.total) {
    f.breakdown.fare_lock_saving = -(f.total - Math.round(body._locked_fare));
    return { fare: Math.round(body._locked_fare), surge, distKm, durMin, breakdown: f.breakdown };
  }
  return { fare: f.total, surge, distKm, durMin, breakdown: f.breakdown };
}

/* ============ create + match ============ */
export function createRide(riderId, body) {
  const { pickup, drop, category, promo_code, payment_method, scheduled_at } = body;
  const q = quoteFor(riderId, body);

  const { discount, error } = applyPromo(promo_code, riderId, q.fare);
  if (error && promo_code) throw new Error(error);

  const isScheduled = scheduled_at && scheduled_at > now() + 60000;
  const id = uid('R');
  // parcels ride on the bike fleet regardless of requested "category"
  const cat = body.type === 'parcel' ? 'bike' : category;
  db.prepare(`INSERT INTO rides (id,rider_id,category,type,trip_type,package_id,status,
      pickup_lat,pickup_lng,pickup_addr,drop_lat,drop_lng,drop_addr,stops,otp,
      distance_km,duration_min,fare_quoted,fare_breakdown,surge,
      promo_code,promo_discount,payment_method,
      guest_name,guest_phone,is_corporate,expense_code,parcel_details,
      scheduled_at,requested_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, riderId, cat, body.type || 'city', body.trip_type || null, body.package_id || null,
    isScheduled ? 'SCHEDULED' : 'SEARCHING',
    pickup.lat, pickup.lng, pickup.name || 'Pickup',
    drop?.lat ?? pickup.lat, drop?.lng ?? pickup.lng, drop?.name || (body.type === 'rental' ? 'As directed (rental)' : 'Drop'),
    JSON.stringify(body.stops || []), otp4(),
    q.distKm, q.durMin, q.fare - discount, JSON.stringify(q.breakdown), q.surge,
    promo_code ? promo_code.toUpperCase() : null, discount,
    payment_method || 'wallet',
    body.guest_name || null, body.guest_phone || null,
    body.is_corporate ? 1 : 0, body.expense_code || null,
    body.parcel ? JSON.stringify(body.parcel) : null,
    isScheduled ? scheduled_at : null, now());

  if (!isScheduled) {
    offers.set(id, { driverId: null, timer: null, wave: 0, tried: new Set() });
    pushRide(id);
    nextOffer(id);
  } else {
    pushRide(id);
  }
  return rideView(id);
}

/** scheduler tick: dispatch scheduled rides whose time has come (T-2min) */
export function dispatchDueScheduled() {
  const due = db.prepare(
    "SELECT id FROM rides WHERE status = 'SCHEDULED' AND scheduled_at <= ?").all(now() + 120000);
  for (const { id } of due) {
    db.prepare("UPDATE rides SET status = 'SEARCHING' WHERE id = ?").run(id);
    offers.set(id, { driverId: null, timer: null, wave: 0, tried: new Set() });
    pushRide(id);
    nextOffer(id);
  }
  return due.length;
}

/** rentals & outstation dispatch to mini/prime/suv/ev pools; city matches its own category */
function matchCategory(ride) { return ride.category; }

function candidates(ride, tried, radiusKm) {
  const rows = db.prepare(`
    SELECT d.user_id, d.lat, d.lng, d.goto_lat, d.goto_lng, d.goto_expires_at, u.gender
    FROM drivers d
    JOIN users u ON u.id = d.user_id
    WHERE d.is_online = 1 AND d.kyc_status = 'verified' AND d.current_ride_id IS NULL
      AND d.category = ? AND u.status = 'active'`).all(matchCategory(ride));
  const t = now();

  // rider-side signals: preferences + favourite drivers
  let prefs = {};
  try {
    prefs = JSON.parse(db.prepare('SELECT ride_prefs FROM users WHERE id = ?').get(ride.rider_id)?.ride_prefs || '{}');
  } catch {}
  const favs = new Set(
    db.prepare('SELECT driver_id FROM favourite_drivers WHERE user_id = ?').all(ride.rider_id).map(r => r.driver_id));

  const scored = rows
    .map(d => {
      const dist = haversineKm(ride.pickup_lat, ride.pickup_lng, d.lat, d.lng);
      let score = dist;
      // GoTo mode: drops near the driver's active pin rank as 3 km closer
      if (d.goto_lat != null && (d.goto_expires_at || 0) > t) {
        const dropToGoto = haversineKm(ride.drop_lat, ride.drop_lng, d.goto_lat, d.goto_lng);
        if (dropToGoto <= 4) score = Math.max(0, score - 3);
      }
      // a favourited driver ranks as 2 km closer
      if (favs.has(d.user_id)) score = Math.max(0, score - 2);
      return { ...d, dist, score };
    })
    .filter(d => d.dist <= radiusKm && !tried.has(d.user_id))
    .sort((a, b) => a.score - b.score);

  // woman-driver preference: soft filter — if any woman partner is in range,
  // offer only to women this wave; otherwise fall through to the full pool.
  if (prefs.prefer_woman_driver) {
    const women = scored.filter(d => d.gender === 'female');
    if (women.length) return women;
  }
  return scored;
}

function nextOffer(rideId) {
  const st = offers.get(rideId);
  if (!st) return;
  const ride = db.prepare('SELECT * FROM rides WHERE id = ?').get(rideId);
  if (!ride || ride.status !== 'SEARCHING') return;

  const radius = SEARCH_RADIUS_KM[Math.min(st.wave, SEARCH_RADIUS_KM.length - 1)];
  const cands = candidates(ride, st.tried, radius);

  if (cands.length === 0) {
    st.wave++;
    if (st.wave >= MAX_WAVES) {
      db.prepare("UPDATE rides SET status = 'EXPIRED' WHERE id = ?").run(rideId);
      offers.delete(rideId);
      pushRide(rideId, { reason: 'no drivers available' });
      return;
    }
    st.timer = setTimeout(() => nextOffer(rideId), 2000);
    return;
  }

  const drv = cands[0];
  st.driverId = drv.user_id;
  st.tried.add(drv.user_id);
  db.prepare('UPDATE drivers SET acceptance_offered = acceptance_offered + 1 WHERE user_id = ?').run(drv.user_id);

  const view = rideView(rideId);
  let riderPrefs = {};
  try { riderPrefs = JSON.parse(db.prepare('SELECT ride_prefs FROM users WHERE id = ?').get(ride.rider_id)?.ride_prefs || '{}'); } catch {}
  emitTo(drv.user_id, 'offer', {
    ride: view,
    rider_prefs: riderPrefs,
    pickup_dist_km: Math.round(drv.dist * 100) / 100,
    expires_in_ms: OFFER_TIMEOUT_MS,
  });
  emitAdmins('offer', { ride_id: rideId, driver_id: drv.user_id });
  if (offerHook) offerHook(rideId, drv.user_id);

  st.timer = setTimeout(() => {
    if (offers.get(rideId)?.driverId === drv.user_id) {
      emitTo(drv.user_id, 'offer_closed', { ride_id: rideId });
      st.driverId = null;
      nextOffer(rideId);
    }
  }, OFFER_TIMEOUT_MS);
}

export function pendingOfferFor(driverId) {
  for (const [rideId, st] of offers) {
    if (st.driverId === driverId) {
      const ride = db.prepare('SELECT * FROM rides WHERE id = ?').get(rideId);
      if (ride?.status === 'SEARCHING') return rideView(rideId);
    }
  }
  return null;
}

/* ============ transitions ============ */
export function acceptRide(rideId, driverId) {
  const st = offers.get(rideId);
  if (!st || st.driverId !== driverId) throw new Error('offer not available');
  const ride = db.prepare('SELECT * FROM rides WHERE id = ?').get(rideId);
  if (ride.status !== 'SEARCHING') throw new Error('ride no longer searching');

  clearTimeout(st.timer);
  offers.delete(rideId);
  db.prepare("UPDATE rides SET status = 'ACCEPTED', driver_id = ?, accepted_at = ? WHERE id = ?")
    .run(driverId, now(), rideId);
  db.prepare('UPDATE drivers SET current_ride_id = ?, acceptance_accepted = acceptance_accepted + 1 WHERE user_id = ?')
    .run(rideId, driverId);
  pushRide(rideId);
  return rideView(rideId);
}

export function declineRide(rideId, driverId) {
  const st = offers.get(rideId);
  if (!st || st.driverId !== driverId) return;
  clearTimeout(st.timer);
  st.driverId = null;
  nextOffer(rideId);
}

export function markArrived(rideId, driverId) {
  const r = db.prepare('SELECT * FROM rides WHERE id = ? AND driver_id = ?').get(rideId, driverId);
  if (!r || r.status !== 'ACCEPTED') throw new Error('bad state');
  db.prepare("UPDATE rides SET status = 'ARRIVED', arrived_at = ? WHERE id = ?").run(now(), rideId);
  pushRide(rideId);
  return rideView(rideId);
}

export function startRide(rideId, driverId, otp) {
  const r = db.prepare('SELECT * FROM rides WHERE id = ? AND driver_id = ?').get(rideId, driverId);
  if (!r || !['ACCEPTED', 'ARRIVED'].includes(r.status)) throw new Error('bad state');
  if (String(otp) !== r.otp) throw new Error('incorrect OTP');
  // waiting charge clock: time between arrival and start
  const waitingMin = r.arrived_at ? round2((now() - r.arrived_at) / 60000) : 0;
  db.prepare("UPDATE rides SET status = 'ONGOING', started_at = ?, waiting_min = ? WHERE id = ?")
    .run(now(), waitingMin, rideId);
  pushRide(rideId);
  return rideView(rideId);
}

export function completeRide(rideId, driverId) {
  const r = db.prepare('SELECT * FROM rides WHERE id = ? AND driver_id = ?').get(rideId, driverId);
  if (!r || r.status !== 'ONGOING') throw new Error('bad state');

  // Recompute the final fare including any accrued waiting charge (city rides only).
  let fare = rupees(r.fare_quoted);
  let breakdown = null;
  try { breakdown = JSON.parse(r.fare_breakdown || 'null'); } catch {}
  if (r.type === 'city' && r.waiting_min > 5 && RATE_CARD[r.category]) {
    const extra = rupees(Math.max(0, r.waiting_min - 5) * RATE_CARD[r.category].waitPerMin);
    fare += extra;
    if (breakdown) breakdown.waiting_charge = extra;
  }
  const earning = rupees(fare * (1 - TAKE_RATE));

  db.prepare("UPDATE rides SET status = 'COMPLETED', fare_final = ?, fare_breakdown = ?, completed_at = ? WHERE id = ?")
    .run(fare, JSON.stringify(breakdown), now(), rideId);
  db.prepare('UPDATE drivers SET current_ride_id = NULL, earnings_total = earnings_total + ? WHERE user_id = ?')
    .run(earning, driverId);
  db.prepare('UPDATE users SET rides_count = rides_count + 1 WHERE id = ?').run(r.rider_id);

  if (r.payment_method === 'wallet') {
    ledger(r.rider_id, 'ride_charge', -fare, `${r.pickup_addr} → ${r.drop_addr}`, rideId);
  }
  ledger(driverId, 'ride_earning', earning, `trip ${rideId} (after ${TAKE_RATE * 100}% platform fee)`, rideId);
  if (r.promo_discount > 0) {
    ledger(r.rider_id, 'promo_credit', 0, `promo ${r.promo_code} saved ₹${r.promo_discount}`, rideId);
  }

  // remember the drop as a recent destination (city rides only, keep last 6)
  if (r.type === 'city' && r.drop_addr) {
    db.prepare(`INSERT INTO recent_places (user_id,name,lat,lng,last_used) VALUES (?,?,?,?,?)
      ON CONFLICT(user_id,name) DO UPDATE SET last_used = ?`)
      .run(r.rider_id, r.drop_addr, r.drop_lat, r.drop_lng, now(), now());
    db.prepare(`DELETE FROM recent_places WHERE user_id = ? AND name NOT IN
      (SELECT name FROM recent_places WHERE user_id = ? ORDER BY last_used DESC LIMIT 6)`)
      .run(r.rider_id, r.rider_id);
  }

  inc('ryder_business_events_total', { event: 'ride_completed', type: r.type });
  log.info('ride.completed', { ride: rideId, fare, driver: driverId, wait_min: r.waiting_min });
  pushRide(rideId);
  return rideView(rideId);
}

/* ============ RideCheck: anomaly monitor for ongoing trips ============
   Detects a vehicle that hasn't moved meaningfully for a while mid-trip and
   nudges the rider + safety desk. Runs from index.js on an interval. */
const lastMove = new Map(); // rideId -> { lat, lng, since }
const RIDECHECK_STALL_MS = 4 * 60 * 1000;
const notifiedStall = new Set();

export function rideCheckTick() {
  const ongoing = db.prepare(`
    SELECT r.id, r.rider_id, d.lat, d.lng FROM rides r
    JOIN drivers d ON d.user_id = r.driver_id
    WHERE r.status = 'ONGOING'`).all();
  const live = new Set(ongoing.map(r => r.id));
  for (const k of [...lastMove.keys()]) if (!live.has(k)) { lastMove.delete(k); notifiedStall.delete(k); }

  for (const r of ongoing) {
    const prev = lastMove.get(r.id);
    if (!prev || haversineKm(prev.lat, prev.lng, r.lat, r.lng) > 0.12) {
      lastMove.set(r.id, { lat: r.lat, lng: r.lng, since: now() });
      continue;
    }
    if (now() - prev.since > RIDECHECK_STALL_MS && !notifiedStall.has(r.id)) {
      notifiedStall.add(r.id);
      emitTo(r.rider_id, 'ridecheck', { ride_id: r.id, kind: 'long_stop', msg: 'Your trip seems to have stopped for a while. Everything okay?' });
      emitAdmins('ridecheck', { ride_id: r.id, kind: 'long_stop' });
      log.warn('ridecheck.long_stop', { ride: r.id });
    }
  }
}

export function cancelRide(rideId, byUserId, byRole, reason) {
  const r = db.prepare('SELECT * FROM rides WHERE id = ?').get(rideId);
  if (!r) throw new Error('ride not found');
  if (['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(r.status)) throw new Error('ride already closed');
  if (r.status === 'ONGOING' && byRole === 'rider') throw new Error('cannot cancel an ongoing ride');

  const st = offers.get(rideId);
  if (st) { clearTimeout(st.timer); if (st.driverId) emitTo(st.driverId, 'offer_closed', { ride_id: rideId }); offers.delete(rideId); }

  let fee = 0;
  if (byRole === 'rider' && r.driver_id && r.accepted_at && now() - r.accepted_at > 60000) {
    fee = 30;
    ledger(r.rider_id, 'ride_charge', -fee, 'late cancellation fee', rideId);
    ledger(r.driver_id, 'ride_earning', rupees(fee * (1 - TAKE_RATE)), 'cancellation compensation', rideId);
  }

  db.prepare("UPDATE rides SET status = 'CANCELLED', cancel_reason = ?, cancelled_by = ?, cancelled_at = ? WHERE id = ?")
    .run(reason || '', byRole, now(), rideId);
  if (r.driver_id) db.prepare('UPDATE drivers SET current_ride_id = NULL WHERE user_id = ?').run(r.driver_id);

  pushRide(rideId, { cancel_fee: fee });
  return { ...rideView(rideId), cancel_fee: fee };
}

export function rateRide(rideId, raterId, stars, tags = [], comment = '') {
  const r = db.prepare('SELECT * FROM rides WHERE id = ?').get(rideId);
  if (!r || r.status !== 'COMPLETED') throw new Error('ride not completed');
  const rateeId = raterId === r.rider_id ? r.driver_id : r.rider_id;
  db.prepare('INSERT INTO ratings (id,ride_id,rater_id,ratee_id,stars,tags,comment,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(uid('rt'), rideId, raterId, rateeId, stars, JSON.stringify(tags), comment, now());
  const u = db.prepare('SELECT rating, rating_count FROM users WHERE id = ?').get(rateeId);
  const newCount = u.rating_count + 1;
  const newRating = Math.round(((u.rating * u.rating_count + stars) / newCount) * 100) / 100;
  db.prepare('UPDATE users SET rating = ?, rating_count = ? WHERE id = ?').run(newRating, newCount, rateeId);
  return { rating: newRating };
}
