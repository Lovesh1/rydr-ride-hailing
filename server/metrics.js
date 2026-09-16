// server/metrics.js — in-process Prometheus-format metrics.
// Exposes: request counters, latency histograms, business counters, process gauges.
// Scrape GET /metrics (see k8s/ manifests for the ServiceMonitor).

const counters = new Map();   // name{labels} -> n
const BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500];  // ms
const histos = new Map();     // route -> { buckets: number[], sum, count }

const key = (name, labels) =>
  name + '{' + Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',') + '}';

export function inc(name, labels = {}, n = 1) {
  const k = key(name, labels);
  counters.set(k, (counters.get(k) || 0) + n);
}

export function observeLatency(route, ms) {
  let h = histos.get(route);
  if (!h) { h = { buckets: Array(BUCKETS.length).fill(0), sum: 0, count: 0 }; histos.set(route, h); }
  h.sum += ms; h.count++;
  for (let i = 0; i < BUCKETS.length; i++) if (ms <= BUCKETS[i]) h.buckets[i]++;
}

/** normalize a URL path to a low-cardinality route label */
export function routeLabel(method, pathname) {
  const p = pathname
    .replace(/\/R_[a-z0-9]+/g, '/:rideId')
    .replace(/\/usr_[a-z0-9]+/g, '/:userId')
    .replace(/\/(zn|sos|tk|pl|ec|tx)_[a-z0-9]+/g, '/:id');
  return `${method} ${p}`;
}

export function renderPrometheus() {
  const out = [];
  out.push('# HELP ryder_http_requests_total HTTP requests by route and status');
  out.push('# TYPE ryder_http_requests_total counter');
  for (const [k, v] of counters) if (k.startsWith('ryder_http_requests_total')) out.push(`${k} ${v}`);

  out.push('# HELP ryder_business_events_total business events (rides, payments, auth)');
  out.push('# TYPE ryder_business_events_total counter');
  for (const [k, v] of counters) if (k.startsWith('ryder_business_events_total')) out.push(`${k} ${v}`);

  out.push('# HELP ryder_http_request_duration_ms request latency histogram');
  out.push('# TYPE ryder_http_request_duration_ms histogram');
  for (const [route, h] of histos) {
    let cum = 0;
    BUCKETS.forEach((b, i) => {
      cum = h.buckets[i]; // buckets already cumulative per observe loop above
      out.push(`ryder_http_request_duration_ms_bucket{route="${route}",le="${b}"} ${cum}`);
    });
    out.push(`ryder_http_request_duration_ms_bucket{route="${route}",le="+Inf"} ${h.count}`);
    out.push(`ryder_http_request_duration_ms_sum{route="${route}"} ${Math.round(h.sum)}`);
    out.push(`ryder_http_request_duration_ms_count{route="${route}"} ${h.count}`);
  }

  const mu = process.memoryUsage();
  out.push('# HELP ryder_process_rss_bytes resident memory');
  out.push('# TYPE ryder_process_rss_bytes gauge');
  out.push(`ryder_process_rss_bytes ${mu.rss}`);
  out.push('# HELP ryder_process_uptime_seconds uptime');
  out.push('# TYPE ryder_process_uptime_seconds gauge');
  out.push(`ryder_process_uptime_seconds ${Math.round(process.uptime())}`);
  return out.join('\n') + '\n';
}

/** quick snapshot used by /health and the load tester */
export function latencySnapshot() {
  const snap = {};
  for (const [route, h] of histos) {
    snap[route] = { count: h.count, avg_ms: h.count ? +(h.sum / h.count).toFixed(1) : 0 };
  }
  return snap;
}
