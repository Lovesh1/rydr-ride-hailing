/* Ryder embedded engine — the full platform logic running in the browser.
   Powers the free GitHub Pages deployment: same fare engine, matching cascade,
   bot-fleet simulation, wallet ledger and admin ops as server/, ported to an
   in-memory store persisted to localStorage. Attaches to globalThis.RyderEngine
   so both the Expo web bundle and the plain web console can use it.
   (For real multi-user service, run server/ — see render.yaml.) */
(function () {
  if (globalThis.RyderEngine) return;

  /* ================= utils ================= */
  const now = () => Date.now();
  let seq = 1000;
  const uid = (p) => `${p}_${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const round2 = (n) => Math.round(n * 100) / 100;
  const rupees = (n) => Math.round(n);
  const otp4 = () => String(Math.floor(1000 + Math.random() * 9000));
  const otp6 = () => String(Math.floor(100000 + Math.random() * 900000));
  const R = 6371;
  function havKm(a, b, c, d) {
    const dLat = (c - a) * Math.PI / 180, dLng = (d - b) * Math.PI / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function stepToward(lat, lng, tLat, tLng, stepKm) {
    const dd = havKm(lat, lng, tLat, tLng);
    if (dd <= stepKm || dd === 0) return { lat: tLat, lng: tLng, arrived: true };
    const f = stepKm / dd;
    return { lat: lat + (tLat - lat) * f, lng: lng + (tLng - lng) * f, arrived: false };
  }

  /* ================= pricing (ported from server/pricing.js) ================= */
  const RATE_CARD = {
    bike: { label: 'Bike', seats: 1, emoji: '🏍', base: 20, baseKm: 2, km1: 7, km1UpTo: 8, km2: 6, perMin: 0.75, minFare: 35, bookingFee: 5, waitPerMin: 1.0 },
    auto: { label: 'Auto', seats: 3, emoji: '🛺', base: 30, baseKm: 1.5, km1: 10, km1UpTo: 10, km2: 9, perMin: 1.0, minFare: 45, bookingFee: 8, waitPerMin: 1.5 },
    mini: { label: 'Mini', seats: 4, emoji: '🚗', base: 50, baseKm: 2, km1: 14, km1UpTo: 12, km2: 12, perMin: 1.5, minFare: 75, bookingFee: 12, waitPerMin: 2.0 },
    prime: { label: 'Prime Sedan', seats: 4, emoji: '🚘', base: 80, baseKm: 2, km1: 18, km1UpTo: 12, km2: 15, perMin: 2.0, minFare: 120, bookingFee: 15, waitPerMin: 2.5 },
    suv: { label: 'Prime SUV', seats: 6, emoji: '🚙', base: 110, baseKm: 2, km1: 23, km1UpTo: 12, km2: 19, perMin: 2.5, minFare: 170, bookingFee: 18, waitPerMin: 3.0 },
    ev: { label: 'EV', seats: 4, emoji: '⚡', base: 55, baseKm: 2, km1: 15, km1UpTo: 12, km2: 13, perMin: 1.5, minFare: 85, bookingFee: 12, waitPerMin: 2.0 },
  };
  const RENTAL_PACKAGES = [
    { id: '1h10', hours: 1, km: 10 }, { id: '2h20', hours: 2, km: 20 },
    { id: '4h40', hours: 4, km: 40 }, { id: '8h80', hours: 8, km: 80 }, { id: '12h120', hours: 12, km: 120 },
  ];
  const RENTAL_RATES = {
    mini: { perHour: 140, extraKm: 12, extraMin: 2.0 }, prime: { perHour: 190, extraKm: 15, extraMin: 2.5 },
    suv: { perHour: 260, extraKm: 19, extraMin: 3.0 }, ev: { perHour: 160, extraKm: 13, extraMin: 2.0 },
  };
  const OUTSTATION_RATES = {
    mini: { perKm: 11.5, allow: 300, minKm: 250 }, prime: { perKm: 14.5, allow: 400, minKm: 250 },
    suv: { perKm: 18, allow: 500, minKm: 300 },
  };
  const PARCEL_RATES = {
    small: { label: 'Small · up to 3 kg', base: 30, baseKm: 1.5, perKm: 8, minFare: 45 },
    medium: { label: 'Medium · up to 7 kg', base: 40, baseKm: 1.5, perKm: 10, minFare: 60 },
    large: { label: 'Large · up to 12 kg', base: 55, baseKm: 1.5, perKm: 12, minFare: 80 },
  };
  const GST = 0.05, NIGHT = 1.25, PRIME_OFF = 0.10, ROUTE_F = 1.35, SPEED = 22, TAKE = 0.22;
  const CO2_PER_KM = { bike: 0.045, auto: 0.062, mini: 0.125, prime: 0.155, suv: 0.185, ev: 0.015 };
  const CAR_BASELINE = 0.145;
  function co2ForRide(category, distKm) {
    const f = CO2_PER_KM[category] ?? CAR_BASELINE;
    return { emitted_kg: round2(f * (distKm || 0)), saved_kg: round2(Math.max(0, (CAR_BASELINE - f) * (distKm || 0))) };
  }

  const PLACES = [
    { name: 'HSR Layout, Sector 2', lat: 12.9116, lng: 77.6474 },
    { name: 'Koramangala 5th Block', lat: 12.9345, lng: 77.6192 },
    { name: 'Indiranagar 100 Ft Rd', lat: 12.9719, lng: 77.6412 },
    { name: 'MG Road Metro', lat: 12.9756, lng: 77.6068 },
    { name: 'Cubbon Park', lat: 12.9763, lng: 77.5929 },
    { name: 'UB City Mall', lat: 12.9718, lng: 77.5964 },
    { name: 'Phoenix Marketcity, Whitefield', lat: 12.9968, lng: 77.6966 },
    { name: 'Kempegowda Intl Airport (BLR)', lat: 13.1989, lng: 77.7068 },
    { name: 'Electronic City Phase 1', lat: 12.8452, lng: 77.6602 },
    { name: 'Lalbagh Botanical Garden', lat: 12.9507, lng: 77.5848 },
    { name: 'Church Street', lat: 12.9752, lng: 77.6033 },
    { name: 'Third Wave Coffee, HSR 27th Main', lat: 12.9137, lng: 77.6408 },
    { name: 'Mysuru (city centre)', lat: 12.2958, lng: 76.6394 },
    { name: 'Nandi Hills', lat: 13.3702, lng: 77.6835 },
  ];
  const HSR = PLACES[0];

  /* ================= state ================= */
  const KEY = 'ryder_demo_state_v1';
  let S = null;
  function fresh() {
    const bots = [
      ['Ramesh S.', 'auto', 'Bajaj RE', 'KA 01 AK 4796', 'male'],
      ['Meena J.', 'ev', 'Tata Tigor EV', 'KA 02 EV 1044', 'female'],
      ['Ganesh T.', 'mini', 'Maruti WagonR', 'KA 04 MM 7781', 'male'],
      ['Vijay K.', 'auto', 'Bajaj RE', 'KA 05 MN 2211', 'male'],
      ['Priya D.', 'mini', 'Hyundai i10', 'KA 03 QC 8890', 'female'],
      ['Arjun N.', 'bike', 'Hero Splendor', 'KA 09 XY 4412', 'male'],
      ['Suresh M.', 'prime', 'Honda City', 'KA 01 ZZ 9034', 'male'],
      ['Lakshmi R.', 'auto', 'Piaggio Ape', 'KA 02 AB 5521', 'female'],
      ['Farhan A.', 'bike', 'TVS Apache', 'KA 51 PQ 8080', 'male'],
      ['Divya S.', 'ev', 'MG Comet EV', 'KA 03 EV 2299', 'female'],
      ['Manoj P.', 'prime', 'Toyota Camry', 'KA 05 LX 0007', 'male'],
      ['Kiran B.', 'mini', 'Tata Tiago', 'KA 41 CD 6741', 'male'],
      ['Ravindra H.', 'suv', 'Toyota Innova', 'KA 01 SV 5566', 'male'],
      ['Sunitha K.', 'suv', 'Maruti Ertiga', 'KA 02 SV 8899', 'female'],
    ].map(([name, cat, make, plate, gender], i) => ({
      id: uid('usr'), name, phone: `+9190000000${10 + i}`, role: 'driver', gender,
      rating: round2(4.5 + Math.random() * 0.5), rating_count: 500 + i * 37,
      wallet_balance: 0, rides_count: 0, status: 'active',
      referral_code: 'RYDBOT' + i, prime_until: 0, postpaid_limit: 0, ride_prefs: {},
      driver: {
        category: cat, vehicle_make: make, plate, kyc_status: 'verified',
        is_online: 1, is_bot: 1,
        lat: HSR.lat + (Math.random() - 0.5) * 0.09, lng: HSR.lng + (Math.random() - 0.5) * 0.09,
        current_ride_id: null, acc_a: 420 + i * 11, acc_o: 460 + i * 12,
        earnings_total: 84000 + i * 4000, online_since: now(), goto: null,
      },
      created_at: now(),
    }));
    const admin = {
      id: uid('usr'), name: 'Ops Admin', phone: '+919999900000', role: 'admin', rating: 5,
      rating_count: 0, wallet_balance: 0, rides_count: 0, status: 'active',
      referral_code: 'RYDOPS1', prime_until: 0, postpaid_limit: 0, ride_prefs: {}, created_at: now(),
    };
    return {
      users: [...bots, admin], rides: [], ledger: [], otps: {}, tokens: {},
      zones: [
        { id: 'z1', name: 'Koramangala', lat: 12.9345, lng: 77.6192, r: 2.2, surge: 1 },
        { id: 'z2', name: 'Indiranagar', lat: 12.9719, lng: 77.6412, r: 2.0, surge: 1 },
        { id: 'z3', name: 'HSR Layout', lat: 12.9116, lng: 77.6474, r: 2.0, surge: 1 },
        { id: 'z4', name: 'Whitefield', lat: 12.9698, lng: 77.75, r: 3.0, surge: 1 },
        { id: 'z5', name: 'CBD / MG Road', lat: 12.9756, lng: 77.6068, r: 2.5, surge: 1 },
        { id: 'z6', name: 'Electronic City', lat: 12.8452, lng: 77.6602, r: 3.0, surge: 1 },
      ],
      saved: [], contacts: [], tickets: [], sos: [], favs: [], recents: [], fareLocks: {},
      promos: { FIRST50: { type: 'percent', value: 50, max: 75, cap: 3 }, RYDER20: { type: 'flat', value: 20, max: 20, cap: 5 } },
      offers: {}, // rideId -> {driverId, expiresAt}
    };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }
  function load() {
    try { S = JSON.parse(localStorage.getItem(KEY)); } catch {}
    if (!S || !S.users) S = fresh();
    if (!S.fareLocks) S.fareLocks = {};
    // runtime-only fields
    S.offers = {};
    for (const u of S.users) if (u.driver?.is_bot) u.driver.current_ride_id = null;
    for (const r of S.rides) if (['SEARCHING', 'ACCEPTED', 'ARRIVED', 'ONGOING'].includes(r.status)) r.status = 'CANCELLED';
  }
  load();

  const U = (id) => S.users.find(u => u.id === id);
  const byPhone = (ph) => S.users.find(u => u.phone === ph);
  const ride = (id) => S.rides.find(r => r.id === id);

  /* ================= events (SSE shim for admin console) ================= */
  const listeners = {};
  function emit(event, data) { (listeners[event] || []).forEach(fn => { try { fn(data); } catch {} }); }

  /* ================= pricing ================= */
  const isNight = () => { const h = new Date().getHours(); return h >= 23 || h < 5; };
  const isPrime = (u) => u && (u.prime_until || 0) > now();
  function surgeAt(lat, lng) {
    let s = 1, zone = null;
    for (const z of S.zones) if (havKm(lat, lng, z.lat, z.lng) <= z.r && z.surge > s) { s = z.surge; zone = z.name; }
    return { surge: s, zone };
  }
  function routeMetrics(points) {
    let d = 0;
    for (let i = 1; i < points.length; i++) d += havKm(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
    const distKm = round2(d * ROUTE_F);
    return { distKm, durMin: Math.max(4, Math.round(distKm / SPEED * 60)) };
  }
  function cityFare(cat, distKm, durMin, { surge = 1, night = false, prime = false } = {}) {
    const rc = RATE_CARD[cat]; if (!rc) return null;
    const chKm = Math.max(0, distKm - rc.baseKm);
    const s1 = Math.min(chKm, Math.max(0, rc.km1UpTo - rc.baseKm)), s2 = Math.max(0, chKm - s1);
    const base = rc.base, distC = round2(s1 * rc.km1 + s2 * rc.km2), timeC = round2(durMin * rc.perMin);
    let core = base + distC + timeC;
    const effS = prime ? 1 : surge;
    const surgeAmt = round2(core * (effS - 1)), nightAmt = night ? round2(core * (NIGHT - 1)) : 0;
    core += surgeAmt + nightAmt;
    let sub = Math.max(core, rc.minFare) + rc.bookingFee;
    const primeOff = prime ? round2(sub * PRIME_OFF) : 0;
    sub -= primeOff;
    const gst = round2(sub * GST);
    return { total: rupees(sub + gst), breakdown: {
      base_fare: base, distance_charge: distC, time_charge: timeC, booking_fee: rc.bookingFee,
      surge_multiplier: effS, surge_amount: surgeAmt, night_charge: nightAmt,
      waiting_charge: 0, prime_discount: -primeOff, gst } };
  }
  function estimateCity(points, user) {
    const { distKm, durMin } = routeMetrics(points);
    const { surge, zone } = surgeAt(points[0].lat, points[0].lng);
    const night = isNight(), prime = isPrime(user);
    return { type: 'city', distKm, durMin, surge, zone, night, prime, route_source: 'model',
      options: Object.keys(RATE_CARD).map(k => {
        const f = cityFare(k, distKm, durMin, { surge, night, prime });
        return { category: k, label: RATE_CARD[k].label, seats: RATE_CARD[k].seats, emoji: RATE_CARD[k].emoji,
          fare: f.total, breakdown: f.breakdown, etaMin: 2 + Math.floor(Math.random() * 5) };
      }) };
  }
  function estimateRentals(user) {
    const prime = isPrime(user), out = [];
    for (const pkg of RENTAL_PACKAGES) for (const [cat, r] of Object.entries(RENTAL_RATES)) {
      let price = r.perHour * pkg.hours;
      const po = prime ? round2(price * PRIME_OFF) : 0; price -= po;
      const gst = round2(price * GST);
      out.push({ package_id: pkg.id, hours: pkg.hours, km: pkg.km, category: cat,
        label: `${RATE_CARD[cat].label} · ${pkg.hours}h / ${pkg.km}km`, emoji: RATE_CARD[cat].emoji,
        fare: rupees(price + gst),
        breakdown: { package_price: r.perHour * pkg.hours, prime_discount: -po, extra_km_rate: r.extraKm, extra_min_rate: r.extraMin, gst } });
    }
    return { type: 'rental', prime, packages: RENTAL_PACKAGES, options: out };
  }
  function estimateOutstation(points, tripType, user) {
    let d = 0;
    for (let i = 1; i < points.length; i++) d += havKm(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
    const oneWayKm = round2(d * 1.25), prime = isPrime(user);
    return { type: 'outstation', trip_type: tripType, oneWayKm, durMin: Math.round(oneWayKm / 55 * 60), prime,
      options: Object.entries(OUTSTATION_RATES).map(([cat, r]) => {
        const billed = tripType === 'round' ? Math.max(oneWayKm * 2, r.minKm) : Math.max(oneWayKm, r.minKm * 0.6);
        const dc = round2(billed * r.perKm);
        let sub = dc + r.allow;
        const po = prime ? round2(sub * PRIME_OFF) : 0; sub -= po;
        const gst = round2(sub * GST);
        return { category: cat, label: RATE_CARD[cat].label, emoji: RATE_CARD[cat].emoji, fare: rupees(sub + gst),
          breakdown: { billed_km: billed, per_km: r.perKm, distance_charge: dc, driver_allowance: r.allow, prime_discount: -po, gst } };
      }) };
  }
  function estimateParcel(points, user) {
    const { distKm, durMin } = routeMetrics(points);
    const prime = isPrime(user);
    return { type: 'parcel', distKm, durMin, prime,
      options: Object.entries(PARCEL_RATES).map(([size, r]) => {
        const dc = round2(Math.max(0, distKm - r.baseKm) * r.perKm);
        let sub = Math.max(r.base + dc, r.minFare);
        const po = prime ? round2(sub * PRIME_OFF) : 0; sub -= po;
        const gst = round2(sub * GST);
        return { size, label: r.label, emoji: '📦', fare: rupees(sub + gst),
          breakdown: { base_fare: r.base, distance_charge: dc, prime_discount: -po, gst } };
      }) };
  }
  function applyPromo(code, user, fare) {
    if (!code) return { discount: 0 };
    const p = S.promos[(code || '').toUpperCase()];
    if (!p) return { discount: 0, error: 'invalid promo code' };
    const used = S.rides.filter(r => r.rider_id === user.id && r.promo_code === code.toUpperCase() && r.status === 'COMPLETED').length;
    if (used >= p.cap) return { discount: 0, error: `promo limit reached (${p.cap} uses)` };
    let d = p.type === 'percent' ? fare * (p.value / 100) : p.value;
    if (p.max) d = Math.min(d, p.max);
    return { discount: rupees(Math.min(d, fare)) };
  }

  /* ================= wallet ================= */
  function ledger(userId, type, amount, note, rideId = null) {
    const u = U(userId);
    u.wallet_balance = round2(u.wallet_balance + amount);
    S.ledger.unshift({ id: uid('tx'), user_id: userId, ride_id: rideId, type, amount,
      balance_after: u.wallet_balance, note, created_at: now() });
    return u.wallet_balance;
  }

  /* ================= rides ================= */
  function rideView(r) {
    if (!r) return null;
    const ru = U(r.rider_id), du = r.driver_id ? U(r.driver_id) : null;
    return { ...r,
      rider_name: r.guest_name || ru?.name, rider_rating: ru?.rating,
      driver_name: du?.name, driver_rating: du?.rating,
      vehicle_make: du?.driver?.vehicle_make, plate: du?.driver?.plate,
      driver_lat: du?.driver?.lat, driver_lng: du?.driver?.lng, driver_cat: du?.driver?.category };
  }
  function quoteFor(user, body) {
    const type = body.type || 'city';
    if (type === 'rental') {
      const opt = estimateRentals(user).options.find(o => o.package_id === body.package_id && o.category === body.category);
      if (!opt) throw new Error('unknown rental package/category');
      const pkg = RENTAL_PACKAGES.find(p => p.id === body.package_id);
      return { fare: opt.fare, surge: 1, distKm: pkg.km, durMin: pkg.hours * 60, breakdown: opt.breakdown };
    }
    if (type === 'outstation') {
      const est = estimateOutstation([body.pickup, body.drop], body.trip_type || 'oneway', user);
      const opt = est.options.find(o => o.category === body.category);
      if (!opt) throw new Error('category not available for outstation');
      return { fare: opt.fare, surge: 1, distKm: est.oneWayKm, durMin: est.durMin, breakdown: opt.breakdown };
    }
    if (type === 'parcel') {
      const est = estimateParcel([body.pickup, body.drop], user);
      const opt = est.options.find(o => o.size === (body.parcel_size || 'small'));
      return { fare: opt.fare, surge: 1, distKm: est.distKm, durMin: est.durMin, breakdown: opt.breakdown };
    }
    const points = [body.pickup, ...(body.stops || []), body.drop];
    const { distKm, durMin } = routeMetrics(points);
    const { surge } = surgeAt(body.pickup.lat, body.pickup.lng);
    const f = cityFare(body.category, distKm, durMin, { surge, night: isNight(), prime: isPrime(user) });
    if (!f) throw new Error('unknown category');
    if (body._locked_fare && body._locked_fare < f.total) {
      f.breakdown.fare_lock_saving = -(f.total - Math.round(body._locked_fare));
      return { fare: Math.round(body._locked_fare), surge, distKm, durMin, breakdown: f.breakdown };
    }
    return { fare: f.total, surge, distKm, durMin, breakdown: f.breakdown };
  }
  function createRide(user, body) {
    if (S.rides.some(r => r.rider_id === user.id && ['SEARCHING', 'ACCEPTED', 'ARRIVED', 'ONGOING'].includes(r.status)))
      throw new Error('you already have an active ride');
    const q = quoteFor(user, body);
    const { discount, error } = applyPromo(body.promo_code, user, q.fare);
    if (error && body.promo_code) throw new Error(error);
    const spendable = user.wallet_balance + (user.postpaid_limit || 0);
    if ((body.payment_method || 'wallet') === 'wallet' && spendable < q.fare - discount)
      throw new Error(`insufficient balance (₹${Math.round(user.wallet_balance)}) — top up or pay cash`);
    const isSched = body.scheduled_at && body.scheduled_at > now() + 60000;
    const r = {
      id: uid('R'), rider_id: user.id, category: body.type === 'parcel' ? 'bike' : body.category,
      type: body.type || 'city', trip_type: body.trip_type || null, package_id: body.package_id || null,
      status: isSched ? 'SCHEDULED' : 'SEARCHING',
      pickup_lat: body.pickup.lat, pickup_lng: body.pickup.lng, pickup_addr: body.pickup.name || 'Pickup',
      drop_lat: body.drop?.lat ?? body.pickup.lat, drop_lng: body.drop?.lng ?? body.pickup.lng,
      drop_addr: body.drop?.name || (body.type === 'rental' ? 'As directed (rental)' : 'Drop'),
      stops: body.stops || [], otp: otp4(),
      distance_km: q.distKm, duration_min: q.durMin,
      fare_quoted: q.fare - discount, fare_final: null, fare_breakdown: q.breakdown, surge: q.surge,
      promo_code: body.promo_code ? body.promo_code.toUpperCase() : null, promo_discount: discount,
      payment_method: body.payment_method || 'wallet',
      guest_name: body.guest_name || null, guest_phone: body.guest_phone || null,
      is_corporate: body.is_corporate ? 1 : 0, expense_code: body.expense_code || null,
      parcel_details: body.parcel || null, driver_id: null,
      scheduled_at: isSched ? body.scheduled_at : null, requested_at: now(),
      accepted_at: null, arrived_at: null, started_at: null, completed_at: null, cancelled_at: null,
      cancel_reason: null, cancelled_by: null, waiting_min: 0,
    };
    S.rides.unshift(r);
    save();
    return r;
  }
  function completeRide(r) {
    const fare = rupees(r.fare_quoted);
    r.status = 'COMPLETED'; r.fare_final = fare; r.completed_at = now();
    const du = U(r.driver_id);
    if (du?.driver) { du.driver.current_ride_id = null; du.driver.earnings_total += rupees(fare * (1 - TAKE)); }
    const ru = U(r.rider_id);
    if (ru) ru.rides_count++;
    if (r.payment_method === 'wallet' && ru) ledger(ru.id, 'ride_charge', -fare, `${r.pickup_addr} → ${r.drop_addr}`, r.id);
    if (du) ledger(du.id, 'ride_earning', rupees(fare * (1 - TAKE)), `trip ${r.id} (after 22% platform fee)`, r.id);
    if (r.promo_discount > 0 && ru) ledger(ru.id, 'promo_credit', 0, `promo ${r.promo_code} saved ₹${r.promo_discount}`, r.id);
    if (r.type === 'city' && ru) {
      S.recents = [{ user_id: ru.id, name: r.drop_addr, lat: r.drop_lat, lng: r.drop_lng, last_used: now() },
        ...S.recents.filter(x => !(x.user_id === ru.id && x.name === r.drop_addr))].slice(0, 40);
    }
    save();
  }
  function cancelRide(r, byRole, reason) {
    if (['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(r.status)) throw new Error('ride already closed');
    if (r.status === 'ONGOING' && byRole === 'rider') throw new Error('cannot cancel an ongoing ride');
    let fee = 0;
    if (byRole === 'rider' && r.driver_id && r.accepted_at && now() - r.accepted_at > 60000) {
      fee = 30;
      ledger(r.rider_id, 'ride_charge', -fee, 'late cancellation fee', r.id);
      ledger(r.driver_id, 'ride_earning', rupees(fee * (1 - TAKE)), 'cancellation compensation', r.id);
    }
    r.status = 'CANCELLED'; r.cancel_reason = reason || ''; r.cancelled_by = byRole; r.cancelled_at = now();
    const du = r.driver_id ? U(r.driver_id) : null;
    if (du?.driver) du.driver.current_ride_id = null;
    delete S.offers[r.id];
    save();
    return fee;
  }

  /* ================= simulation ================= */
  const TICK = 2000, SCALE = 18, STEP = 30 * SCALE / 3600 * (TICK / 1000);
  const arrivedAt = {};
  function pickBot(r) {
    const user = U(r.rider_id);
    const favs = S.favs.filter(f => f.user_id === r.rider_id).map(f => f.driver_id);
    let pool = S.users.filter(u => u.driver?.is_bot && u.driver.is_online && !u.driver.current_ride_id
      && u.driver.category === r.category && u.status === 'active');
    if (user?.ride_prefs?.prefer_woman_driver) {
      const women = pool.filter(u => u.gender === 'female');
      if (women.length) pool = women;
    }
    pool.sort((a, b) => {
      const sa = havKm(r.pickup_lat, r.pickup_lng, a.driver.lat, a.driver.lng) - (favs.includes(a.id) ? 2 : 0);
      const sb = havKm(r.pickup_lat, r.pickup_lng, b.driver.lat, b.driver.lng) - (favs.includes(b.id) ? 2 : 0);
      return sa - sb;
    });
    return pool[0] || null;
  }
  function tick() {
    // dispatch scheduled
    for (const r of S.rides) {
      if (r.status === 'SCHEDULED' && r.scheduled_at <= now() + 120000) r.status = 'SEARCHING';
    }
    // assign searching rides to bots (human drivers are offered via /api/driver/offer)
    for (const r of S.rides) {
      if (r.status !== 'SEARCHING') continue;
      if (S.offers[r.id]) continue;                    // pending human offer
      if (now() - r.requested_at < 3000) continue;     // brief realistic search
      // a human online idle driver of matching category gets first dibs
      const human = S.users.find(u => u.driver && !u.driver.is_bot && u.driver.is_online
        && !u.driver.current_ride_id && u.driver.category === r.category && u.driver.kyc_status === 'verified');
      if (human) { S.offers[r.id] = { driverId: human.id, expiresAt: now() + 15000 }; continue; }
      const bot = pickBot(r);
      if (!bot) { if (now() - r.requested_at > 30000) { r.status = 'EXPIRED'; save(); } continue; }
      r.status = 'ACCEPTED'; r.driver_id = bot.id; r.accepted_at = now();
      bot.driver.current_ride_id = r.id;
      save();
    }
    // expire stale human offers → fall back to bots next tick
    for (const [rid, o] of Object.entries(S.offers)) {
      if (o.expiresAt < now()) { delete S.offers[rid]; }
    }
    // move bots
    for (const u of S.users) {
      const d = u.driver;
      if (!d?.is_bot || !d.is_online) continue;
      let target = null, phase = 'idle';
      const r = d.current_ride_id ? ride(d.current_ride_id) : null;
      if (r) {
        if (r.status === 'ACCEPTED') { target = { lat: r.pickup_lat, lng: r.pickup_lng }; phase = 'to_pickup'; }
        else if (r.status === 'ARRIVED') phase = 'waiting';
        else if (r.status === 'ONGOING') { target = { lat: r.drop_lat, lng: r.drop_lng }; phase = 'to_drop'; }
      }
      if (phase === 'idle') {
        const pull = havKm(d.lat, d.lng, HSR.lat, HSR.lng) > 6 ? 0.4 : 0;
        d.lat += (Math.random() - 0.5 + (HSR.lat - d.lat) * pull) * 0.0016;
        d.lng += (Math.random() - 0.5 + (HSR.lng - d.lng) * pull) * 0.0016;
      } else if (target) {
        const s = stepToward(d.lat, d.lng, target.lat, target.lng, STEP);
        d.lat = s.lat; d.lng = s.lng;
        if (s.arrived && phase === 'to_pickup') { r.status = 'ARRIVED'; r.arrived_at = now(); arrivedAt[u.id] = now(); }
        if (s.arrived && phase === 'to_drop') completeRide(r);
      } else if (phase === 'waiting') {
        if (now() - (arrivedAt[u.id] || now()) > 5000) { r.status = 'ONGOING'; r.started_at = now(); delete arrivedAt[u.id]; }
      }
    }
    emit('positions', S.users.filter(u => u.driver?.is_online).map(u => ({
      driver_id: u.id, name: u.name, category: u.driver.category,
      lat: u.driver.lat, lng: u.driver.lng, ride_id: u.driver.current_ride_id })));
  }
  setInterval(tick, TICK);
  // simulated rider demand for HUMAN drivers: while a human is online+idle, requests appear
  setInterval(() => {
    const human = S.users.find(u => u.driver && !u.driver.is_bot && u.driver.is_online
      && !u.driver.current_ride_id && u.driver.kyc_status === 'verified');
    if (!human) return;
    if (Object.values(S.offers).some(o => o.driverId === human.id)) return;
    const from = PLACES[Math.floor(Math.random() * 6)], to = PLACES[6 + Math.floor(Math.random() * 5)];
    let simRider = S.users.find(u => u.phone === '+919111111111');
    if (!simRider) {
      simRider = { id: uid('usr'), name: 'Ishaan (demo rider)', phone: '+919111111111', role: 'rider', rating: 4.8,
        rating_count: 40, wallet_balance: 99999, rides_count: 12, status: 'active', referral_code: 'RYDSIM1',
        prime_until: 0, postpaid_limit: 0, ride_prefs: {}, created_at: now() };
      S.users.push(simRider);
    }
    try {
      const r = createRide(simRider, { pickup: from, drop: to, category: human.driver.category, payment_method: 'cash' });
      S.offers[r.id] = { driverId: human.id, expiresAt: now() + 15000 };
    } catch {}
  }, 22000);

  /* ================= auth ================= */
  function authUser(token) {
    const id = S.tokens[token];
    return id ? U(id) : null;
  }

  /* ================= api handler ================= */
  function json(status, data) { return { status, data }; }
  const ok = (d) => json(200, d);
  const bad = (msg, s = 400) => json(s, { error: msg });

  async function handle(method, path, body, token) {
    const url = new URL(path, 'http://demo');
    const p = url.pathname, seg = p.split('/').filter(Boolean);
    body = body || {};

    if (p === '/api/auth/otp' && method === 'POST') {
      if (!/^\+?[0-9]{10,14}$/.test(body.phone || '')) return bad('valid phone required');
      const code = otp6();
      S.otps[body.phone] = { code, exp: now() + 300000 };
      return ok({ sent: true, provider: 'demo', demo_otp: code });
    }
    if (p === '/api/auth/verify' && method === 'POST') {
      const o = S.otps[body.phone];
      if (!o || o.exp < now() || o.code !== String(body.otp)) return bad('incorrect OTP');
      delete S.otps[body.phone];
      let u = byPhone(body.phone);
      if (!u) {
        u = { id: uid('usr'), phone: body.phone, name: body.name || 'Ryder user',
          role: body.phone === '+919999900000' ? 'admin' : (body.role === 'driver' ? 'driver' : 'rider'),
          rating: 5, rating_count: 0, wallet_balance: 0, rides_count: 0, status: 'active',
          referral_code: 'RYD' + Math.random().toString(36).slice(2, 8).toUpperCase(),
          prime_until: 0, postpaid_limit: 0, ride_prefs: {}, gender: null, created_at: now() };
        if (u.role === 'rider') { S.users.push(u); ledger(u.id, 'topup', 500, 'welcome credit 🎁');
          if (body.referral) { const ref = S.users.find(x => x.referral_code === (body.referral || '').toUpperCase());
            if (ref) { ledger(u.id, 'referral', 100, `referred by ${ref.name}`); ledger(ref.id, 'referral', 100, 'friend joined with your code'); } } }
        else if (u.role === 'driver') {
          // demo convenience: instant verification so visitors can drive immediately
          u.driver = { category: 'auto', vehicle_make: 'Bajaj RE', plate: 'KA 00 DEMO 01', kyc_status: 'verified',
            is_online: 0, is_bot: 0, lat: HSR.lat, lng: HSR.lng, current_ride_id: null,
            acc_a: 0, acc_o: 0, earnings_total: 0, online_since: null, goto: null };
          S.users.push(u);
        } else S.users.push(u);
      }
      if (u.status === 'blocked') return bad('account blocked', 403);
      if (body.name) u.name = body.name;
      const t = 'demo.' + uid('tok');
      S.tokens[t] = u.id; save();
      return ok({ token: t, user: u, driver: u.driver || null });
    }

    const me = authUser(token);
    if (!me) return bad('unauthorized', 401);
    if (me.status === 'blocked') return bad('account blocked', 403);

    if (p === '/api/me') return ok({ user: me, driver: me.driver || null, prime: isPrime(me) });

    if (p === '/api/places') {
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const recents = q ? [] : S.recents.filter(x => x.user_id === me.id).slice(0, 4)
        .map(x => ({ name: x.name, lat: x.lat, lng: x.lng, recent: true }));
      const rest = PLACES.filter(pl => pl.name.toLowerCase().includes(q)).slice(0, 8);
      const seen = new Set(recents.map(r => r.name));
      return ok([...recents, ...rest.filter(r => !seen.has(r.name))].slice(0, 10));
    }

    if (p === '/api/fares/estimate') return ok(estimateCity([body.pickup, ...(body.stops || []), body.drop], me));
    if (p === '/api/fares/rentals') return ok(estimateRentals(me));
    if (p === '/api/fares/outstation') return ok(estimateOutstation([body.pickup, body.drop], body.trip_type || 'oneway', me));
    if (p === '/api/fares/parcel') return ok(estimateParcel([body.pickup, body.drop], me));

    if (p === '/api/rides' && method === 'POST') {
      try {
        const lock = S.fareLocks[me.id];
        if (lock && lock.expires_at > now() && (body.type || 'city') === 'city' && lock.category === body.category) {
          body._locked_fare = lock.fare;
          delete S.fareLocks[me.id];
        }
        return ok(rideView(createRide(me, body)));
      } catch (e) { return bad(e.message); }
    }
    if (p === '/api/rides/active') {
      const r = S.rides.find(x => x.rider_id === me.id && ['SEARCHING', 'ACCEPTED', 'ARRIVED', 'ONGOING'].includes(x.status));
      return ok(r ? rideView(r) : null);
    }
    if (p === '/api/rides/scheduled') return ok(S.rides.filter(x => x.rider_id === me.id && x.status === 'SCHEDULED'));
    if (p === '/api/rides' && method === 'GET') return ok(S.rides.filter(x => x.rider_id === me.id).slice(0, 30));

    if (seg[1] === 'rides' && seg[3] === 'cancel') {
      const r = ride(seg[2]); if (!r) return bad('not found', 404);
      try { const fee = cancelRide(r, me.driver ? 'driver' : 'rider', body.reason); return ok({ ...rideView(r), cancel_fee: fee }); }
      catch (e) { return bad(e.message); }
    }
    if (seg[1] === 'rides' && seg[3] === 'rate') {
      const r = ride(seg[2]); if (!r || r.status !== 'COMPLETED') return bad('ride not completed');
      const du = U(r.driver_id);
      if (du) { const c = du.rating_count + 1; du.rating = round2((du.rating * du.rating_count + Number(body.stars)) / c); du.rating_count = c; }
      save();
      return ok({ rating: du?.rating });
    }
    if (seg[1] === 'rides' && seg[3] === 'tip') {
      const r = ride(seg[2]); if (!r || r.status !== 'COMPLETED') return bad('ride not completed');
      const amt = Math.min(Math.max(Number(body.amount) || 0, 0), 500);
      if (me.wallet_balance < amt) return bad('insufficient balance');
      ledger(me.id, 'tip', -amt, `tip for ${U(r.driver_id)?.name}`, r.id);
      ledger(r.driver_id, 'tip', amt, 'rider tip 💚', r.id);
      return ok({ tipped: amt });
    }
    if (seg[1] === 'rides' && seg[3] === 'sos') {
      S.sos.unshift({ id: uid('sos'), ride_id: seg[2], raised_by: me.id, status: 'open', created_at: now() });
      save();
      return ok({ raised: true });
    }
    if (seg[1] === 'rides' && seg.length === 3) {
      const r = ride(seg[2]); if (!r) return bad('not found', 404);
      return ok(rideView(r));
    }

    if (p === '/api/wallet') {
      return ok({ balance: me.wallet_balance, transactions: S.ledger.filter(t => t.user_id === me.id).slice(0, 30) });
    }
    if (p === '/api/wallet/topup') {
      const amt = Math.min(Math.max(Number(body.amount) || 0, 1), 10000);
      return ok({ balance: ledger(me.id, 'topup', amt, 'added via UPI (demo)') });
    }
    if (p === '/api/prime/subscribe') {
      if (isPrime(me)) return bad('already a Prime member');
      if (me.wallet_balance < 149) return bad('needs ₹149 in wallet');
      ledger(me.id, 'prime', -149, 'Ryder Prime · 30 days');
      me.prime_until = now() + 30 * 864e5; save();
      return ok({ prime_until: me.prime_until });
    }
    if (p === '/api/postpaid/activate') {
      if (me.postpaid_limit > 0) return bad('Postpaid already active');
      if (me.rides_count < 1) return bad('complete at least 1 ride to unlock Postpaid');
      me.postpaid_limit = 500; save();
      return ok({ postpaid_limit: 500 });
    }
    /* Fare Lock */
    if (p === '/api/fares/lock' && method === 'GET') {
      const l = S.fareLocks[me.id];
      return ok(l && l.expires_at > now() ? l : null);
    }
    if (p === '/api/fares/lock' && method === 'POST') {
      if (!RATE_CARD[body.category] || !(body.fare > 0)) return bad('category and fare required');
      if (me.wallet_balance < 5) return bad('needs ₹5 in wallet to lock a fare');
      ledger(me.id, 'ride_charge', -5, `fare lock · ${RATE_CARD[body.category].label} @ ₹${Math.round(body.fare)}`);
      S.fareLocks[me.id] = { user_id: me.id, category: body.category, fare: body.fare,
        pickup_name: body.pickup_name || null, drop_name: body.drop_name || null, expires_at: now() + 30 * 60000 };
      save();
      return ok({ locked: true, ...S.fareLocks[me.id] });
    }

    /* Ryder Wrapped */
    if (p === '/api/me/wrapped') {
      const rides = S.rides.filter(r => r.rider_id === me.id && r.status === 'COMPLETED');
      let km = 0, spend = 0, promoSaved = 0, night = 0, co2e = 0, co2s = 0;
      const byCat = {}, byDrop = {}, days = new Set();
      for (const r of rides) {
        km += r.distance_km || 0; spend += r.fare_final || 0; promoSaved += r.promo_discount || 0;
        const h = new Date(r.completed_at).getHours();
        if (h >= 22 || h < 5) night++;
        byCat[r.category] = (byCat[r.category] || 0) + 1;
        byDrop[r.drop_addr] = (byDrop[r.drop_addr] || 0) + 1;
        const c = co2ForRide(r.category, r.distance_km);
        co2e += c.emitted_kg; co2s += c.saved_kg;
        days.add(new Date(r.completed_at).toDateString());
      }
      let streak = 0;
      for (let d = 0; d < 365; d++) {
        const day = new Date(Date.now() - d * 864e5).toDateString();
        if (days.has(day)) streak++;
        else if (d > 0) break;
      }
      const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      const tips = S.ledger.filter(t => t.user_id === me.id && t.type === 'tip' && t.amount < 0)
        .reduce((s, t) => s - t.amount, 0);
      return ok({
        name: me.name, rides: rides.length, km: Math.round(km), spend: Math.round(spend),
        promo_saved: Math.round(promoSaved), tips_given: Math.round(tips),
        night_rides: night, night_owl: night >= 3,
        top_category: top(byCat), top_place: top(byDrop),
        co2_emitted_kg: Math.round(co2e * 10) / 10, co2_saved_kg: Math.round(co2s * 10) / 10,
        coins: rides.reduce((s, r) => s + 5 + Math.floor((r.fare_final || 0) / 20), 0),
        streak_days: streak, active_days: days.size,
        member_since: me.created_at, rating: me.rating, prime: isPrime(me),
      });
    }

    if (p === '/api/preferences' && method === 'GET') return ok(me.ride_prefs || {});
    if (p === '/api/preferences' && method === 'POST') {
      const allowed = ['quiet', 'ac', 'luggage_help', 'prefer_woman_driver', 'auto_share'];
      me.ride_prefs = {};
      for (const k of allowed) if (typeof body[k] === 'boolean') me.ride_prefs[k] = body[k];
      save();
      return ok(me.ride_prefs);
    }
    if (p === '/api/favourites' && method === 'GET') {
      return ok(S.favs.filter(f => f.user_id === me.id).map(f => {
        const d = U(f.driver_id);
        return { driver_id: f.driver_id, name: d?.name, rating: d?.rating, vehicle_make: d?.driver?.vehicle_make, category: d?.driver?.category };
      }));
    }
    if (p === '/api/favourites' && method === 'POST') {
      if (body.remove) S.favs = S.favs.filter(f => !(f.user_id === me.id && f.driver_id === body.driver_id));
      else if (!S.favs.some(f => f.user_id === me.id && f.driver_id === body.driver_id))
        S.favs.push({ user_id: me.id, driver_id: body.driver_id });
      save();
      return ok({ favourited: !body.remove });
    }
    if (p === '/api/saved-places' && method === 'GET') return ok(S.saved.filter(x => x.user_id === me.id));
    if (p === '/api/saved-places' && method === 'POST') {
      S.saved = S.saved.filter(x => !(x.user_id === me.id && x.label === body.label));
      S.saved.push({ id: uid('pl'), user_id: me.id, ...body }); save();
      return ok({ saved: true });
    }
    if (seg[1] === 'saved-places' && method === 'DELETE') {
      S.saved = S.saved.filter(x => x.id !== seg[2]); save(); return ok({ deleted: true });
    }
    if (p === '/api/emergency-contacts' && method === 'GET') return ok(S.contacts.filter(x => x.user_id === me.id));
    if (p === '/api/emergency-contacts' && method === 'POST') {
      S.contacts.push({ id: uid('ec'), user_id: me.id, name: body.name, phone: body.phone }); save();
      return ok({ added: true });
    }
    if (seg[1] === 'emergency-contacts' && method === 'DELETE') {
      S.contacts = S.contacts.filter(x => x.id !== seg[2]); save(); return ok({ deleted: true });
    }
    if (p === '/api/tickets' && method === 'POST') {
      S.tickets.unshift({ id: uid('tk'), user_id: me.id, type: body.type, message: body.message || '', status: 'open', created_at: now() });
      save();
      return ok({ raised: true });
    }
    if (p === '/api/referral') {
      return ok({ code: me.referral_code, referred: 0, bonus_each: 100 });
    }
    if (p === '/api/me/delete') {
      if (body.confirm !== 'DELETE') return bad('pass {"confirm":"DELETE"} to erase your account');
      me.name = 'Deleted user'; me.status = 'blocked'; save();
      return ok({ deleted: true });
    }

    /* ---- driver ---- */
    if (seg[1] === 'driver') {
      if (!me.driver) return bad('drivers only', 403);
      const d = me.driver;
      if (p === '/api/driver/status') {
        if (body.online && d.kyc_status !== 'verified') return bad('KYC pending');
        d.is_online = body.online ? 1 : 0;
        d.online_since = body.online ? now() : null;
        save();
        return ok({ online: !!body.online });
      }
      if (p === '/api/driver/offer') {
        const e = Object.entries(S.offers).find(([, o]) => o.driverId === me.id);
        if (!e) return ok(null);
        const r = ride(e[0]);
        if (!r || r.status !== 'SEARCHING') { delete S.offers[e[0]]; return ok(null); }
        const v = rideView(r);
        v.rider_prefs = U(r.rider_id)?.ride_prefs || {};
        return ok(v);
      }
      if (p === '/api/driver/zones') return ok(S.zones.map(z => ({ name: z.name, lat: z.lat, lng: z.lng, surge: z.surge })).sort((a, b) => b.surge - a.surge));
      if (p === '/api/driver/goto') {
        if (body.clear) { d.goto = null; save(); return ok({ goto: null }); }
        d.goto = { lat: body.lat, lng: body.lng, expires_at: now() + 7200000, uses_left_today: 1 };
        save();
        return ok({ goto: d.goto });
      }
      if (seg[2] === 'rides') {
        const r = ride(seg[3]); if (!r) return bad('not found', 404);
        const act = seg[4];
        if (act === 'accept') {
          const o = S.offers[r.id];
          if (!o || o.driverId !== me.id || r.status !== 'SEARCHING') return bad('offer not available');
          delete S.offers[r.id];
          r.status = 'ACCEPTED'; r.driver_id = me.id; r.accepted_at = now();
          d.current_ride_id = r.id; d.acc_a++; d.acc_o++; save();
          return ok(rideView(r));
        }
        if (act === 'decline') { delete S.offers[r.id]; d.acc_o++; cancelRide(r, 'driver', 'declined (demo)'); return ok({ declined: true }); }
        if (act === 'arrived') { if (r.status !== 'ACCEPTED') return bad('bad state'); r.status = 'ARRIVED'; r.arrived_at = now(); save(); return ok(rideView(r)); }
        if (act === 'start') {
          if (!['ACCEPTED', 'ARRIVED'].includes(r.status)) return bad('bad state');
          if (String(body.otp) !== r.otp) return bad('incorrect OTP');
          r.status = 'ONGOING'; r.started_at = now(); save();
          return ok(rideView(r));
        }
        if (act === 'complete') { if (r.status !== 'ONGOING') return bad('bad state'); completeRide(r); return ok(rideView(r)); }
      }
      if (p === '/api/driver/summary') {
        const day = new Date(); day.setHours(0, 0, 0, 0);
        const mine = S.rides.filter(r => r.driver_id === me.id && r.status === 'COMPLETED');
        const today = mine.filter(r => r.completed_at >= day.getTime());
        const earned = (since) => S.ledger.filter(t => t.user_id === me.id && t.amount > 0 && t.created_at >= since)
          .reduce((s, t) => s + t.amount, 0);
        const hrs = d.is_online && d.online_since ? +((now() - d.online_since) / 3600000).toFixed(1) : 0;
        return ok({ driver: d, rating: me.rating, acceptance: d.acc_o ? Math.round(d.acc_a / d.acc_o * 100) : 100,
          today: { trips: today.length, earnings: earned(day.getTime()) },
          week: { trips: mine.length, earnings: earned(now() - 7 * 864e5) },
          balance: me.wallet_balance, recent: mine.slice(0, 10),
          hours_online: hrs, fatigue_alert: hrs >= 8, goto: d.goto && d.goto.expires_at > now() ? d.goto : null });
      }
    }

    /* ---- admin ---- */
    if (seg[1] === 'admin') {
      if (me.role !== 'admin') return bad('admins only', 403);
      if (p === '/api/admin/overview') {
        const day = new Date(); day.setHours(0, 0, 0, 0);
        const done = S.rides.filter(r => r.status === 'COMPLETED' && r.completed_at >= day.getTime());
        return ok({
          active_rides: S.rides.filter(r => ['SEARCHING', 'ACCEPTED', 'ARRIVED', 'ONGOING'].includes(r.status)).length,
          scheduled_rides: S.rides.filter(r => r.status === 'SCHEDULED').length,
          online_drivers: S.users.filter(u => u.driver?.is_online).length,
          total_drivers: S.users.filter(u => u.driver).length,
          riders: S.users.filter(u => u.role === 'rider').length,
          gmv_today: done.reduce((s, r) => s + r.fare_final, 0),
          rides_today: S.rides.filter(r => r.requested_at >= day.getTime()).length,
          completed_today: done.length,
          cancelled_today: S.rides.filter(r => r.status === 'CANCELLED' && r.cancelled_at >= day.getTime()).length,
          kyc_pending: 0, open_sos: S.sos.filter(s => s.status === 'open').length,
          open_tickets: S.tickets.filter(t => t.status === 'open').length,
        });
      }
      if (p === '/api/admin/rides') {
        const st = url.searchParams.get('status');
        return ok(S.rides.filter(r => !st || r.status === st).slice(0, 50).map(rideView));
      }
      if (p === '/api/admin/drivers') {
        return ok(S.users.filter(u => u.driver).map(u => ({
          id: u.id, name: u.name, phone: u.phone, rating: u.rating, status: u.status,
          category: u.driver.category, vehicle_make: u.driver.vehicle_make, plate: u.driver.plate,
          kyc_status: u.driver.kyc_status, is_online: u.driver.is_online, is_bot: u.driver.is_bot,
          earnings_total: u.driver.earnings_total, acceptance_accepted: u.driver.acc_a,
          acceptance_offered: u.driver.acc_o, current_ride_id: u.driver.current_ride_id })));
      }
      if (seg[2] === 'drivers' && seg[4] === 'kyc') {
        const u = U(seg[3]);
        if (u?.driver) { u.driver.kyc_status = body.action === 'suspend' ? 'suspended' : 'verified';
          if (body.action === 'suspend') u.driver.is_online = 0; save(); }
        return ok({ kyc_status: u?.driver?.kyc_status });
      }
      if (p === '/api/admin/riders') {
        return ok(S.users.filter(u => u.role === 'rider').map(u => ({
          id: u.id, name: u.name, phone: u.phone, rating: u.rating, rides_count: u.rides_count,
          wallet_balance: u.wallet_balance, status: u.status, prime_until: u.prime_until, created_at: u.created_at })));
      }
      if (seg[2] === 'users' && seg[4] === 'block') {
        const u = U(seg[3]); if (u) { u.status = body.blocked ? 'blocked' : 'active'; save(); }
        return ok({ status: u?.status });
      }
      if (p === '/api/admin/zones') return ok(S.zones.map(z => ({ ...z, radius_km: z.r })));
      if (seg[2] === 'zones' && seg[4] === 'surge') {
        const z = S.zones.find(x => x.id === seg[3]);
        if (z) { z.surge = Math.min(Math.max(Number(body.surge) || 1, 1), 3); save(); emit('zone', z); }
        return ok({ surge: z?.surge });
      }
      if (p === '/api/admin/analytics') {
        const t = now();
        const done = S.rides.filter(r => r.status === 'COMPLETED');
        const hourly = Array.from({ length: 24 }, (_, i) => {
          const from = t - (24 - i) * 3600e3, to = t - (23 - i) * 3600e3;
          return {
            hour: new Date(from).getHours(),
            requests: S.rides.filter(r => r.requested_at >= from && r.requested_at < to).length,
            completed: done.filter(r => r.completed_at >= from && r.completed_at < to).length,
          };
        });
        const daily = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i));
          const from = d.getTime(), to = from + 864e5;
          const rows = done.filter(r => r.completed_at >= from && r.completed_at < to);
          return { day: d.toLocaleDateString('en-IN', { weekday: 'short' }), trips: rows.length,
            gmv: Math.round(rows.reduce((s, r) => s + r.fare_final, 0)) };
        });
        const funnel = {
          requested: S.rides.length,
          matched: S.rides.filter(r => r.driver_id).length,
          started: S.rides.filter(r => r.started_at).length,
          completed: done.length,
        };
        const mixMap = {};
        for (const r of done) {
          (mixMap[r.category] ||= { category: r.category, trips: 0, gross: 0 });
          mixMap[r.category].trips++; mixMap[r.category].gross += r.fare_final;
        }
        const mix = Object.values(mixMap).map(m => ({ ...m, avg_fare: m.gross / m.trips })).sort((a, b) => b.trips - a.trips);
        const zones = S.zones.map(z => ({
          name: z.name, surge: z.surge,
          trips: done.filter(r => havKm(r.pickup_lat, r.pickup_lng, z.lat, z.lng) <= z.r).length,
        })).sort((a, b) => b.trips - a.trips);
        const leaderboard = S.users.filter(u => u.driver)
          .sort((a, b) => b.driver.earnings_total - a.driver.earnings_total).slice(0, 6)
          .map(u => ({ name: u.name, rating: u.rating, category: u.driver.category,
            earnings_total: u.driver.earnings_total,
            trips: done.filter(r => r.driver_id === u.id).length }));
        const green = done.reduce((acc, r) => {
          const c = co2ForRide(r.category, r.distance_km);
          acc.emitted += c.emitted_kg; acc.saved += c.saved_kg; return acc;
        }, { emitted: 0, saved: 0 });
        return ok({
          hourly, daily, funnel, mix, zones, leaderboard,
          green: { emitted_kg: Math.round(green.emitted * 10) / 10, saved_kg: Math.round(green.saved * 10) / 10 },
          avg_rating: 4.85, ratings_count: done.length,
          completion_rate: funnel.requested ? Math.round(funnel.completed / funnel.requested * 100) : 0,
        });
      }
      if (p === '/api/admin/revenue') {
        const done = S.rides.filter(r => r.status === 'COMPLETED');
        const group = (key) => Object.entries(done.reduce((m, r) => {
          (m[r[key]] ||= { trips: 0, gross: 0 }); m[r[key]].trips++; m[r[key]].gross += r.fare_final; return m;
        }, {})).map(([k, v]) => ({ [key]: k, ...v })).sort((a, b) => b.gross - a.gross);
        const gmv = done.reduce((s, r) => s + r.fare_final, 0);
        return ok({ by_category: group('category'), by_type: group('type'), daily: [],
          gmv, trips: done.length, take_rate: TAKE, net: Math.round(gmv * TAKE) });
      }
      if (p === '/api/admin/positions') {
        return ok(S.users.filter(u => u.driver?.is_online).map(u => ({
          user_id: u.id, name: u.name, category: u.driver.category,
          lat: u.driver.lat, lng: u.driver.lng, current_ride_id: u.driver.current_ride_id, is_online: 1 })));
      }
      if (p === '/api/admin/sos') {
        return ok(S.sos.map(s => ({ ...s, raised_by_name: U(s.raised_by)?.name })));
      }
      if (seg[2] === 'sos' && seg[4] === 'resolve') {
        const s = S.sos.find(x => x.id === seg[3]); if (s) { s.status = 'resolved'; save(); }
        return ok({ resolved: true });
      }
      if (p === '/api/admin/tickets') {
        return ok(S.tickets.map(t => ({ ...t, user_name: U(t.user_id)?.name })));
      }
      if (seg[2] === 'tickets' && seg[4] === 'resolve') {
        const t = S.tickets.find(x => x.id === seg[3]); if (t) { t.status = 'resolved'; save(); }
        return ok({ resolved: true });
      }
    }

    return bad(`no route: ${method} ${p}`, 404);
  }

  globalThis.RyderEngine = {
    handle,
    on(event, fn) { (listeners[event] ||= []).push(fn); },
    reset() { try { localStorage.removeItem(KEY); } catch {} S = fresh(); save(); },
  };
})();
