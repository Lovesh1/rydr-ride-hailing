// server/pricing.js — Ola-parity fare engine
// City fares: base (incl. base km) + km slabs + ride-time + booking fee
//             × surge (zone) × night multiplier, + waiting, − promo/prime, + GST
// Plus: hourly rental packages and outstation (one-way / round-trip) pricing.
import { db } from './db.js';
import { haversineKm, round2, rupees, now } from './lib.js';

/* ================= CITY RATE CARDS =================
   Modeled on Indian ride-hailing rate structures:
   - base fare covers the first `baseKm`
   - two per-km slabs (short hops cost more per km than long hauls)
   - ride-time charge per minute
   - flat booking/access fee
   - minimum fare floor
*/
export const RATE_CARD = {
  bike:  { label: 'Bike',  seats: 1, emoji: '🏍', base: 20,  baseKm: 2, km1: 7,  km1UpTo: 8,  km2: 6,  perMin: 0.75, minFare: 35,  bookingFee: 5,  waitPerMin: 1.0 },
  auto:  { label: 'Auto',  seats: 3, emoji: '🛺', base: 30,  baseKm: 1.5, km1: 10, km1UpTo: 10, km2: 9,  perMin: 1.0,  minFare: 45,  bookingFee: 8,  waitPerMin: 1.5 },
  mini:  { label: 'Mini',  seats: 4, emoji: '🚗', base: 50,  baseKm: 2, km1: 14, km1UpTo: 12, km2: 12, perMin: 1.5,  minFare: 75,  bookingFee: 12, waitPerMin: 2.0 },
  prime: { label: 'Prime Sedan', seats: 4, emoji: '🚘', base: 80, baseKm: 2, km1: 18, km1UpTo: 12, km2: 15, perMin: 2.0, minFare: 120, bookingFee: 15, waitPerMin: 2.5 },
  suv:   { label: 'Prime SUV', seats: 6, emoji: '🚙', base: 110, baseKm: 2, km1: 23, km1UpTo: 12, km2: 19, perMin: 2.5, minFare: 170, bookingFee: 18, waitPerMin: 3.0 },
  ev:    { label: 'EV',    seats: 4, emoji: '⚡', base: 55,  baseKm: 2, km1: 15, km1UpTo: 12, km2: 13, perMin: 1.5,  minFare: 85,  bookingFee: 12, waitPerMin: 2.0 },
};

/* ================= RENTAL PACKAGES (hr/km) ================= */
export const RENTAL_PACKAGES = [
  { id: '1h10',  hours: 1, km: 10 },
  { id: '2h20',  hours: 2, km: 20 },
  { id: '4h40',  hours: 4, km: 40 },
  { id: '8h80',  hours: 8, km: 80 },
  { id: '12h120', hours: 12, km: 120 },
];
// price = perHour * hours (per category); extras billed per km / per min
export const RENTAL_RATES = {
  mini:  { perHour: 140, extraKm: 12, extraMin: 2.0 },
  prime: { perHour: 190, extraKm: 15, extraMin: 2.5 },
  suv:   { perHour: 260, extraKm: 19, extraMin: 3.0 },
  ev:    { perHour: 160, extraKm: 13, extraMin: 2.0 },
};

/* ================= OUTSTATION ================= */
export const OUTSTATION_RATES = {
  mini:  { perKm: 11.5, driverAllowancePerDay: 300, minKmPerDay: 250 },
  prime: { perKm: 14.5, driverAllowancePerDay: 400, minKmPerDay: 250 },
  suv:   { perKm: 18,   driverAllowancePerDay: 500, minKmPerDay: 300 },
};

/* ================= PARCEL (bike courier) =================
   Size tiers cap weight; insurance-lite handling fee baked into base. */
export const PARCEL_RATES = {
  small:  { label: 'Small · up to 3 kg',  base: 30, baseKm: 1.5, perKm: 8,  minFare: 45 },
  medium: { label: 'Medium · up to 7 kg', base: 40, baseKm: 1.5, perKm: 10, minFare: 60 },
  large:  { label: 'Large · up to 12 kg', base: 55, baseKm: 1.5, perKm: 12, minFare: 80 },
};

export function estimateParcel(points, userId) {
  const { distKm, durMin } = routeMetrics(points);
  const prime = isPrime(userId);
  const options = Object.entries(PARCEL_RATES).map(([size, r]) => {
    const chargeableKm = Math.max(0, distKm - r.baseKm);
    const distanceCharge = round2(chargeableKm * r.perKm);
    let subtotal = Math.max(r.base + distanceCharge, r.minFare);
    const primeDiscount = prime ? round2(subtotal * PRIME_DISCOUNT) : 0;
    subtotal -= primeDiscount;
    const gst = round2(subtotal * GST);
    return {
      size, label: r.label, emoji: '📦',
      fare: rupees(subtotal + gst),
      breakdown: { base_fare: r.base, distance_charge: distanceCharge,
        prime_discount: -primeDiscount, gst },
    };
  });
  return { type: 'parcel', distKm, durMin, prime, options };
}

const ROUTE_FACTOR = 1.35;    // road distance vs straight line
const AVG_SPEED_KMH = 22;     // city average
const OUTSTATION_SPEED = 55;
const GST = 0.05;
const NIGHT_MULT = 1.25;      // 23:00–05:00 on distance+time components
const FREE_WAIT_MIN = 5;      // free waiting after driver arrives
const PRIME_DISCOUNT = 0.10;  // Ryder Prime members: 10% off, surge waived

export function isNight(ts = now()) {
  const h = new Date(ts).getHours();
  return h >= 23 || h < 5;
}

