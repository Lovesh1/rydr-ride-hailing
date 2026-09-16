// server/routes.js — full REST API: auth, rider, driver, admin
import { db, PLACES } from './db.js';
import { uid, now, otp6, ok, bad, readBody, authUser, signToken, haversineKm } from './lib.js';
import { estimateAll, RATE_CARD } from './pricing.js';
import {
  createRide, rideView, cancelRide, rateRide, ledger,
  acceptRide, declineRide, markArrived, startRide, completeRide, pendingOfferFor,
} from './rides.js';
import { subscribe, emitAdmins, emitTo } from './events.js';

const ADMIN_PHONE = '+919999900000';
const OTP_TTL = 5 * 60 * 1000;

const audit = (adminId, action, target, detail = '') =>
  db.prepare('INSERT INTO audit_log (id,admin_id,action,target,detail,created_at) VALUES (?,?,?,?,?,?)')
    .run(uid('au'), adminId, action, target, detail, now());

export async function route(req, res, url) {
  const p = url.pathname;
  const m = req.method;
  const seg = p.split('/').filter(Boolean); // e.g. ['api','rides','R_xx','cancel']

  /* ================= AUTH ================= */
  if (p === '/api/auth/otp' && m === 'POST') {
    const { phone } = await readBody(req);
    if (!/^\+?[0-9]{10,14}$/.test(phone || '')) return bad(res, 'valid phone required');
    const code = otp6();
    db.prepare('INSERT INTO otps (phone,code,expires_at,attempts) VALUES (?,?,?,0) ON CONFLICT(phone) DO UPDATE SET code=?, expires_at=?, attempts=0')
      .run(phone, code, now() + OTP_TTL, code, now() + OTP_TTL);
    // PRODUCTION: hand `code` to an SMS gateway (Twilio Verify / MSG91) here.
    console.log(`[auth] OTP for ${phone}: ${code}`);
    return ok(res, { sent: true, demo_otp: code }); // demo_otp exposed only because no SMS gateway is wired
  }

  if (p === '/api/auth/verify' && m === 'POST') {
    const { phone, otp, name, role } = await readBody(req);
    const row = db.prepare('SELECT * FROM otps WHERE phone = ?').get(phone);
    if (!row || row.expires_at < now()) return bad(res, 'OTP expired — request a new one');
    if (row.attempts >= 5) return bad(res, 'too many attempts');
    if (row.code !== String(otp)) {
      db.prepare('UPDATE otps SET attempts = attempts + 1 WHERE phone = ?').run(phone);
      return bad(res, 'incorrect OTP');
    }
    db.prepare('DELETE FROM otps WHERE phone = ?').run(phone);

    let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    if (!user) {
      const wantRole = phone === ADMIN_PHONE ? 'admin' : (role === 'driver' ? 'driver' : 'rider');
      const id = uid('usr');
      db.prepare('INSERT INTO users (id,phone,name,role,created_at) VALUES (?,?,?,?,?)')
        .run(id, phone, name || 'RYDR user', wantRole, now());
      if (wantRole === 'rider') ledger(id, 'topup', 500, 'welcome credit 🎁');
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
    return ok(res, { user: me, driver });
  }

  if (p === '/api/places' && m === 'GET') {
    const q = (url.searchParams.get('q') || '').toLowerCase();
    return ok(res, PLACES.filter(pl => pl.name.toLowerCase().includes(q)).slice(0, 8));
  }

  if (p === '/api/fares/estimate' && m === 'POST') {
    const { pickup, drop } = await readBody(req);
    if (!pickup?.lat || !drop?.lat) return bad(res, 'pickup and drop required');
    return ok(res, estimateAll(pickup.lat, pickup.lng, drop.lat, drop.lng));
  }

  /* ================= RIDER ================= */
  if (p === '/api/rides' && m === 'POST') {
    if (me.role !== 'rider') return bad(res, 'riders only', 403);
    const active = db.prepare("SELECT id FROM rides WHERE rider_id = ? AND status IN ('SEARCHING','ACCEPTED','ARRIVED','ONGOING')").get(me.id);
    if (active) return bad(res, 'you already have an active ride');
    const body = await readBody(req);
    if (body.payment_method === 'wallet' || !body.payment_method) {
      const est = estimateAll(body.pickup.lat, body.pickup.lng, body.drop.lat, body.drop.lng);
      const opt = est.options.find(o => o.category === body.category);
      if (opt && me.wallet_balance < opt.fare) return bad(res, `insufficient wallet balance (₹${me.wallet_balance.toFixed(0)}) — top up or pay cash`);
    }
    try { return ok(res, createRide(me.id, body)); }
    catch (e) { return bad(res, e.message); }
  }

  if (p === '/api/rides/active' && m === 'GET') {
    const r = db.prepare(`SELECT id FROM rides WHERE rider_id = ? AND status IN ('SEARCHING','ACCEPTED','ARRIVED','ONGOING') ORDER BY requested_at DESC`).get(me.id);
    return ok(res, r ? rideView(r.id) : null);
  }

  if (p === '/api/rides' && m === 'GET') {
    const rows = db.prepare(`SELECT * FROM rides WHERE rider_id = ? ORDER BY requested_at DESC LIMIT 30`).all(me.id);
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

  if (p === '/api/wallet' && m === 'GET') {
    const txs = db.prepare('SELECT * FROM wallet_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 30').all(me.id);
    const bal = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(me.id).wallet_balance;
    return ok(res, { balance: bal, transactions: txs });
  }

  if (p === '/api/wallet/topup' && m === 'POST') {
    const { amount } = await readBody(req);
    const amt = Math.min(Math.max(Number(amount) || 0, 1), 10000);
    // PRODUCTION: create a Razorpay/Stripe order here and credit on webhook confirmation.
    const bal = ledger(me.id, 'topup', amt, 'added via UPI (demo gateway)');
    return ok(res, { balance: bal });
  }

  /* ================= DRIVER ================= */
  if (seg[1] === 'driver') {
    if (me.role !== 'driver') return bad(res, 'drivers only', 403);
    const d = db.prepare('SELECT * FROM drivers WHERE user_id = ?').get(me.id);

    if (p === '/api/driver/status' && m === 'POST') {
      const { online, lat, lng } = await readBody(req);
      if (online && d.kyc_status !== 'verified') return bad(res, `cannot go online — KYC status: ${d.kyc_status}`);
      db.prepare('UPDATE drivers SET is_online = ?, lat = COALESCE(?, lat), lng = COALESCE(?, lng), last_ping_at = ? WHERE user_id = ?')
        .run(online ? 1 : 0, lat, lng, now(), me.id);
      emitAdmins('driver_status', { driver_id: me.id, online: !!online });
      return ok(res, { online: !!online });
    }

    if (p === '/api/driver/ping' && m === 'POST') {
      const { lat, lng } = await readBody(req);
      db.prepare('UPDATE drivers SET lat = ?, lng = ?, last_ping_at = ? WHERE user_id = ?').run(lat, lng, now(), me.id);
      return ok(res, { ok: true });
    }

    if (p === '/api/driver/offer' && m === 'GET') return ok(res, pendingOfferFor(me.id));

    const act = seg[4]; // /api/driver/rides/:id/:action
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
      return ok(res, {
        driver: d, rating: me.rating, acceptance: acc,
        today: { trips: today.trips, earnings: earned(dayStart.getTime()) },
        week: { trips: week.trips, earnings: earned(weekStart) },
        balance: me.wallet_balance, recent,
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
        online_drivers: g('SELECT COUNT(*) c FROM drivers WHERE is_online = 1').c,
        total_drivers: g('SELECT COUNT(*) c FROM drivers').c,
        riders: g("SELECT COUNT(*) c FROM users WHERE role = 'rider'").c,
        gmv_today: g("SELECT COALESCE(SUM(fare_final),0) s FROM rides WHERE status='COMPLETED' AND completed_at >= ?", dayStart.getTime()).s,
        rides_today: g("SELECT COUNT(*) c FROM rides WHERE requested_at >= ?", dayStart.getTime()).c,
        completed_today: g("SELECT COUNT(*) c FROM rides WHERE status='COMPLETED' AND completed_at >= ?", dayStart.getTime()).c,
        cancelled_today: g("SELECT COUNT(*) c FROM rides WHERE status='CANCELLED' AND cancelled_at >= ?", dayStart.getTime()).c,
        kyc_pending: g("SELECT COUNT(*) c FROM drivers WHERE kyc_status = 'pending'").c,
        open_sos: g("SELECT COUNT(*) c FROM sos_events WHERE status = 'open'").c,
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
        SELECT id, name, phone, rating, rides_count, wallet_balance, status, created_at
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
      const s = Math.min(Math.max(Number(surge) || 1, 1), 3); // hard cap 3×
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
      const daily = db.prepare(`
        SELECT date(completed_at/1000,'unixepoch') day, COUNT(*) trips, COALESCE(SUM(fare_final),0) gross
        FROM rides WHERE status='COMPLETED' AND completed_at >= ? GROUP BY day ORDER BY day`).all(weekStart);
      const totals = db.prepare(`
        SELECT COALESCE(SUM(fare_final),0) gmv, COUNT(*) trips FROM rides WHERE status='COMPLETED'`).get();
      return ok(res, { by_category: byCat, daily, gmv: totals.gmv, trips: totals.trips, take_rate: 0.22, net: Math.round(totals.gmv * 0.22) });
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

    if (p === '/api/admin/audit' && m === 'GET') {
      return ok(res, db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 50').all());
    }
  }

  return bad(res, `no route: ${m} ${p}`, 404);
}
