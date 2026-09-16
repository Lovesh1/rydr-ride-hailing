// server/routes.js — full REST API: auth, rider, driver, admin
import { db, PLACES, refCode } from './db.js';
import { uid, now, otp6, ok, bad, readBody, authUser, signToken, haversineKm } from './lib.js';
import { estimateCity, estimateRentals, estimateOutstation, estimateParcel, RATE_CARD } from './pricing.js';
import {
  createRide, rideView, cancelRide, rateRide, ledger,
  acceptRide, declineRide, markArrived, startRide, completeRide, pendingOfferFor,
} from './rides.js';
import { subscribe, emitAdmins, emitTo } from './events.js';
import {
  PROVIDERS, searchPlaces, routeViaGoogle, sendOtpSms,
  createTopupOrder, verifyRazorpayWebhook,
} from './integrations.js';

import crypto from 'node:crypto';
import { CONFIG } from './config.js';
import { inc } from './metrics.js';
import { log } from './logger.js';

const ADMIN_PHONE = '+919999900000';
const OTP_TTL = CONFIG.otpTtlMs;
const REFERRAL_BONUS = 100;
const PRIME_PRICE = 149;
const PRIME_DAYS = 30;

const hashOtp = (code, phone) =>
  crypto.createHmac('sha256', CONFIG.secret).update(`${phone}:${code}`).digest('hex');

const audit = (adminId, action, target, detail = '') =>
  db.prepare('INSERT INTO audit_log (id,admin_id,action,target,detail,created_at) VALUES (?,?,?,?,?,?)')
    .run(uid('au'), adminId, action, target, detail, now());

/* Idempotency: for money/booking POSTs, replay the stored response when the
   client retries with the same Idempotency-Key (network flake, double-tap). */
function idempotent(req, userId, endpoint, res, produce) {
  const k = req.headers['idempotency-key'];
  if (!k || typeof k !== 'string' || k.length > 128) return produce();
  const hit = db.prepare('SELECT response_json FROM idempotency_keys WHERE key = ? AND user_id = ? AND endpoint = ?')
    .get(k, userId, endpoint);
  if (hit) { res.setHeader('Idempotency-Replayed', 'true'); return ok(res, JSON.parse(hit.response_json)); }
  return produce((payload) => {
    try {
      db.prepare('INSERT OR IGNORE INTO idempotency_keys (key,user_id,endpoint,response_json,created_at) VALUES (?,?,?,?,?)')
        .run(k, userId, endpoint, JSON.stringify(payload), now());
    } catch {}
  });
}

