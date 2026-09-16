// server/middleware.js — rate limiting, security headers, request instrumentation.
import { CONFIG } from './config.js';
import { inc, observeLatency, routeLabel } from './metrics.js';
import { log } from './logger.js';

/* ================= rate limiting =================
   Sliding-window token buckets in memory. Single-node scope; at scale the same
   keys move to Redis (INCR + EXPIRE) so limits hold across replicas — the key
   scheme below is designed to port 1:1. */
const buckets = new Map(); // key -> { n, resetAt }
setInterval(() => {        // GC expired buckets
  const now = Date.now();
  for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
}, 60_000).unref();

function take(bucketKey, { windowMs, max }) {
  const now = Date.now();
  let b = buckets.get(bucketKey);
  if (!b || b.resetAt < now) { b = { n: 0, resetAt: now + windowMs }; buckets.set(bucketKey, b); }
  b.n++;
  return { allowed: b.n <= max, remaining: Math.max(0, max - b.n), resetAt: b.resetAt };
}

export function clientIp(req) {
  // trust the LB's X-Forwarded-For only for the first hop (see docs/SECURITY.md §6)
  const xff = req.headers['x-forwarded-for'];
  return (xff ? String(xff).split(',')[0].trim() : req.socket.remoteAddress) || 'unknown';
}

/** returns null if allowed, or a {status, error, retryAfter} refusal */
export function rateLimit(req, pathname, userId, body) {
  const ip = clientIp(req);
  let rule, bucketKey;
  if (pathname === '/api/auth/otp') {
    rule = CONFIG.rl.otp;
    bucketKey = `otp:${ip}:${body?.phone || ''}`;
  } else if (pathname.startsWith('/api/auth/')) {
    rule = CONFIG.rl.authIp;
    bucketKey = `auth:${ip}`;
  } else if (pathname.startsWith('/api/admin/')) {
    rule = CONFIG.rl.admin;
    bucketKey = `admin:${userId || ip}`;
  } else {
    rule = CONFIG.rl.api;
    bucketKey = `api:${userId || ip}`;
  }
  const r = take(bucketKey, rule);
  if (r.allowed) return null;
  inc('ryder_http_requests_total', { route: 'rate_limited', status: 429 });
  return { status: 429, error: 'too many requests — slow down', retryAfter: Math.ceil((r.resetAt - Date.now()) / 1000) };
}

/* ================= security headers ================= */
export function securityHeaders(res, isHtml) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), payment=()');
  if (CONFIG.isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (isHtml) {
    // pages use inline scripts/styles + Google Fonts; tighten further when assets move to files
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.fontshare.com",
      "font-src https://fonts.gstatic.com https://cdn.fontshare.com",
      "img-src 'self' data:",
      "connect-src 'self'",
    ].join('; '));
  }
}

/* ================= request instrumentation ================= */
export function instrument(req, res, url) {
  const start = process.hrtime.bigint();
  const route = routeLabel(req.method, url.pathname.startsWith('/api/') ? url.pathname : '/static');
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    inc('ryder_http_requests_total', { route, status: res.statusCode });
    observeLatency(route, ms);
    if (url.pathname.startsWith('/api/') && url.pathname !== '/api/events') {
      log[res.statusCode >= 500 ? 'error' : 'debug']('http', {
        m: req.method, p: url.pathname, s: res.statusCode, ms: +ms.toFixed(1), ip: clientIp(req),
      });
    }
  });
}
