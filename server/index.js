// server/index.js — HTTP server: static web clients + REST API + SSE + schedulers
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import './db.js';
import { route } from './routes.js';
import { startSim } from './sim.js';
import { dispatchDueScheduled } from './rides.js';
import { bad } from './lib.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(__dirname, '..', 'web');
const PORT = process.env.PORT || 4321;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS — lets the Expo dev server (:8081) and native apps call the API.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  try {
    if (url.pathname.startsWith('/api/')) return await route(req, res, url);

    let file = url.pathname === '/' ? '/index.html' : url.pathname;
    if (!path.extname(file)) file += '.html';
    const full = path.normalize(path.join(WEB, file));
    if (!full.startsWith(WEB)) return bad(res, 'forbidden', 403);
    try {
      const data = await readFile(full);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404');
    }
  } catch (e) {
    console.error('[err]', req.method, url.pathname, e.message);
    if (!res.headersSent) bad(res, e.message || 'server error', 500);
  }
});

server.listen(PORT, () => {
  console.log(`
  ⚡ Ryder production server
  ─────────────────────────────
  web       http://localhost:${PORT}          (landing)
  admin     http://localhost:${PORT}/admin    (login: +919999900000)
  api       http://localhost:${PORT}/api/*
  mobile    Expo app in app-mobile/ (rider + driver)
  `);
  startSim();
  setInterval(() => {
    const n = dispatchDueScheduled();
    if (n) console.log(`[scheduler] dispatched ${n} scheduled ride(s)`);
  }, 15000);
});
