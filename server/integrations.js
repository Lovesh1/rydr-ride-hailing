// server/integrations.js — real third-party providers, env-key driven.
// Every integration degrades gracefully: no key → built-in fallback keeps the
// platform fully working. Paste keys into .env (see .env.example) and restart.
import crypto from 'node:crypto';
import { log } from './logger.js';
import { round2 } from './lib.js';

const env = (k) => process.env[k] || null;

export const PROVIDERS = {
  get maps() { return env('GOOGLE_MAPS_API_KEY') ? 'google' : 'builtin'; },
  get sms() { return env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && env('TWILIO_FROM') ? 'twilio' : 'console'; },
  get payments() { return env('RAZORPAY_KEY_ID') && env('RAZORPAY_KEY_SECRET') ? 'razorpay' : 'demo'; },
};

/* ================================================================
   GOOGLE MAPS — place search + route distance/duration
   Enable: GOOGLE_MAPS_API_KEY  (Places API + Directions API enabled)
   ================================================================ */
const BLR = '12.9352,77.6245';

export async function searchPlaces(query, fallbackFn) {
  const key = env('GOOGLE_MAPS_API_KEY');
  if (!key) return fallbackFn();
  try {
    const url = 'https://maps.googleapis.com/maps/api/place/textsearch/json' +
      `?query=${encodeURIComponent(query || 'landmarks')}&location=${BLR}&radius=40000&region=in&key=${key}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const data = await r.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') throw new Error(data.status);
    return (data.results || []).slice(0, 8).map(p => ({
      name: p.name + (p.formatted_address ? ', ' + p.formatted_address.split(',')[0] : ''),
      lat: p.geometry.location.lat,
      lng: p.geometry.location.lng,
    }));
  } catch (e) {
    log.warn('maps.places_failed_fallback', { err: e.message });
    return fallbackFn();
  }
}

/** real road distance/duration via Directions API (supports stops); null → caller uses haversine model */
export async function routeViaGoogle(points) {
  const key = env('GOOGLE_MAPS_API_KEY');
  if (!key || points.length < 2) return null;
  try {
    const [origin, ...rest] = points;
    const dest = rest.pop();
    const way = rest.length ? `&waypoints=${rest.map(p => `${p.lat},${p.lng}`).join('|')}` : '';
    const url = 'https://maps.googleapis.com/maps/api/directions/json' +
      `?origin=${origin.lat},${origin.lng}&destination=${dest.lat},${dest.lng}${way}` +
      `&departure_time=now&key=${key}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const data = await r.json();
    const legs = data.routes?.[0]?.legs;
    if (data.status !== 'OK' || !legs?.length) throw new Error(data.status || 'no route');
    const meters = legs.reduce((s, l) => s + l.distance.value, 0);
    const secs = legs.reduce((s, l) => s + (l.duration_in_traffic?.value ?? l.duration.value), 0);
    return { distKm: round2(meters / 1000), durMin: Math.max(4, Math.round(secs / 60)) };
  } catch (e) {
    log.warn('maps.directions_failed_fallback', { err: e.message });
    return null;
  }
}

/* ================================================================
   TWILIO — OTP delivery over real SMS
   Enable: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (+1... number)
   With Twilio configured, demo OTPs stop appearing in API responses.
   ================================================================ */
export async function sendOtpSms(phone, code) {
  const sid = env('TWILIO_ACCOUNT_SID'), tok = env('TWILIO_AUTH_TOKEN'), from = env('TWILIO_FROM');
  if (!sid || !tok || !from) {
    log.info('sms.console_fallback', { phone: phone.slice(0, 6) + '…' });
    console.log(`[sms:console] OTP for ${phone}: ${code}`);
    return { delivered: false, provider: 'console' };
  }
  try {
    const body = new URLSearchParams({
      To: phone, From: from,
      Body: `${code} is your Ryder login code. Valid 5 minutes. Never share it.`,
    });
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${tok}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: AbortSignal.timeout(6000),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || `twilio ${r.status}`);
    log.info('sms.sent', { sid: data.sid });
    return { delivered: true, provider: 'twilio' };
  } catch (e) {
    log.error('sms.failed', { err: e.message });
    return { delivered: false, provider: 'twilio', error: e.message };
  }
}

/* ================================================================
   RAZORPAY — real wallet top-ups
   Enable: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
   Flow: POST /api/wallet/topup → order → client opens Razorpay Checkout with
   order_id + RAZORPAY_KEY_ID → Razorpay calls POST /api/webhooks/razorpay →
   signature verified → wallet credited exactly once (idempotent by payment id).
   ================================================================ */
export async function createTopupOrder(userId, amountRupees) {
  const id = env('RAZORPAY_KEY_ID'), secret = env('RAZORPAY_KEY_SECRET');
  if (!id || !secret) return null; // demo mode: caller credits instantly
  const r = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: Math.round(amountRupees * 100),   // paise
      currency: 'INR',
      receipt: `topup_${userId}_${Date.now()}`,
      notes: { user_id: userId, purpose: 'wallet_topup' },
    }),
    signal: AbortSignal.timeout(6000),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.description || `razorpay ${r.status}`);
  return { order_id: data.id, amount: amountRupees, currency: 'INR', key_id: id };
}

export function verifyRazorpayWebhook(rawBody, signature) {
  const secret = env('RAZORPAY_WEBHOOK_SECRET');
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signature), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
