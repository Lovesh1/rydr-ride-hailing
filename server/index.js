// server/index.js — production HTTP server:
// static web + REST API + SSE, with health/readiness probes, Prometheus metrics,
// rate limiting, security headers, structured logs and graceful shutdown.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { db } from './db.js';
import { route } from './routes.js';
import { startSim } from './sim.js';
import { dispatchDueScheduled, rideCheckTick } from './rides.js';
import { bad, json, authUser } from './lib.js';
import { CONFIG } from './config.js';
import { log } from './logger.js';
import { renderPrometheus, latencySnapshot } from './metrics.js';
import { rateLimit, securityHeaders, instrument } from './middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(__dirname, '..', 'web');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

let ready = false;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS — lets the Expo dev server and native apps call the API.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  instrument(req, res, url);

  try {
    /* ---- ops endpoints (no auth, no rate limit) ---- */
    if (url.pathname === '/health') {
      return json(res, 200, { status: 'ok', uptime_s: Math.round(process.uptime()) });
    }
    if (url.pathname === '/ready') {
      try { db.prepare('SELECT 1').get(); return json(res, ready ? 200 : 503, { ready }); }
      catch { return json(res, 503, { ready: false, db: 'down' }); }
    }
    if (url.pathname === '/metrics' && CONFIG.metricsEnabled) {
      res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
      return res.end(renderPrometheus());
    }
    if (url.pathname === '/latency') {          // human-friendly snapshot for the load tester
      return json(res, 200, latencySnapshot());
    }

    /* ---- rate limiting ---- */
    if (url.pathname.startsWith('/api/') && url.pathname !== '/api/events') {
      const auth = authUser(req);
      const refusal = rateLimit(req, url.pathname, auth?.uid);
      if (refusal) {
        res.setHeader('Retry-After', String(refusal.retryAfter));
        return json(res, 429, { error: refusal.error });
      }
    }

    if (url.pathname.startsWith('/api/')) {
      securityHeaders(res, false);
      return await route(req, res, url);
    }

    /* ---- static web ---- */
    let file = url.pathname === '/' ? '/index.html' : url.pathname;
    if (!path.extname(file)) file += '.html';
    const full = path.normalize(path.join(WEB, file));
    if (!full.startsWith(WEB)) return bad(res, 'forbidden', 403);
    try {
      const data = await readFile(full);
      const ext = path.extname(full);
      securityHeaders(res, ext === '.html');
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404');
    }
  } catch (e) {
    log.error('unhandled', { m: req.method, p: url.pathname, err: e.message, stack: e.stack?.split('\n')[1]?.trim() });
    if (!res.headersSent) bad(res, CONFIG.isProd ? 'internal error' : e.message, 500);
  }
});

/* keep-alive tuning: keepAliveTimeout must exceed the LB's idle timeout - 1s */
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

const timers = [];
server.listen(CONFIG.port, () => {
  ready = true;
  log.info('ryder.server.started', {
    port: CONFIG.port, env: CONFIG.nodeEnv, pid: process.pid,
    admin: 'http://localhost:' + CONFIG.port + '/admin',
  });
  if (CONFIG.botFleet) startSim();
  timers.push(setInterval(() => {
    const n = dispatchDueScheduled();
    if (n) log.info('scheduler.dispatched', { rides: n });
  }, 15_000));
  timers.push(setInterval(rideCheckTick, 30_000));
});

/* ---- graceful shutdown: stop taking traffic, drain, close DB ---- */
function shutdown(sig) {
  log.info('shutdown.begin', { sig });
  ready = false;                       // readiness probe flips → LB drains us
  server.close(() => {
    timers.forEach(clearInterval);
    try { db.close(); } catch {}
    log.info('shutdown.clean', {});
    process.exit(0);
  });
  setTimeout(() => { log.warn('shutdown.forced', {}); process.exit(1); }, CONFIG.shutdownGraceMs).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (e) => log.error('unhandledRejection', { err: String(e) }));
