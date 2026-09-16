// server/events.js — SSE hub: per-user channels + admin firehose
const clients = new Map(); // userId -> Set<res>
const admins = new Set();  // Set<res>

export function subscribe(userId, role, req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(':connected\n\n');

  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
  if (role === 'admin') admins.add(res);

  const ping = setInterval(() => { try { res.write(':ping\n\n'); } catch {} }, 20000);
  req.on('close', () => {
    clearInterval(ping);
    clients.get(userId)?.delete(res);
    if (clients.get(userId)?.size === 0) clients.delete(userId);
    admins.delete(res);
  });
}

function writeEvent(res, event, data) {
  try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch {}
}

/** send to one user (all their open tabs) */
export function emitTo(userId, event, data) {
  const set = clients.get(userId);
  if (set) for (const res of set) writeEvent(res, event, data);
}

/** send to all connected admins */
export function emitAdmins(event, data) {
  for (const res of admins) writeEvent(res, event, data);
}

/** send to everyone (rare) */
export function emitAll(event, data) {
  for (const set of clients.values()) for (const res of set) writeEvent(res, event, data);
}

export function connectedUserIds() { return [...clients.keys()]; }
