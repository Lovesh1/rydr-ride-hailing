/* Ryder client SDK — auth, REST, SSE realtime.
   DEMO mode: on a static host (GitHub Pages) with no backend, all calls run
   against the embedded in-browser engine (assets/engine.js). */
const DEMO = typeof RyderEngine !== 'undefined' &&
  !/^(localhost|127\.|192\.168\.|10\.|0\.0\.0\.0)/.test(location.hostname);

const API = {
  tokenKey: 'rydr_token',
  get token() { try { return localStorage.getItem(this.tokenKey); } catch { return null; } },
  set token(v) { try { v ? localStorage.setItem(this.tokenKey, v) : localStorage.removeItem(this.tokenKey); } catch {} },

  async req(method, path, body) {
    if (DEMO) {
      const r = await RyderEngine.handle(method, path, body, this.token);
      if (r.status >= 400) { const e = new Error(r.data?.error || `HTTP ${r.status}`); e.status = r.status; throw e; }
      return r.data;
    }
    const res = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || `HTTP ${res.status}`); e.status = res.status; throw e; }
    return data;
  },
  get(p) { return this.req('GET', p); },
  post(p, b) { return this.req('POST', p, b || {}); },

  /* ---- realtime ---- */
  es: null,
  listeners: {},
  on(event, fn) { (this.listeners[event] ||= []).push(fn); },
  connect() {
    if (DEMO) {
      // engine pushes events directly; bridge them into the same listener map
      ['positions', 'ride', 'zone', 'sos', 'ticket', 'driver_status'].forEach(ev =>
        RyderEngine.on(ev, (data) => (this.listeners[ev] || []).forEach(fn => fn(data))));
      return;
    }
    if (this.es) this.es.close();
    if (!this.token) return;
    this.es = new EventSource(`/api/events?token=${encodeURIComponent(this.token)}`);
    const known = ['ride', 'offer', 'offer_closed', 'driver_pos', 'positions', 'sos', 'tip', 'kyc', 'zone', 'driver_status'];
    for (const ev of known) {
      this.es.addEventListener(ev, (e) => {
        let data; try { data = JSON.parse(e.data); } catch { return; }
        (this.listeners[ev] || []).forEach(fn => fn(data));
      });
    }
    this.es.onerror = () => { /* EventSource auto-reconnects */ };
  },
  logout() { this.token = null; if (this.es) this.es.close(); location.reload(); },
};

/* ---- tiny ui helpers ---- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (n) => '₹' + Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const timeAgo = (ts) => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

let __toastT;
function toast(msg, isErr = false) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.toggle('err', isErr);
  t.classList.add('show');
  clearTimeout(__toastT);
  __toastT = setTimeout(() => t.classList.remove('show'), 2600);
}

/* geo → screen projection for the stylised map.
   Fits a lat/lng bounding box into a container, returns %-coords. */
function makeProjection(points, pad = 0.14) {
  const lats = points.map(p => p.lat), lngs = points.map(p => p.lng);
  let minLat = Math.min(...lats), maxLat = Math.max(...lats);
  let minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const dLat = Math.max(maxLat - minLat, 0.01), dLng = Math.max(maxLng - minLng, 0.01);
  minLat -= dLat * pad; maxLat += dLat * pad; minLng -= dLng * pad; maxLng += dLng * pad;
  return (lat, lng) => ({
    x: ((lng - minLng) / (maxLng - minLng)) * 100,
    y: (1 - (lat - minLat) / (maxLat - minLat)) * 100,
  });
}
