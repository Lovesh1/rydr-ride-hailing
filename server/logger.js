// server/logger.js — structured JSON logging (one line per event, machine-parseable).
// In production these lines ship to a log pipeline (Loki / CloudWatch / ELK).
import { CONFIG } from './config.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const min = LEVELS[CONFIG.logLevel] ?? 20;

function emit(level, msg, fields = {}) {
  if (LEVELS[level] < min) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level, msg, ...fields,
  });
  (level === 'error' ? process.stderr : process.stdout).write(line + '\n');
}

export const log = {
  debug: (msg, f) => emit('debug', msg, f),
  info:  (msg, f) => emit('info', msg, f),
  warn:  (msg, f) => emit('warn', msg, f),
  error: (msg, f) => emit('error', msg, f),
};
