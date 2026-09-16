// server/rides.js — ride state machine, driver matching cascade, wallet ledger
import { db } from './db.js';
import { uid, now, otp4, haversineKm, rupees } from './lib.js';
import { fareFor, routeMetrics, surgeAt, applyPromo } from './pricing.js';
import { emitTo, emitAdmins } from './events.js';

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
  return r;
}

function pushRide(rideId, extra = {}) {
  const v = rideView(rideId);
  if (!v) return;
  emitTo(v.rider_id, 'ride', { ...v, ...extra });
  if (v.driver_id) emitTo(v.driver_id, 'ride', { ...v, ...extra });
  emitAdmins('ride', { ...v, ...extra });
}

/* ============ create + match ============ */
export function createRide(riderId, body) {
  const { pickup, drop, category, promo_code, payment_method } = body;
  const { distKm, durMin } = routeMetrics(pickup.lat, pickup.lng, drop.lat, drop.lng);
  const { surge } = surgeAt(pickup.lat, pickup.lng);
  const fare = fareFor(category, distKm, durMin, surge);
  if (!fare) throw new Error('unknown category');

  const { discount, error } = applyPromo(promo_code, riderId, fare);
  if (error && promo_code) throw new Error(error);

  const id = uid('R');
  db.prepare(`INSERT INTO rides (id,rider_id,category,status,pickup_lat,pickup_lng,pickup_addr,
      drop_lat,drop_lng,drop_addr,otp,distance_km,duration_min,fare_quoted,surge,
      promo_code,promo_discount,payment_method,requested_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, riderId, category, 'SEARCHING',
    pickup.lat, pickup.lng, pickup.name || 'Pickup',
    drop.lat, drop.lng, drop.name || 'Drop',
    otp4(), distKm, durMin, fare - discount, surge,
    promo_code ? promo_code.toUpperCase() : null, discount,
    payment_method || 'wallet', now());

  offers.set(id, { driverId: null, timer: null, wave: 0, tried: new Set() });
  pushRide(id);
  nextOffer(id);
  return rideView(id);
}

function candidates(ride, tried, radiusKm) {
  const rows = db.prepare(`
    SELECT d.user_id, d.lat, d.lng FROM drivers d
    JOIN users u ON u.id = d.user_id
    WHERE d.is_online = 1 AND d.kyc_status = 'verified' AND d.current_ride_id IS NULL
      AND d.category = ? AND u.status = 'active'`).all(ride.category);
  return rows
    .map(d => ({ ...d, dist: haversineKm(ride.pickup_lat, ride.pickup_lng, d.lat, d.lng) }))
    .filter(d => d.dist <= radiusKm && !tried.has(d.user_id))
    .sort((a, b) => a.dist - b.dist);
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
  emitTo(drv.user_id, 'offer', {
    ride: view,
    pickup_dist_km: Math.round(drv.dist * 100) / 100,
    expires_in_ms: OFFER_TIMEOUT_MS,
  });
  emitAdmins('offer', { ride_id: rideId, driver_id: drv.user_id });
  if (offerHook) offerHook(rideId, drv.user_id);

  st.timer = setTimeout(() => {          // timeout → try next driver
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
  db.prepare("UPDATE rides SET status = 'ONGOING', started_at = ? WHERE id = ?").run(now(), rideId);
  pushRide(rideId);
  return rideView(rideId);
}

export function completeRide(rideId, driverId) {
  const r = db.prepare('SELECT * FROM rides WHERE id = ? AND driver_id = ?').get(rideId, driverId);
  if (!r || r.status !== 'ONGOING') throw new Error('bad state');

  const fare = rupees(r.fare_quoted);
  const earning = rupees(fare * (1 - TAKE_RATE));

  const tx = db.prepare("UPDATE rides SET status = 'COMPLETED', fare_final = ?, completed_at = ? WHERE id = ?");
  tx.run(fare, now(), rideId);
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

  pushRide(rideId);
  return rideView(rideId);
}

export function cancelRide(rideId, byUserId, byRole, reason) {
  const r = db.prepare('SELECT * FROM rides WHERE id = ?').get(rideId);
  if (!r) throw new Error('ride not found');
  if (['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(r.status)) throw new Error('ride already closed');
  if (r.status === 'ONGOING' && byRole === 'rider') throw new Error('cannot cancel an ongoing ride');

  const st = offers.get(rideId);
  if (st) { clearTimeout(st.timer); if (st.driverId) emitTo(st.driverId, 'offer_closed', { ride_id: rideId }); offers.delete(rideId); }

  // cancellation fee: rider cancelling >60s after driver accepted
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
