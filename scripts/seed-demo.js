// scripts/seed-demo.js — fills the platform with 30 days of realistic history
// so every analytics/intelligence surface is rich for a sales demo.
//   node scripts/seed-demo.js        (server must be STOPPED; writes the DB directly)
// Creates: 8 riders across RFM segments (champion/loyal/at-risk/dormant/new,
// one Prime), ~45 completed rides with rush-hour distribution, cash/wallet mix,
// promos, tips, fare-lock fees, expired + cancelled rides — ledger-consistent.
import { db, PLACES, refCode } from '../server/db.js';
import { cityFare, routeMetrics, co2ForRide } from '../server/pricing.js';

const now = Date.now();
let seq = 5000;
const uid = (p) => `${p}_${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const HOURS = [8, 9, 9, 10, 13, 17, 18, 19, 19, 19, 20, 21, 22, 23]; // rush-peaked

const bal = new Map(); // running wallet balance per user
function ledger(userId, type, amount, note, rideId, at) {
  const b = Math.round(((bal.get(userId) || 0) + amount) * 100) / 100;
  bal.set(userId, b);
  db.prepare('INSERT INTO wallet_ledger (id,user_id,ride_id,type,amount,balance_after,note,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(uid('tx'), userId, rideId || null, type, amount, b, note, at);
}

const drivers = db.prepare(`SELECT u.id, d.category FROM drivers d JOIN users u ON u.id = d.user_id WHERE d.is_bot = 1`).all();
const driverFor = (cat) => pick(drivers.filter(d => d.category === cat)) || pick(drivers);
const CATS = ['auto', 'auto', 'auto', 'mini', 'mini', 'bike', 'ev', 'prime'];

function mkRider(name, phone, opts = {}) {
  const id = uid('usr');
  db.prepare(`INSERT INTO users (id,phone,name,role,rating,rating_count,referral_code,prime_until,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, phone, name, 'rider', 4.6 + Math.random() * 0.35, 10, refCode(),
      opts.prime ? now + 20 * 864e5 : 0, now - 40 * 864e5);
  ledger(id, 'topup', 6000, 'added via UPI (demo gateway)', null, now - 39 * 864e5);
  return id;
}

