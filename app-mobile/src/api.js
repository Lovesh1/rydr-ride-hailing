// Ryder client SDK — REST + token storage + polling helpers
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef } from 'react';
import './engine'; // embedded engine (used only in hosted demo mode)

/* Where the Ryder server lives.
   - Expo web (local dev): talks to localhost directly.
   - Hosted static build (GitHub Pages): no server → the embedded engine
     (globalThis.RyderEngine) runs the entire platform in-browser.
   - Android emulator: 10.0.2.2 maps to the host machine.
   - Physical device: set your computer's LAN IP here (same wifi). */
const HOST_LAN_IP = '192.168.1.100'; // ← change for a real phone
export const DEMO_MODE =
  Platform.OS === 'web' &&
  typeof location !== 'undefined' &&
  !/^(localhost|127\.|192\.168\.|10\.|0\.0\.0\.0)/.test(location.hostname);
export const API_URL =
  Platform.OS === 'web' ? 'http://localhost:4321'
  : Platform.OS === 'android' ? 'http://10.0.2.2:4321'
  : `http://${HOST_LAN_IP}:4321`;

let _token = null;
export async function loadToken() {
  try { _token = await AsyncStorage.getItem('ryder_token'); } catch {}
  return _token;
}
export async function setToken(t) {
  _token = t;
  try { t ? await AsyncStorage.setItem('ryder_token', t) : await AsyncStorage.removeItem('ryder_token'); } catch {}
}
export const getToken = () => _token;

async function req(method, path, body) {
  if (DEMO_MODE && globalThis.RyderEngine) {
    const r = await globalThis.RyderEngine.handle(method, path, body, _token);
    if (r.status >= 400) { const e = new Error(r.data?.error || `HTTP ${r.status}`); e.status = r.status; throw e; }
    return r.data;
  }
  const res = await fetch(API_URL + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) { const e = new Error(data.error || `HTTP ${res.status}`); e.status = res.status; throw e; }
  return data;
}
export const api = {
  get: (p) => req('GET', p),
  post: (p, b) => req('POST', p, b || {}),
  del: (p) => req('DELETE', p),
};

/** poll `fn` every `ms` while the component is mounted (and `enabled`) */
export function usePoll(fn, ms, deps = [], enabled = true) {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const tick = async () => { if (live) { try { await saved.current(); } catch {} } };
    tick();
    const iv = setInterval(tick, ms);
    return () => { live = false; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, enabled, ...deps]);
}
