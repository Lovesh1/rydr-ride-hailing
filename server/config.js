// server/config.js — all runtime configuration in one place, env-driven.
// Every value has a safe default for local dev; production sets env vars.
const env = (k, d) => process.env[k] ?? d;
const num = (k, d) => Number(env(k, d));

export const CONFIG = {
  port: num('PORT', 4321),
  nodeEnv: env('NODE_ENV', 'development'),
  isProd: env('NODE_ENV', 'development') === 'production',

  // secrets — MUST be overridden in production (see docs/SECURITY.md §4)
  secret: env('RYDER_SECRET', 'ryder-dev-secret-change-in-prod'),

  // auth
  otpTtlMs: num('RYDER_OTP_TTL_MS', 5 * 60 * 1000),
  otpMaxAttempts: num('RYDER_OTP_MAX_ATTEMPTS', 5),
  tokenTtlMs: num('RYDER_TOKEN_TTL_MS', 7 * 24 * 3600 * 1000),
  exposeDemoOtp: env('RYDER_EXPOSE_DEMO_OTP', 'true') === 'true', // false once SMS gateway is wired

  // rate limits (requests per window) — see middleware.js
  rl: {
    otp:    { windowMs: 60_000, max: num('RL_OTP_PER_MIN', 5) },      // per phone+ip
    authIp: { windowMs: 60_000, max: num('RL_AUTH_IP_PER_MIN', 20) }, // per ip on /api/auth/*
    api:    { windowMs: 60_000, max: num('RL_API_PER_MIN', 240) },    // per user (or ip)
    admin:  { windowMs: 60_000, max: num('RL_ADMIN_PER_MIN', 600) },
  },

  // business
  takeRate: num('RYDER_TAKE_RATE', 0.22),
  timeScale: num('RYDR_TIME_SCALE', 18),
  botFleet: env('RYDER_BOT_FLEET', 'true') === 'true',

  // ops
  logLevel: env('LOG_LEVEL', 'info'),                 // debug|info|warn|error
  metricsEnabled: env('METRICS_ENABLED', 'true') === 'true',
  shutdownGraceMs: num('SHUTDOWN_GRACE_MS', 10_000),
};

if (CONFIG.isProd && CONFIG.secret === 'ryder-dev-secret-change-in-prod') {
  // refuse to boot with the dev secret in production
  console.error('[config] FATAL: RYDER_SECRET must be set in production');
  process.exit(1);
}