function ride(riderId, daysAgo, status = 'COMPLETED', opts = {}) {
  const from = pick(PLACES.slice(0, 8)), to = pick(PLACES.slice(0, 12).filter(p => p !== from));
  const cat = opts.cat || pick(CATS);
  const { distKm, durMin } = routeMetrics([from, to]);
  const f = cityFare(cat, distKm, durMin, { surge: 1, night: false, prime: !!opts.prime });
  const promo = opts.promo ? Math.min(Math.round(f.total * 0.5), 75) : 0;
  const fare = f.total - promo;
  const t = new Date(now - daysAgo * 864e5);
  t.setHours(pick(HOURS), Math.floor(Math.random() * 60), 0, 0);
  const req = t.getTime(), comp = req + durMin * 60e3;
  const drv = driverFor(cat);
  const id = uid('R');
  const cash = Math.random() < 0.4;
  db.prepare(`INSERT INTO rides (id,rider_id,driver_id,category,type,status,
      pickup_lat,pickup_lng,pickup_addr,drop_lat,drop_lng,drop_addr,stops,otp,
      distance_km,duration_min,fare_quoted,fare_final,fare_breakdown,surge,
      promo_code,promo_discount,payment_method,requested_at,accepted_at,started_at,completed_at,cancelled_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, riderId, status === 'EXPIRED' ? null : drv.id, cat, 'city', status,
    from.lat, from.lng, from.name, to.lat, to.lng, to.name, '[]', '0000',
    distKm, durMin, fare, status === 'COMPLETED' ? fare : null, JSON.stringify(f.breakdown), 1,
    promo ? 'FIRST50' : null, promo, cash ? 'cash' : 'wallet',
    req, status === 'EXPIRED' ? null : req + 20e3, status === 'COMPLETED' ? req + 240e3 : null,
    status === 'COMPLETED' ? comp : null, status === 'CANCELLED' ? req + 90e3 : null);

  if (status === 'COMPLETED') {
    if (!cash) ledger(riderId, 'ride_charge', -fare, `${from.name} → ${to.name}`, id, comp);
    ledger(drv.id, 'ride_earning', Math.round(fare * 0.78), `trip ${id} (after 22% platform fee)`, id, comp);
    db.prepare('UPDATE users SET rides_count = rides_count + 1 WHERE id = ?').run(riderId);
    db.prepare('INSERT INTO ratings (id,ride_id,rater_id,ratee_id,stars,tags,comment,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(uid('rt'), id, riderId, drv.id, pick([4, 5, 5, 5]), '[]', '', comp);
    if (opts.tip) {
      ledger(riderId, 'tip', -20, 'tip for driver', id, comp + 60e3);
      ledger(drv.id, 'tip', 20, 'rider tip 💚', id, comp + 60e3);
    }
  }
  return id;
}

console.log('[seed-demo] building 30 days of history…');

// ── the cast, across RFM segments ──
const aarav  = mkRider('Aarav Mehta',  '+919876540001', { prime: true });   // champion, Prime
const sana   = mkRider('Sana Kapoor',  '+919876540002');                    // champion
const rohit  = mkRider('Rohit Verma',  '+919876540003');                    // loyal
const nisha  = mkRider('Nisha Iyer',   '+919876540004');                    // loyal
const kabir  = mkRider('Kabir Shah',   '+919876540005');                    // at-risk (quiet 9d)
const meher  = mkRider('Meher Gill',   '+919876540006');                    // at-risk (quiet 11d)
const vikram = mkRider('Vikram Rao',   '+919876540007');                    // dormant (35d)
const tara   = mkRider('Tara Menon',   '+919876540008');                    // new (yesterday)

// champions: frequent, recent (streaks alive)
[0, 1, 1, 2, 3, 4, 6, 8, 11, 14].forEach((d, i) => ride(aarav, d, 'COMPLETED', { prime: true, tip: i % 3 === 0 }));
[0, 2, 3, 5, 7, 9, 12, 16].forEach(d => ride(sana, d, 'COMPLETED', { promo: d > 10 }));
// loyal
[1, 4, 8, 13].forEach(d => ride(rohit, d, 'COMPLETED'));
[2, 6, 10].forEach(d => ride(nisha, d, 'COMPLETED', { promo: d === 10 }));
// at-risk: history, then silence
[9, 12, 15, 19].forEach(d => ride(kabir, d, 'COMPLETED'));
[11, 14, 18].forEach(d => ride(meher, d, 'COMPLETED', { tip: true }));
// dormant + new
[35, 38].forEach(d => ride(vikram, d, 'COMPLETED'));
ride(tara, 1, 'COMPLETED', { promo: true });

// the leaks the Profit Engine will price
[0, 1, 2, 3].forEach(d => ride(pick([sana, rohit, nisha]), d, 'EXPIRED'));
[1, 2, 4, 6, 9].forEach(d => ride(pick([aarav, rohit, kabir]), d, 'CANCELLED'));

// micro-revenue: fare-lock fees
ledger(aarav, 'ride_charge', -5, 'fare lock · Auto @ ₹96', null, now - 2 * 864e5);
ledger(sana, 'ride_charge', -5, 'fare lock · Mini @ ₹152', null, now - 5 * 864e5);

// write final balances onto users
for (const [userId, b] of bal) db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(b, userId);

const c = db.prepare("SELECT status, COUNT(*) n FROM rides GROUP BY status").all();
console.log('[seed-demo] done:', c.map(x => `${x.status}=${x.n}`).join(' '), '· 8 demo riders across all RFM segments');
console.log('[seed-demo] start the server and open /admin.html → Intelligence.');
