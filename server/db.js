// server/db.js — SQLite schema + seed data (node:sqlite, zero deps)
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
import { uid, now } from './lib.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'ryder.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

/* ================= schema ================= */
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  name TEXT DEFAULT '',
  email TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'rider',        -- rider | driver | admin
  rating REAL DEFAULT 5.0,
  rating_count INTEGER DEFAULT 0,
  wallet_balance REAL DEFAULT 0,
  status TEXT DEFAULT 'active',              -- active | blocked
  rides_count INTEGER DEFAULT 0,
  referral_code TEXT UNIQUE,
  referred_by TEXT,
  prime_until INTEGER DEFAULT 0,             -- Ryder Prime membership expiry
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS otps (
  phone TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS drivers (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  category TEXT NOT NULL,                    -- bike | auto | mini | prime | suv | ev
  vehicle_make TEXT, plate TEXT,
  kyc_status TEXT DEFAULT 'pending',         -- pending | verified | rejected | suspended
  is_online INTEGER DEFAULT 0,
  is_bot INTEGER DEFAULT 0,
  lat REAL, lng REAL,
  current_ride_id TEXT,
  acceptance_accepted INTEGER DEFAULT 0,
  acceptance_offered INTEGER DEFAULT 0,
  earnings_total REAL DEFAULT 0,
  last_ping_at INTEGER
);

CREATE TABLE IF NOT EXISTS rides (
  id TEXT PRIMARY KEY,
  rider_id TEXT NOT NULL REFERENCES users(id),
  driver_id TEXT REFERENCES users(id),
  category TEXT NOT NULL,
  type TEXT DEFAULT 'city',                  -- city | rental | outstation
  trip_type TEXT,                            -- outstation: oneway | round
  package_id TEXT,                           -- rental package
  status TEXT NOT NULL,                      -- SCHEDULED|SEARCHING|ACCEPTED|ARRIVED|ONGOING|COMPLETED|CANCELLED|EXPIRED
  pickup_lat REAL, pickup_lng REAL, pickup_addr TEXT,
  drop_lat REAL, drop_lng REAL, drop_addr TEXT,
  stops TEXT DEFAULT '[]',                   -- JSON [{name,lat,lng}]
  otp TEXT,
  distance_km REAL, duration_min REAL,
  fare_quoted REAL, fare_final REAL,
  fare_breakdown TEXT,                       -- JSON of pricing components
  surge REAL DEFAULT 1.0,
  waiting_min REAL DEFAULT 0,
  promo_code TEXT, promo_discount REAL DEFAULT 0,
  payment_method TEXT DEFAULT 'wallet',
  scheduled_at INTEGER,
  cancel_reason TEXT, cancelled_by TEXT,
  requested_at INTEGER, accepted_at INTEGER, arrived_at INTEGER,
  started_at INTEGER, completed_at INTEGER, cancelled_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_rides_rider ON rides(rider_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_rides_driver ON rides(driver_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_rides_status ON rides(status);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  ride_id TEXT,
  type TEXT NOT NULL,                        -- topup | ride_charge | ride_earning | promo_credit | refund | tip | referral | prime
  amount REAL NOT NULL,
  balance_after REAL NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON wallet_ledger(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ratings (
  id TEXT PRIMARY KEY,
  ride_id TEXT UNIQUE NOT NULL REFERENCES rides(id),
  rater_id TEXT NOT NULL,
  ratee_id TEXT NOT NULL,
  stars INTEGER NOT NULL,
  tags TEXT DEFAULT '[]',
  comment TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS zones (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lat REAL NOT NULL, lng REAL NOT NULL, radius_km REAL NOT NULL,
  surge REAL DEFAULT 1.0,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS promos (
  code TEXT PRIMARY KEY,
  type TEXT NOT NULL,                        -- percent | flat
  value REAL NOT NULL,
  max_discount REAL,
  per_user_cap INTEGER DEFAULT 1,
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS saved_places (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  label TEXT NOT NULL,                       -- home | work | other
  name TEXT NOT NULL,
  lat REAL NOT NULL, lng REAL NOT NULL,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS emergency_contacts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  ride_id TEXT,
  type TEXT NOT NULL,                        -- lost_item | fare_dispute | driver_issue | other
  message TEXT DEFAULT '',
  status TEXT DEFAULT 'open',                -- open | resolved
  created_at INTEGER, resolved_at INTEGER
);

CREATE TABLE IF NOT EXISTS sos_events (
  id TEXT PRIMARY KEY,
  ride_id TEXT, raised_by TEXT,
  lat REAL, lng REAL,
  status TEXT DEFAULT 'open',
  created_at INTEGER, resolved_at INTEGER, resolved_by TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  admin_id TEXT, action TEXT, target TEXT, detail TEXT,
  created_at INTEGER
);
`);

/* ================= seed ================= */
const BLR = { lat: 12.9352, lng: 77.6245 };

export const PLACES = [
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

export const refCode = () => 'RYD' + crypto.randomBytes(3).toString('hex').toUpperCase();

function seeded() {
  return db.prepare('SELECT COUNT(*) AS c FROM zones').get().c > 0;
}

export function seed() {
  if (seeded()) return;
  const t = now();

  const zi = db.prepare('INSERT INTO zones (id,name,lat,lng,radius_km,surge,updated_at) VALUES (?,?,?,?,?,?,?)');
  zi.run(uid('zn'), 'Koramangala', 12.9345, 77.6192, 2.2, 1.0, t);
  zi.run(uid('zn'), 'Indiranagar', 12.9719, 77.6412, 2.0, 1.0, t);
  zi.run(uid('zn'), 'HSR Layout', 12.9116, 77.6474, 2.0, 1.0, t);
  zi.run(uid('zn'), 'Whitefield', 12.9698, 77.7500, 3.0, 1.0, t);
  zi.run(uid('zn'), 'CBD / MG Road', 12.9756, 77.6068, 2.5, 1.0, t);
  zi.run(uid('zn'), 'Electronic City', 12.8452, 77.6602, 3.0, 1.0, t);

  const pi = db.prepare('INSERT INTO promos (code,type,value,max_discount,per_user_cap,active) VALUES (?,?,?,?,?,?)');
  pi.run('FIRST50', 'percent', 50, 75, 3, 1);
  pi.run('RYDER20', 'flat', 20, 20, 5, 1);
  pi.run('WEEKEND25', 'percent', 25, 60, 2, 1);

  const adminId = uid('usr');
  db.prepare('INSERT INTO users (id,phone,name,role,referral_code,created_at) VALUES (?,?,?,?,?,?)')
    .run(adminId, '+919999900000', 'Ops Admin', 'admin', refCode(), t);

  const botNames = [
    ['Ramesh S.', 'auto', 'Bajaj RE', 'KA 01 AK 4796'],
    ['Meena J.', 'ev', 'Tata Tigor EV', 'KA 02 EV 1044'],
    ['Ganesh T.', 'mini', 'Maruti WagonR', 'KA 04 MM 7781'],
    ['Vijay K.', 'auto', 'Bajaj RE', 'KA 05 MN 2211'],
    ['Priya D.', 'mini', 'Hyundai i10', 'KA 03 QC 8890'],
    ['Arjun N.', 'bike', 'Hero Splendor', 'KA 09 XY 4412'],
    ['Suresh M.', 'prime', 'Honda City', 'KA 01 ZZ 9034'],
    ['Lakshmi R.', 'auto', 'Piaggio Ape', 'KA 02 AB 5521'],
    ['Farhan A.', 'bike', 'TVS Apache', 'KA 51 PQ 8080'],
    ['Divya S.', 'ev', 'MG Comet EV', 'KA 03 EV 2299'],
    ['Manoj P.', 'prime', 'Toyota Camry', 'KA 05 LX 0007'],
    ['Kiran B.', 'mini', 'Tata Tiago', 'KA 41 CD 6741'],
    ['Ravindra H.', 'suv', 'Toyota Innova', 'KA 01 SV 5566'],
    ['Sunitha K.', 'suv', 'Maruti Ertiga', 'KA 02 SV 8899'],
  ];
  const ui = db.prepare('INSERT INTO users (id,phone,name,role,rating,rating_count,referral_code,created_at) VALUES (?,?,?,?,?,?,?,?)');
  const di = db.prepare(`INSERT INTO drivers (user_id,category,vehicle_make,plate,kyc_status,is_online,is_bot,lat,lng,
    acceptance_accepted,acceptance_offered,earnings_total,last_ping_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  botNames.forEach(([name, cat, make, plate], i) => {
    const id = uid('usr');
    const rating = 4.5 + Math.random() * 0.5;
    ui.run(id, `+9190000000${String(10 + i)}`, name, 'driver', Math.round(rating * 100) / 100, 500 + i * 37, refCode(), t);
    di.run(id, cat, make, plate, 'verified', 1, 1,
      BLR.lat + (Math.random() - 0.5) * 0.09, BLR.lng + (Math.random() - 0.5) * 0.09,
      420 + i * 11, 460 + i * 12, 84000 + i * 4000, t);
  });

  const pend = [['Ravi Kumar', 'auto', 'Bajaj RE', 'KA 05 NN 3141'], ['Sneha G.', 'mini', 'Renault Kwid', 'KA 03 GH 7772']];
  pend.forEach(([name, cat, make, plate], i) => {
    const id = uid('usr');
    ui.run(id, `+9190000001${String(10 + i)}`, name, 'driver', 5.0, 0, refCode(), t);
    di.run(id, cat, make, plate, 'pending', 0, 0, BLR.lat, BLR.lng, 0, 0, 0, t);
  });

  console.log('[db] seeded zones, promos, admin (+919999900000), 14 bot drivers, 2 KYC applicants');
}

seed();
