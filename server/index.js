// server/index.js — HTTP server: static web clients + REST API + SSE
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import './db.js';
import { route } from './routes.js';
import { startSim } from './sim.js';
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
  try {
    if (url.pathname.startsWith('/api/')) return await route(req, res, url);

    // static
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
  ⚡ RYDR production server
  ─────────────────────────────
  app      http://localhost:${PORT}
  rider    http://localhost:${PORT}/rider
  driver   http://localhost:${PORT}/driver
  admin    http://localhost:${PORT}/admin   (login: +919999900000)
  api      http://localhost:${PORT}/api/*
  `);
  startSim();
});
