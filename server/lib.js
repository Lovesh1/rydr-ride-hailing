// server/lib.js — shared utilities: ids, tokens, geo, http helpers
import crypto from 'node:crypto';

export const SECRET = process.env.RYDR_SECRET || 'rydr-dev-secret-change-in-prod';

export const uid = (prefix) =>
  `${prefix}_${crypto.randomBytes(6).toString('hex')}`;

export const now = () => Date.now();

/* ---------- tokens (HMAC-signed, JWT-style) ---------- */
export function signToken(payload, ttlMs = 1000 * 60 * 60 * 24 * 7) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: now() + ttlMs })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string' || token.length > 2048) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expect = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < now()) return null;
    return payload;
  } catch { return null; }
}

/* ---------- geo ---------- */
const R = 6371; // km
export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** step a point `frac` of the way toward target */
export function stepToward(lat, lng, tLat, tLng, stepKm) {
  const d = haversineKm(lat, lng, tLat, tLng);
  if (d <= stepKm || d === 0) return { lat: tLat, lng: tLng, arrived: true };
  const f = stepKm / d;
  return { lat: lat + (tLat - lat) * f, lng: lng + (tLng - lng) * f, arrived: false };
}

/* ---------- http helpers ---------- */
export function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

export const ok = (res, data) => json(res, 200, data);
export const bad = (res, msg, status = 400) => json(res, status, { error: msg });

export function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}

export function authUser(req) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : new URL(req.url, 'http://x').searchParams.get('token');
  return verifyToken(token);
}

/* ---------- misc ---------- */
export const otp4 = () => String(Math.floor(1000 + Math.random() * 9000));
export const otp6 = () => String(Math.floor(100000 + Math.random() * 900000));
export const round2 = (n) => Math.round(n * 100) / 100;
export const rupees = (n) => Math.round(n); // fares charged in whole rupees
