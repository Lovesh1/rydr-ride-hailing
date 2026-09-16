// server/sim.js — bot driver fleet: accepts offers, drives to pickup, runs trips
import { db } from './db.js';
import { stepToward, haversineKm, now } from './lib.js';
import { setOfferHook, acceptRide, declineRide, markArrived, startRide, completeRide, rideView } from './rides.js';
import { emitTo, emitAdmins } from './events.js';

const TICK_MS = 2000;
const TIME_SCALE = Number(process.env.RYDR_TIME_SCALE || 18); // demo speed-up (1 = real time)
const SPEED_KMH = 30 * TIME_SCALE;
const STEP_KM = SPEED_KMH / 3600 * (TICK_MS / 1000);
const CENTER = { lat: 12.9352, lng: 77.6245 };

const isBot = (userId) =>
  db.prepare('SELECT is_bot FROM drivers WHERE user_id = ?').get(userId)?.is_bot === 1;

/* bots respond to offers like humans: short think time, 90% accept */
setOfferHook((rideId, driverId) => {
  if (!isBot(driverId)) return;
  const thinkMs = 2000 + Math.random() * 3500;
  setTimeout(() => {
    try {
      if (Math.random() < 0.9) acceptRide(rideId, driverId);
      else declineRide(rideId, driverId);
    } catch { /* offer moved on */ }
  }, thinkMs);
});

const arrivedAtPickup = new Map(); // driverId -> ts when reached pickup (dwell before OTP start)

function tick() {
  const bots = db.prepare(`
    SELECT d.user_id, d.lat, d.lng, d.current_ride_id
    FROM drivers d WHERE d.is_bot = 1 AND d.is_online = 1`).all();

  const posBatch = [];

  for (const b of bots) {
    let target = null, phase = 'idle';
    let ride = null;

    if (b.current_ride_id) {
      ride = db.prepare('SELECT * FROM rides WHERE id = ?').get(b.current_ride_id);
      if (ride) {
        if (ride.status === 'ACCEPTED') { target = { lat: ride.pickup_lat, lng: ride.pickup_lng }; phase = 'to_pickup'; }
        else if (ride.status === 'ARRIVED') { phase = 'waiting'; }
        else if (ride.status === 'ONGOING') { target = { lat: ride.drop_lat, lng: ride.drop_lng }; phase = 'to_drop'; }
      }
    }

    let { lat, lng } = b;

    if (phase === 'idle') {
      // gentle random walk, pulled back toward the city center
      const pull = haversineKm(lat, lng, CENTER.lat, CENTER.lng) > 6 ? 0.4 : 0;
      lat += (Math.random() - 0.5 + (CENTER.lat - lat) * pull) * 0.0016;
      lng += (Math.random() - 0.5 + (CENTER.lng - lng) * pull) * 0.0016;
    } else if (target) {
      const s = stepToward(lat, lng, target.lat, target.lng, STEP_KM);
      lat = s.lat; lng = s.lng;
      if (s.arrived && phase === 'to_pickup') {
        try { markArrived(ride.id, b.user_id); arrivedAtPickup.set(b.user_id, now()); } catch {}
      }
      if (s.arrived && phase === 'to_drop') {
        try { completeRide(ride.id, b.user_id); } catch {}
      }
    } else if (phase === 'waiting') {
      // rider "boards" after a short dwell; bot enters the OTP it can read (simulating rider telling it)
      const since = arrivedAtPickup.get(b.user_id) || now();
      if (now() - since > 5000) {
        try { startRide(ride.id, b.user_id, ride.otp); arrivedAtPickup.delete(b.user_id); } catch {}
      }
    }

    db.prepare('UPDATE drivers SET lat = ?, lng = ?, last_ping_at = ? WHERE user_id = ?')
      .run(lat, lng, now(), b.user_id);
    posBatch.push({ driver_id: b.user_id, lat, lng, ride_id: b.current_ride_id });

    // stream position to the rider of an active trip
    if (ride && ['ACCEPTED', 'ARRIVED', 'ONGOING'].includes(ride.status)) {
      emitTo(ride.rider_id, 'driver_pos', { ride_id: ride.id, lat, lng, status: ride.status });
    }
  }

  if (posBatch.length) emitAdmins('positions', posBatch);
}

export function startSim() {
  setInterval(tick, TICK_MS);
  console.log(`[sim] bot fleet running · tick ${TICK_MS}ms · ${SPEED_KMH} km/h`);
}