export function isPrime(userId) {
  if (!userId) return false;
  const u = db.prepare('SELECT prime_until FROM users WHERE id = ?').get(userId);
  return !!u && (u.prime_until || 0) > now();
}

/** surge for a point = max surge of any zone containing it */
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

/** distance/duration across pickup -> [stops...] -> drop */
export function routeMetrics(points) {
  let straight = 0;
  for (let i = 1; i < points.length; i++) {
    straight += haversineKm(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
  }
  const distKm = round2(straight * ROUTE_FACTOR);
  const durMin = Math.max(4, Math.round(distKm / AVG_SPEED_KMH * 60));
  return { distKm, durMin };
}

/** the Ola-style city fare with full breakdown */
export function cityFare(category, distKm, durMin, { surge = 1, night = false, prime = false, waitingMin = 0 } = {}) {
  const rc = RATE_CARD[category];
  if (!rc) return null;

  const chargeableKm = Math.max(0, distKm - rc.baseKm);
  const slab1Km = Math.min(chargeableKm, Math.max(0, rc.km1UpTo - rc.baseKm));
  const slab2Km = Math.max(0, chargeableKm - slab1Km);

  const base = rc.base;
  const distanceCharge = round2(slab1Km * rc.km1 + slab2Km * rc.km2);
  const timeCharge = round2(durMin * rc.perMin);

  let core = base + distanceCharge + timeCharge;

  const effSurge = prime ? 1 : surge;                    // Prime waives surge
  const surgeAmount = round2(core * (effSurge - 1));
  const nightAmount = night ? round2(core * (NIGHT_MULT - 1)) : 0;
  core = core + surgeAmount + nightAmount;

  const waitingCharge = round2(Math.max(0, waitingMin - FREE_WAIT_MIN) * rc.waitPerMin);

  let subtotal = Math.max(core, rc.minFare) + rc.bookingFee + waitingCharge;

  const primeDiscount = prime ? round2(subtotal * PRIME_DISCOUNT) : 0;
  subtotal -= primeDiscount;

  const gst = round2(subtotal * GST);
  const total = rupees(subtotal + gst);

  return {
    category, distKm, durMin,
    breakdown: {
      base_fare: base,
      distance_charge: distanceCharge,
      time_charge: timeCharge,
      booking_fee: rc.bookingFee,
      surge_multiplier: effSurge,
      surge_amount: surgeAmount,
      night_charge: nightAmount,
      waiting_charge: waitingCharge,
      prime_discount: -primeDiscount,
      gst,
    },
    total,
  };
}

/** estimate across all city categories, with breakdowns */
export function estimateCity(points, userId) {
  const { distKm, durMin } = routeMetrics(points);
  const { surge, zone } = surgeAt(points[0].lat, points[0].lng);
  const night = isNight();
  const prime = isPrime(userId);
  const options = Object.keys(RATE_CARD).map(key => {
    const f = cityFare(key, distKm, durMin, { surge, night, prime });
    const rc = RATE_CARD[key];
    return { category: key, label: rc.label, seats: rc.seats, emoji: rc.emoji,
      fare: f.total, breakdown: f.breakdown, etaMin: 2 + Math.floor(Math.random() * 5) };
  });
  return { type: 'city', distKm, durMin, surge, zone, night, prime, options };
}

/** rental estimate: every package × every rental category */
export function estimateRentals(userId) {
  const prime = isPrime(userId);
  const out = [];
  for (const pkg of RENTAL_PACKAGES) {
    for (const [cat, r] of Object.entries(RENTAL_RATES)) {
      let price = r.perHour * pkg.hours;
      const primeDiscount = prime ? round2(price * PRIME_DISCOUNT) : 0;
      price -= primeDiscount;
      const gst = round2(price * GST);
      out.push({
        package_id: pkg.id, hours: pkg.hours, km: pkg.km, category: cat,
        label: `${RATE_CARD[cat].label} · ${pkg.hours}h / ${pkg.km}km`,
        emoji: RATE_CARD[cat].emoji,
        fare: rupees(price + gst),
        breakdown: { package_price: r.perHour * pkg.hours, prime_discount: -primeDiscount,
          extra_km_rate: r.extraKm, extra_min_rate: r.extraMin, gst },
      });
    }
  }
  return { type: 'rental', prime, packages: RENTAL_PACKAGES, options: out };
}

/** outstation estimate */
export function estimateOutstation(points, tripType, userId) {
  let straight = 0;
  for (let i = 1; i < points.length; i++)
    straight += haversineKm(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
  const oneWayKm = round2(straight * 1.25);
  const prime = isPrime(userId);
  const options = Object.entries(OUTSTATION_RATES).map(([cat, r]) => {
    const billedKm = tripType === 'round'
      ? Math.max(oneWayKm * 2, r.minKmPerDay)
      : Math.max(oneWayKm, r.minKmPerDay * 0.6);
    const distanceCharge = round2(billedKm * r.perKm);
    const allowance = r.driverAllowancePerDay;
    let subtotal = distanceCharge + allowance;
    const primeDiscount = prime ? round2(subtotal * PRIME_DISCOUNT) : 0;
    subtotal -= primeDiscount;
    const gst = round2(subtotal * GST);
    return { category: cat, label: RATE_CARD[cat].label, emoji: RATE_CARD[cat].emoji,
      fare: rupees(subtotal + gst),
      breakdown: { billed_km: billedKm, per_km: r.perKm, distance_charge: distanceCharge,
        driver_allowance: allowance, prime_discount: -primeDiscount, gst } };
  });
  const durMin = Math.round(oneWayKm / OUTSTATION_SPEED * 60);
  return { type: 'outstation', trip_type: tripType, oneWayKm, durMin, prime, options };
}

/** validate + compute promo discount */
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