export async function route(req, res, url) {
  const p = url.pathname;
  const m = req.method;
  const seg = p.split('/').filter(Boolean);

  /* ================= AUTH ================= */
  if (p === '/api/auth/otp' && m === 'POST') {
    const { phone } = await readBody(req);
    if (!/^\+?[0-9]{10,14}$/.test(phone || '')) return bad(res, 'valid phone required');
    const code = otp6();
    // only the HMAC of the code is stored — a leaked DB cannot mint logins
    const h = hashOtp(code, phone);
    db.prepare('INSERT INTO otps (phone,code,expires_at,attempts) VALUES (?,?,?,0) ON CONFLICT(phone) DO UPDATE SET code=?, expires_at=?, attempts=0')
      .run(phone, h, now() + OTP_TTL, h, now() + OTP_TTL);
    const sms = await sendOtpSms(phone, code);        // Twilio when configured, console otherwise
    inc('ryder_business_events_total', { event: 'otp_sent' });
    log.info('auth.otp_sent', { phone: phone.slice(0, 6) + '…', provider: sms.provider });
    const body = { sent: true, provider: sms.provider };
    // demo OTP disappears once real SMS delivery works
    if (CONFIG.exposeDemoOtp && !sms.delivered) body.demo_otp = code;
    return ok(res, body);
  }

  /* Razorpay webhook — credits wallet exactly once per captured payment */
  if (p === '/api/webhooks/razorpay' && m === 'POST') {
    let raw = '';
    await new Promise((resolve) => { req.on('data', c => raw += c); req.on('end', resolve); });
    if (!verifyRazorpayWebhook(raw, req.headers['x-razorpay-signature'])) {
      return bad(res, 'invalid signature', 401);
    }
    try {
      const evt = JSON.parse(raw);
      if (evt.event === 'payment.captured') {
        const pay = evt.payload.payment.entity;
        const userId = pay.notes?.user_id;
        const already = db.prepare("SELECT 1 FROM wallet_ledger WHERE type = 'topup' AND note = ?")
          .get(`razorpay ${pay.id}`);
        if (userId && !already) {
          ledger(userId, 'topup', pay.amount / 100, `razorpay ${pay.id}`);
          inc('ryder_business_events_total', { event: 'topup' });
        }
      }
      return ok(res, { received: true });
    } catch (e) { return bad(res, e.message); }
  }

  if (p === '/api/auth/verify' && m === 'POST') {
    const { phone, otp, name, role, referral } = await readBody(req);
    const row = db.prepare('SELECT * FROM otps WHERE phone = ?').get(phone);
    if (!row || row.expires_at < now()) return bad(res, 'OTP expired — request a new one');
    if (row.attempts >= CONFIG.otpMaxAttempts) return bad(res, 'too many attempts — request a new code', 429);
    const given = Buffer.from(hashOtp(String(otp || ''), phone));
    const stored = Buffer.from(row.code);
    if (given.length !== stored.length || !crypto.timingSafeEqual(given, stored)) {
      db.prepare('UPDATE otps SET attempts = attempts + 1 WHERE phone = ?').run(phone);
      inc('ryder_business_events_total', { event: 'otp_failed' });
      return bad(res, 'incorrect OTP');
    }
    inc('ryder_business_events_total', { event: 'login' });
    db.prepare('DELETE FROM otps WHERE phone = ?').run(phone);

    let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    if (!user) {
      const wantRole = phone === ADMIN_PHONE ? 'admin' : (role === 'driver' ? 'driver' : 'rider');
      const id = uid('usr');
      db.prepare('INSERT INTO users (id,phone,name,role,referral_code,created_at) VALUES (?,?,?,?,?,?)')
        .run(id, phone, name || 'Ryder user', wantRole, refCode(), now());
      if (wantRole === 'rider') {
        ledger(id, 'topup', 500, 'welcome credit 🎁');
        if (referral) {
          const ref = db.prepare('SELECT id, name FROM users WHERE referral_code = ?').get(referral.toUpperCase());
          if (ref && ref.id !== id) {
            db.prepare('UPDATE users SET referred_by = ? WHERE id = ?').run(ref.id, id);
            ledger(id, 'referral', REFERRAL_BONUS, `referred by ${ref.name}`);
            ledger(ref.id, 'referral', REFERRAL_BONUS, 'friend joined with your code');
            emitTo(ref.id, 'referral', { bonus: REFERRAL_BONUS });
          }
        }
      }
      if (wantRole === 'driver') {
        db.prepare('INSERT INTO drivers (user_id,category,vehicle_make,plate,kyc_status,lat,lng) VALUES (?,?,?,?,?,?,?)')
          .run(id, 'auto', 'Bajaj RE', 'KA 00 NEW 0000', 'pending', 12.9352, 77.6245);
      }
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    }
    if (user.status === 'blocked') return bad(res, 'account blocked — contact support', 403);
    if (name && name !== user.name) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, user.id);

    const token = signToken({ uid: user.id, role: user.role });
    const driver = user.role === 'driver' ? db.prepare('SELECT * FROM drivers WHERE user_id = ?').get(user.id) : null;
    return ok(res, { token, user: { ...user, name: name || user.name }, driver });
  }

  /* ---------- everything below requires auth ---------- */
  const auth = authUser(req);
  if (!auth) return bad(res, 'unauthorized', 401);
  const me = db.prepare('SELECT * FROM users WHERE id = ?').get(auth.uid);
  if (!me) return bad(res, 'unknown user', 401);
  if (me.status === 'blocked') return bad(res, 'account blocked', 403);

  if (p === '/api/events' && m === 'GET') return subscribe(me.id, me.role, req, res);

  if (p === '/api/me' && m === 'GET') {
    const driver = me.role === 'driver' ? db.prepare('SELECT * FROM drivers WHERE user_id = ?').get(me.id) : null;
    return ok(res, { user: me, driver, prime: (me.prime_until || 0) > now() });
  }

  if (p === '/api/places' && m === 'GET') {
    const q = (url.searchParams.get('q') || '').toLowerCase();
    // recents first (empty query), then provider results (Google when keyed, builtin otherwise)
    const recents = q ? [] : db.prepare(
      'SELECT name, lat, lng FROM recent_places WHERE user_id = ? ORDER BY last_used DESC LIMIT 4')
      .all(me.id).map(r => ({ ...r, recent: true }));
    const results = await searchPlaces(q,
      () => PLACES.filter(pl => pl.name.toLowerCase().includes(q)).slice(0, 8));
    const seen = new Set(recents.map(r => r.name));
    return ok(res, [...recents, ...results.filter(r => !seen.has(r.name))].slice(0, 10));
  }

  /* ---------- estimates ---------- */
  if (p === '/api/fares/estimate' && m === 'POST') {
    const { pickup, drop, stops } = await readBody(req);
    if (!pickup?.lat || !drop?.lat) return bad(res, 'pickup and drop required');
    const points = [pickup, ...(stops || []), drop];
    const gRoute = await routeViaGoogle(points);   // real road distance + traffic ETA when keyed
    return ok(res, { ...estimateCity(points, me.id, gRoute), route_source: gRoute ? 'google' : 'model' });
  }
  if (p === '/api/fares/rentals' && m === 'GET') return ok(res, estimateRentals(me.id));
  if (p === '/api/fares/outstation' && m === 'POST') {
    const { pickup, drop, trip_type } = await readBody(req);
    if (!pickup?.lat || !drop?.lat) return bad(res, 'pickup and drop required');
    return ok(res, estimateOutstation([pickup, drop], trip_type || 'oneway', me.id));
  }
  if (p === '/api/fares/parcel' && m === 'POST') {
    const { pickup, drop } = await readBody(req);
    if (!pickup?.lat || !drop?.lat) return bad(res, 'pickup and drop required');
    return ok(res, estimateParcel([pickup, drop], me.id));
  }

  /* ================= RIDER ================= */
  if (p === '/api/rides' && m === 'POST') {
    if (me.role !== 'rider') return bad(res, 'riders only', 403);
    const body = await readBody(req);
    if ((body.type || 'city') === 'city' && body.pickup?.lat && body.drop?.lat) {
      body._route = await routeViaGoogle([body.pickup, ...(body.stops || []), body.drop]);
    }
    return idempotent(req, me.id, 'create_ride', res, (store) => {
      if (!body.pickup?.lat || !body.category) return bad(res, 'pickup and category required');
      const active = db.prepare("SELECT id FROM rides WHERE rider_id = ? AND status IN ('SEARCHING','ACCEPTED','ARRIVED','ONGOING')").get(me.id);
      if (active) return bad(res, 'you already have an active ride');
      try {
        const r = createRide(me.id, body);
        // Postpaid: the wallet may go negative up to the credit line
        const spendable = me.wallet_balance + (me.postpaid_limit || 0);
        if ((body.payment_method === 'wallet' || !body.payment_method) && spendable < r.fare_quoted) {
          cancelRide(r.id, me.id, 'rider', 'insufficient balance');
          return bad(res, `insufficient balance (₹${Math.round(me.wallet_balance)}${me.postpaid_limit ? ` + ₹${me.postpaid_limit} postpaid` : ''}) — top up or pay cash`);
        }
        inc('ryder_business_events_total', { event: 'ride_requested', type: r.type });
        if (store) store(r);
        return ok(res, r);
      } catch (e) { return bad(res, e.message); }
    });
  }

  if (p === '/api/rides/active' && m === 'GET') {
    const r = db.prepare(`SELECT id FROM rides WHERE rider_id = ? AND status IN ('SEARCHING','ACCEPTED','ARRIVED','ONGOING') ORDER BY requested_at DESC`).get(me.id);
    return ok(res, r ? rideView(r.id) : null);
  }

  if (p === '/api/rides/scheduled' && m === 'GET') {
    return ok(res, db.prepare(`SELECT * FROM rides WHERE rider_id = ? AND status = 'SCHEDULED' ORDER BY scheduled_at`).all(me.id));
  }

  if (p === '/api/rides' && m === 'GET') {
    const rows = db.prepare(`SELECT * FROM rides WHERE rider_id = ? ORDER BY requested_at DESC LIMIT 30`).all(me.id);
    rows.forEach(r => { try { r.fare_breakdown = JSON.parse(r.fare_breakdown || 'null'); } catch {} });
    return ok(res, rows);
  }

  if (seg[0] === 'api' && seg[1] === 'rides' && seg[3] === 'cancel' && m === 'POST') {
    const { reason } = await readBody(req);
    try { return ok(res, cancelRide(seg[2], me.id, me.role === 'driver' ? 'driver' : 'rider', reason)); }
    catch (e) { return bad(res, e.message); }
  }

  if (seg[0] === 'api' && seg[1] === 'rides' && seg[3] === 'rate' && m === 'POST') {
    const { stars, tags, comment } = await readBody(req);
    try { return ok(res, rateRide(seg[2], me.id, Number(stars), tags, comment)); }
    catch (e) { return bad(res, e.message); }
  }

  if (seg[0] === 'api' && seg[1] === 'rides' && seg[3] === 'tip' && m === 'POST') {
    const { amount } = await readBody(req);
    const r = db.prepare('SELECT * FROM rides WHERE id = ? AND rider_id = ?').get(seg[2], me.id);
    if (!r || r.status !== 'COMPLETED') return bad(res, 'ride not completed');
    const amt = Math.min(Math.max(Number(amount) || 0, 0), 500);
    if (amt <= 0) return bad(res, 'invalid tip');
    if (me.wallet_balance < amt) return bad(res, 'insufficient balance');
    ledger(me.id, 'tip', -amt, `tip for ${rideView(r.id).driver_name}`, r.id);
    ledger(r.driver_id, 'tip', amt, 'rider tip 💚', r.id);
    emitTo(r.driver_id, 'tip', { ride_id: r.id, amount: amt });
    return ok(res, { tipped: amt });
  }

  if (seg[0] === 'api' && seg[1] === 'rides' && seg[3] === 'sos' && m === 'POST') {
    const { lat, lng } = await readBody(req);
    const id = uid('sos');
    db.prepare('INSERT INTO sos_events (id,ride_id,raised_by,lat,lng,created_at) VALUES (?,?,?,?,?,?)')
      .run(id, seg[2], me.id, lat || null, lng || null, now());
    emitAdmins('sos', { id, ride_id: seg[2], raised_by: me.name, at: now() });
    return ok(res, { raised: true, id });
  }

  if (seg[0] === 'api' && seg[1] === 'rides' && seg.length === 3 && m === 'GET') {
    const v = rideView(seg[2]);
    if (!v) return bad(res, 'not found', 404);
    if (me.role !== 'admin' && v.rider_id !== me.id && v.driver_id !== me.id) return bad(res, 'forbidden', 403);
    return ok(res, v);
  }

  /* ---------- wallet ---------- */
  if (p === '/api/wallet' && m === 'GET') {
    const txs = db.prepare('SELECT * FROM wallet_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 30').all(me.id);
    const bal = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(me.id).wallet_balance;
    return ok(res, { balance: bal, transactions: txs });
  }

  if (p === '/api/wallet/topup' && m === 'POST') {
    const { amount } = await readBody(req);
    const amt = Math.min(Math.max(Number(amount) || 0, 1), 10000);
    if (PROVIDERS.payments === 'razorpay') {
      // real flow: return an order; the client opens Razorpay Checkout with it,
      // and the wallet is credited by the signed webhook, not here.
      try {
        const order = await createTopupOrder(me.id, amt);
        return ok(res, { pending: true, gateway: 'razorpay', ...order });
      } catch (e) { return bad(res, `payment gateway error: ${e.message}`, 502); }
    }
    return idempotent(req, me.id, 'topup', res, (store) => {
      const bal = ledger(me.id, 'topup', amt, 'added via UPI (demo gateway)');
      inc('ryder_business_events_total', { event: 'topup' });
      const payload = { balance: bal };
      if (store) store(payload);
      return ok(res, payload);
    });
  }

  /* ---------- postpaid credit line ---------- */
  if (p === '/api/postpaid/activate' && m === 'POST') {
    if (me.postpaid_limit > 0) return bad(res, 'Postpaid already active');
    if (me.rides_count < 1) return bad(res, 'complete at least 1 ride to unlock Postpaid');
    db.prepare('UPDATE users SET postpaid_limit = 500 WHERE id = ?').run(me.id);
    inc('ryder_business_events_total', { event: 'postpaid_activated' });
    return ok(res, { postpaid_limit: 500 });
  }

  /* ---------- prime membership ---------- */
  if (p === '/api/prime/subscribe' && m === 'POST') {
    if ((me.prime_until || 0) > now()) return bad(res, 'already a Prime member');
    if (me.wallet_balance < PRIME_PRICE) return bad(res, `needs ₹${PRIME_PRICE} in wallet`);
    ledger(me.id, 'prime', -PRIME_PRICE, `Ryder Prime · ${PRIME_DAYS} days`);
    const until = now() + PRIME_DAYS * 864e5;
    db.prepare('UPDATE users SET prime_until = ? WHERE id = ?').run(until, me.id);
    return ok(res, { prime_until: until });
  }

  /* ---------- saved places ---------- */
  if (p === '/api/saved-places' && m === 'GET') {
    return ok(res, db.prepare('SELECT * FROM saved_places WHERE user_id = ? ORDER BY created_at').all(me.id));
  }
  if (p === '/api/saved-places' && m === 'POST') {
    const { label, name, lat, lng } = await readBody(req);
    if (!label || !name || !lat) return bad(res, 'label, name, lat, lng required');
    db.prepare('DELETE FROM saved_places WHERE user_id = ? AND label = ?').run(me.id, label);
    const id = uid('pl');
    db.prepare('INSERT INTO saved_places (id,user_id,label,name,lat,lng,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(id, me.id, label, name, lat, lng, now());
    return ok(res, { id });
  }
  if (seg[1] === 'saved-places' && seg.length === 3 && m === 'DELETE') {
    db.prepare('DELETE FROM saved_places WHERE id = ? AND user_id = ?').run(seg[2], me.id);
    return ok(res, { deleted: true });
  }

  /* ---------- emergency contacts ---------- */
  if (p === '/api/emergency-contacts' && m === 'GET') {
    return ok(res, db.prepare('SELECT * FROM emergency_contacts WHERE user_id = ?').all(me.id));
  }
  if (p === '/api/emergency-contacts' && m === 'POST') {
    const { name, phone } = await readBody(req);
    if (!name || !phone) return bad(res, 'name and phone required');
    const cnt = db.prepare('SELECT COUNT(*) c FROM emergency_contacts WHERE user_id = ?').get(me.id).c;
    if (cnt >= 5) return bad(res, 'max 5 contacts');
    const id = uid('ec');
    db.prepare('INSERT INTO emergency_contacts (id,user_id,name,phone,created_at) VALUES (?,?,?,?,?)')
      .run(id, me.id, name, phone, now());
    return ok(res, { id });
  }
  if (seg[1] === 'emergency-contacts' && seg.length === 3 && m === 'DELETE') {
    db.prepare('DELETE FROM emergency_contacts WHERE id = ? AND user_id = ?').run(seg[2], me.id);
    return ok(res, { deleted: true });
  }

  /* ---------- support tickets ---------- */
  if (p === '/api/tickets' && m === 'GET') {
    return ok(res, db.prepare('SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC').all(me.id));
  }
  if (p === '/api/tickets' && m === 'POST') {
    const { ride_id, type, message } = await readBody(req);
    if (!type) return bad(res, 'ticket type required');
    const id = uid('tk');
    db.prepare('INSERT INTO tickets (id,user_id,ride_id,type,message,created_at) VALUES (?,?,?,?,?,?)')
      .run(id, me.id, ride_id || null, type, message || '', now());
    emitAdmins('ticket', { id, type, user: me.name });
    return ok(res, { id });
  }

  /* ---------- ride preferences ---------- */
  if (p === '/api/preferences' && m === 'GET') {
    let prefs = {}; try { prefs = JSON.parse(me.ride_prefs || '{}'); } catch {}
    return ok(res, prefs);
  }
  if (p === '/api/preferences' && m === 'POST') {
    const body = await readBody(req);
    const allowed = ['quiet', 'ac', 'luggage_help', 'prefer_woman_driver', 'auto_share'];
    const prefs = {};
    for (const k of allowed) if (typeof body[k] === 'boolean') prefs[k] = body[k];
    db.prepare('UPDATE users SET ride_prefs = ? WHERE id = ?').run(JSON.stringify(prefs), me.id);
    return ok(res, prefs);
  }

  /* ---------- favourite drivers ---------- */
  if (p === '/api/favourites' && m === 'GET') {
    return ok(res, db.prepare(`
      SELECT f.driver_id, u.name, u.rating, d.vehicle_make, d.category
      FROM favourite_drivers f JOIN users u ON u.id = f.driver_id
      JOIN drivers d ON d.user_id = f.driver_id
      WHERE f.user_id = ? ORDER BY f.created_at DESC`).all(me.id));
  }
  if (p === '/api/favourites' && m === 'POST') {
    const { driver_id, remove } = await readBody(req);
    if (!driver_id) return bad(res, 'driver_id required');
    if (remove) {
      db.prepare('DELETE FROM favourite_drivers WHERE user_id = ? AND driver_id = ?').run(me.id, driver_id);
      return ok(res, { favourited: false });
    }
    const isDriver = db.prepare('SELECT 1 FROM drivers WHERE user_id = ?').get(driver_id);
    if (!isDriver) return bad(res, 'not a driver');
    db.prepare('INSERT OR IGNORE INTO favourite_drivers (user_id,driver_id,created_at) VALUES (?,?,?)')
      .run(me.id, driver_id, now());
    return ok(res, { favourited: true });
  }

  /* ---------- account deletion (DPDP data-principal right) ---------- */
  if (p === '/api/me/delete' && m === 'POST') {
    const { confirm } = await readBody(req);
    if (confirm !== 'DELETE') return bad(res, 'pass {"confirm":"DELETE"} to erase your account');
    if (me.wallet_balance < 0) return bad(res, 'settle your postpaid balance first');
    // anonymize PII; ledger rows are retained for statutory books (see SECURITY.md §9)
    db.prepare(`UPDATE users SET name = 'Deleted user', phone = ?, email = '', status = 'blocked',
        ride_prefs = '{}', referral_code = ? WHERE id = ?`)
      .run('deleted_' + me.id, 'X' + me.id.slice(-8).toUpperCase(), me.id);
    db.prepare('DELETE FROM saved_places WHERE user_id = ?').run(me.id);
    db.prepare('DELETE FROM emergency_contacts WHERE user_id = ?').run(me.id);
    db.prepare('DELETE FROM recent_places WHERE user_id = ?').run(me.id);
    db.prepare('DELETE FROM favourite_drivers WHERE user_id = ?').run(me.id);
    inc('ryder_business_events_total', { event: 'account_deleted' });
    return ok(res, { deleted: true });
  }

  /* ---------- referral ---------- */
  if (p === '/api/referral' && m === 'GET') {
    const count = db.prepare('SELECT COUNT(*) c FROM users WHERE referred_by = ?').get(me.id).c;
    return ok(res, { code: me.referral_code, referred: count, bonus_each: REFERRAL_BONUS });
  }

  /* ================= DRIVER ================= */
  if (seg[1] === 'driver') {
    if (me.role !== 'driver') return bad(res, 'drivers only', 403);
    const d = db.prepare('SELECT * FROM drivers WHERE user_id = ?').get(me.id);

    if (p === '/api/driver/status' && m === 'POST') {
      const { online, lat, lng } = await readBody(req);
      if (online && d.kyc_status !== 'verified') return bad(res, `cannot go online — KYC status: ${d.kyc_status}`);
      db.prepare(`UPDATE drivers SET is_online = ?, lat = COALESCE(?, lat), lng = COALESCE(?, lng),
          last_ping_at = ?, online_since = CASE WHEN ? = 1 AND is_online = 0 THEN ? ELSE online_since END
          WHERE user_id = ?`)
        .run(online ? 1 : 0, lat, lng, now(), online ? 1 : 0, now(), me.id);
      if (!online) db.prepare('UPDATE drivers SET online_since = NULL WHERE user_id = ?').run(me.id);
      emitAdmins('driver_status', { driver_id: me.id, online: !!online });
      return ok(res, { online: !!online });
    }

    /* GoTo preferred-destination mode: 2 activations/day, 2h each */
    if (p === '/api/driver/goto' && m === 'POST') {
      const { lat, lng, clear } = await readBody(req);
      if (clear) {
        db.prepare('UPDATE drivers SET goto_lat = NULL, goto_lng = NULL, goto_expires_at = NULL WHERE user_id = ?').run(me.id);
        return ok(res, { goto: null });
      }
      if (!lat || !lng) return bad(res, 'lat and lng required');
      const today = new Date().toISOString().slice(0, 10);
      const uses = d.goto_reset_day === today ? d.goto_uses_today : 0;
      if (uses >= 2) return bad(res, 'GoTo limit reached — 2 activations per day');
      const expires = now() + 2 * 3600 * 1000;
      db.prepare(`UPDATE drivers SET goto_lat = ?, goto_lng = ?, goto_expires_at = ?,
          goto_uses_today = ?, goto_reset_day = ? WHERE user_id = ?`)
        .run(lat, lng, expires, uses + 1, today, me.id);
      return ok(res, { goto: { lat, lng, expires_at: expires, uses_left_today: 1 - uses } });
    }

    if (p === '/api/driver/ping' && m === 'POST') {
      const { lat, lng } = await readBody(req);
      db.prepare('UPDATE drivers SET lat = ?, lng = ?, last_ping_at = ? WHERE user_id = ?').run(lat, lng, now(), me.id);
      return ok(res, { ok: true });
    }

    if (p === '/api/driver/offer' && m === 'GET') {
      const offer = pendingOfferFor(me.id);
      if (offer) {
        try {
          offer.rider_prefs = JSON.parse(
            db.prepare('SELECT ride_prefs FROM users WHERE id = ?').get(offer.rider_id)?.ride_prefs || '{}');
        } catch { offer.rider_prefs = {}; }
      }
      return ok(res, offer);
    }

    /* demand heatmap: where surge is paying right now */
    if (p === '/api/driver/zones' && m === 'GET') {
      return ok(res, db.prepare('SELECT name, lat, lng, surge FROM zones ORDER BY surge DESC').all());
    }

    const act = seg[4];
    if (seg[2] === 'rides' && m === 'POST') {
      const rid = seg[3];
      try {
        if (act === 'accept') return ok(res, acceptRide(rid, me.id));
        if (act === 'decline') { declineRide(rid, me.id); return ok(res, { declined: true }); }
        if (act === 'arrived') return ok(res, markArrived(rid, me.id));
        if (act === 'start') { const { otp } = await readBody(req); return ok(res, startRide(rid, me.id, otp)); }
        if (act === 'complete') return ok(res, completeRide(rid, me.id));
      } catch (e) { return bad(res, e.message); }
    }

    if (p === '/api/driver/summary' && m === 'GET') {
      const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
      const weekStart = now() - 7 * 864e5;
      const stats = (since) => db.prepare(`
        SELECT COUNT(*) AS trips, COALESCE(SUM(fare_final),0) AS gross
        FROM rides WHERE driver_id = ? AND status = 'COMPLETED' AND completed_at >= ?`).get(me.id, since);
      const today = stats(dayStart.getTime());
      const week = stats(weekStart);
      const earned = (since) => db.prepare(`
        SELECT COALESCE(SUM(amount),0) AS amt FROM wallet_ledger
        WHERE user_id = ? AND amount > 0 AND created_at >= ?`).get(me.id, since).amt;
      const recent = db.prepare(`SELECT * FROM rides WHERE driver_id = ? AND status='COMPLETED' ORDER BY completed_at DESC LIMIT 10`).all(me.id);
      const acc = d.acceptance_offered ? Math.round(d.acceptance_accepted / d.acceptance_offered * 100) : 100;
      const hoursOnline = d.is_online && d.online_since ? +((now() - d.online_since) / 3600000).toFixed(1) : 0;
      const goto_active = d.goto_lat != null && (d.goto_expires_at || 0) > now();
      return ok(res, {
        driver: d, rating: me.rating, acceptance: acc,
        today: { trips: today.trips, earnings: earned(dayStart.getTime()) },
        week: { trips: week.trips, earnings: earned(weekStart) },
        balance: me.wallet_balance, recent,
        hours_online: hoursOnline, fatigue_alert: hoursOnline >= 8,
        goto: goto_active ? { lat: d.goto_lat, lng: d.goto_lng, expires_at: d.goto_expires_at } : null,
      });
    }
  }

  /* ================= ADMIN ================= */
  if (seg[1] === 'admin') {
    if (me.role !== 'admin') return bad(res, 'admins only', 403);

    if (p === '/api/admin/overview' && m === 'GET') {
      const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
      const g = (sql, ...a) => db.prepare(sql).get(...a);
      return ok(res, {
        active_rides: g("SELECT COUNT(*) c FROM rides WHERE status IN ('SEARCHING','ACCEPTED','ARRIVED','ONGOING')").c,
        scheduled_rides: g("SELECT COUNT(*) c FROM rides WHERE status = 'SCHEDULED'").c,
        online_drivers: g('SELECT COUNT(*) c FROM drivers WHERE is_online = 1').c,
        total_drivers: g('SELECT COUNT(*) c FROM drivers').c,
        riders: g("SELECT COUNT(*) c FROM users WHERE role = 'rider'").c,
        gmv_today: g("SELECT COALESCE(SUM(fare_final),0) s FROM rides WHERE status='COMPLETED' AND completed_at >= ?", dayStart.getTime()).s,
        rides_today: g("SELECT COUNT(*) c FROM rides WHERE requested_at >= ?", dayStart.getTime()).c,
        completed_today: g("SELECT COUNT(*) c FROM rides WHERE status='COMPLETED' AND completed_at >= ?", dayStart.getTime()).c,
        cancelled_today: g("SELECT COUNT(*) c FROM rides WHERE status='CANCELLED' AND cancelled_at >= ?", dayStart.getTime()).c,
        kyc_pending: g("SELECT COUNT(*) c FROM drivers WHERE kyc_status = 'pending'").c,
        open_sos: g("SELECT COUNT(*) c FROM sos_events WHERE status = 'open'").c,
        open_tickets: g("SELECT COUNT(*) c FROM tickets WHERE status = 'open'").c,
      });
    }

    if (p === '/api/admin/rides' && m === 'GET') {
      const status = url.searchParams.get('status');
      const rows = db.prepare(`
        SELECT r.*, ru.name AS rider_name, du.name AS driver_name
        FROM rides r JOIN users ru ON ru.id = r.rider_id LEFT JOIN users du ON du.id = r.driver_id
        ${status ? 'WHERE r.status = ?' : ''} ORDER BY r.requested_at DESC LIMIT 50`).all(...(status ? [status] : []));
      return ok(res, rows);
    }

    if (p === '/api/admin/drivers' && m === 'GET') {
      return ok(res, db.prepare(`
        SELECT u.id, u.name, u.phone, u.rating, u.status, u.wallet_balance,
               d.category, d.vehicle_make, d.plate, d.kyc_status, d.is_online, d.is_bot,
               d.earnings_total, d.acceptance_accepted, d.acceptance_offered, d.current_ride_id
        FROM drivers d JOIN users u ON u.id = d.user_id ORDER BY d.kyc_status = 'pending' DESC, d.is_online DESC`).all());
    }

    if (seg[2] === 'drivers' && seg[4] === 'kyc' && m === 'POST') {
      const { action } = await readBody(req);
      const map = { approve: 'verified', reject: 'rejected', suspend: 'suspended', reinstate: 'verified' };
      if (!map[action]) return bad(res, 'action must be approve|reject|suspend|reinstate');
      db.prepare('UPDATE drivers SET kyc_status = ?, is_online = CASE WHEN ? IN (\'rejected\',\'suspended\') THEN 0 ELSE is_online END WHERE user_id = ?')
        .run(map[action], map[action], seg[3]);
      audit(me.id, `kyc_${action}`, seg[3]);
      emitTo(seg[3], 'kyc', { status: map[action] });
      return ok(res, { kyc_status: map[action] });
    }

    if (p === '/api/admin/riders' && m === 'GET') {
      return ok(res, db.prepare(`
        SELECT id, name, phone, rating, rides_count, wallet_balance, status, prime_until, created_at
        FROM users WHERE role = 'rider' ORDER BY created_at DESC LIMIT 100`).all());
    }

    if (seg[2] === 'users' && seg[4] === 'block' && m === 'POST') {
      const { blocked } = await readBody(req);
      db.prepare('UPDATE users SET status = ? WHERE id = ?').run(blocked ? 'blocked' : 'active', seg[3]);
      audit(me.id, blocked ? 'block_user' : 'unblock_user', seg[3]);
      return ok(res, { status: blocked ? 'blocked' : 'active' });
    }

    if (p === '/api/admin/zones' && m === 'GET') return ok(res, db.prepare('SELECT * FROM zones').all());

    if (seg[2] === 'zones' && seg[4] === 'surge' && m === 'POST') {
      const { surge } = await readBody(req);
      const s = Math.min(Math.max(Number(surge) || 1, 1), 3);
      db.prepare('UPDATE zones SET surge = ?, updated_at = ? WHERE id = ?').run(s, now(), seg[3]);
      audit(me.id, 'set_surge', seg[3], `→ ${s}x`);
      emitAdmins('zone', db.prepare('SELECT * FROM zones WHERE id = ?').get(seg[3]));
      return ok(res, { surge: s });
    }

    if (p === '/api/admin/revenue' && m === 'GET') {
      const weekStart = now() - 7 * 864e5;
      const byCat = db.prepare(`
        SELECT category, COUNT(*) trips, COALESCE(SUM(fare_final),0) gross
        FROM rides WHERE status='COMPLETED' GROUP BY category ORDER BY gross DESC`).all();
      const byType = db.prepare(`
        SELECT type, COUNT(*) trips, COALESCE(SUM(fare_final),0) gross
        FROM rides WHERE status='COMPLETED' GROUP BY type`).all();
      const daily = db.prepare(`
        SELECT date(completed_at/1000,'unixepoch') day, COUNT(*) trips, COALESCE(SUM(fare_final),0) gross
        FROM rides WHERE status='COMPLETED' AND completed_at >= ? GROUP BY day ORDER BY day`).all(weekStart);
      const totals = db.prepare(`
        SELECT COALESCE(SUM(fare_final),0) gmv, COUNT(*) trips FROM rides WHERE status='COMPLETED'`).get();
      return ok(res, { by_category: byCat, by_type: byType, daily, gmv: totals.gmv, trips: totals.trips, take_rate: 0.22, net: Math.round(totals.gmv * 0.22) });
    }

    if (p === '/api/admin/positions' && m === 'GET') {
      return ok(res, db.prepare(`
        SELECT d.user_id, u.name, d.category, d.lat, d.lng, d.current_ride_id, d.is_online
        FROM drivers d JOIN users u ON u.id = d.user_id WHERE d.is_online = 1`).all());
    }

    if (p === '/api/admin/sos' && m === 'GET') {
      return ok(res, db.prepare(`
        SELECT s.*, u.name AS raised_by_name FROM sos_events s
        LEFT JOIN users u ON u.id = s.raised_by ORDER BY s.created_at DESC LIMIT 20`).all());
    }

    if (seg[2] === 'sos' && seg[4] === 'resolve' && m === 'POST') {
      db.prepare("UPDATE sos_events SET status='resolved', resolved_at=?, resolved_by=? WHERE id=?").run(now(), me.id, seg[3]);
      audit(me.id, 'resolve_sos', seg[3]);
      return ok(res, { resolved: true });
    }

    if (p === '/api/admin/tickets' && m === 'GET') {
      return ok(res, db.prepare(`
        SELECT t.*, u.name AS user_name FROM tickets t JOIN users u ON u.id = t.user_id
        ORDER BY t.status = 'open' DESC, t.created_at DESC LIMIT 50`).all());
    }
    if (seg[2] === 'tickets' && seg[4] === 'resolve' && m === 'POST') {
      db.prepare("UPDATE tickets SET status='resolved', resolved_at=? WHERE id=?").run(now(), seg[3]);
      audit(me.id, 'resolve_ticket', seg[3]);
      return ok(res, { resolved: true });
    }

    if (p === '/api/admin/audit' && m === 'GET') {
      return ok(res, db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 50').all());
    }
  }

  return bad(res, `no route: ${m} ${p}`, 404);
}
