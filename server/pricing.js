// server/pricing.js — rate cards, surge, fare estimation, promo engine
import { db } from './db.js';
import { haversineKm, round2, rupees } from './lib.js';

export const RATE_CARD = {
  bike:  { label: 'Bike',        base: 15, perKm: 6,  perMin: 0.75, minFare: 30,  seats: 1, emoji: '🏍' },
  auto:  { label: 'Auto',        base: 25, perKm: 9,  perMin: 1.0,  minFare: 40,  seats: 3, emoji: '🛺' },
  mini:  { label: 'Mini',        base: 40, perKm: 12, perMin: 1.25, minFare: 70,  seats: 4, emoji: '🚗' },
  prime: { label: 'Prime',       base: 60, perKm: 16, perMin: 1.75, minFare: 110, seats: 4, emoji: '🚘' },
  ev:    { label: 'EV',          base: 45, perKm: 13, perMin: 1.25, minFare: 80,  seats: 4, emoji: '⚡' },
};

const ROUTE_FACTOR = 1.35;   // road distance vs straight line
const AVG_SPEED_KMH = 22;    // city average
const GST = 0.05;

/** surge for a point = max surge of any zone containing it (1.0 outside all zones) */
export function surgeAt(lat, lng) {
  const zones = db.prepare('SELECT * FROM zones').all();
  let s = 1.0, zoneName = null;
  for (const z of zones) {
    if (haversineKm(lat, lng, z.lat, z.lng) <= z.radius_km && z.surge > s) {
      s = z.surge; zoneName = z.name;
    }
  }
  return { surge: s, zone: zoneName };
}

export function routeMetrics(pLat, pLng, dLat, dLng) {
  const distKm = round2(haversineKm(pLat, pLng, dLat, dLng) * ROUTE_FACTOR);
  const durMin = Math.max(4, Math.round(distKm / AVG_SPEED_KMH * 60));
  return { distKm, durMin };
}

export function fareFor(category, distKm, durMin, surge = 1.0) {
  const rc = RATE_CARD[category];
  if (!rc) return null;
  let fare = rc.base + rc.perKm * distKm + rc.perMin * durMin;
  fare = Math.max(fare * surge, rc.minFare);
  fare = fare * (1 + GST);
  return rupees(fare);
}

/** full estimate across all categories */
export function estimateAll(pLat, pLng, dLat, dLng) {
  const { distKm, durMin } = routeMetrics(pLat, pLng, dLat, dLng);
  const { surge, zone } = surgeAt(pLat, pLng);
  const options = Object.entries(RATE_CARD).map(([key, rc]) => ({
    category: key, label: rc.label, seats: rc.seats, emoji: rc.emoji,
    fare: fareFor(key, distKm, durMin, surge),
    etaMin: 2 + Math.floor(Math.random() * 5),
  }));
  return { distKm, durMin, surge, zone, options };
}

/** validate + compute promo discount; returns {discount, error} */
export function applyPromo(code, userId, fare) {
  if (!code) return { discount: 0 };
  const p = db.prepare('SELECT * FROM promos WHERE code = ? AND active = 1').get(code.toUpperCase());
  if (!p) return { discount: 0, error: 'invalid promo code' };
  const used = db.prepare(
    "SELECT COUNT(*) AS c FROM rides WHERE rider_id = ? AND promo_code = ? AND status = 'COMPLETED'"
  ).get(userId, p.code).c;
  if (used >= p.per_user_cap) return { discount: 0, error: `promo limit reached (${p.per_user_cap} uses)` };
  let d = p.type === 'percent' ? fare * (p.value / 100) : p.value;
  if (p.max_discount) d = Math.min(d, p.max_discount);
  return { discount: rupees(Math.min(d, fare)) };
}
