'use strict';

// ─── Runtime configuration store ────────────────────────────────────────────
// Admin-editable settings live in the `app_config` table (key → value).
// Every lookup falls back to the matching .env variable, so the app works
// out of the box and the admin panel can override/add keys at runtime
// without restarting the server.
//
// Async: getConfig() and setConfig() return promises (the DB layer is async
// so this also works against Turso on Render). Callers must await them.

const db = require('../db');

let cache = null;
let cacheAt = 0;
const CACHE_TTL_MS = 4000;

async function readAll() {
  const rows = await db.prepare('SELECT key, value FROM app_config').all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

async function getConfig() {
  const now = Date.now();
  if (!cache || now - cacheAt > CACHE_TTL_MS) {
    cache = await readAll();
    cacheAt = now;
  }
  const c = cache;
  return {
    googleClientId: c.google_client_id || process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: c.google_client_secret || process.env.GOOGLE_CLIENT_SECRET || '',
    appUrl: c.app_url || process.env.APP_URL || '',
    geminiKey: c.gemini_api_key || process.env.GEMINI_API_KEY || '',
    groqKey: c.groq_api_key || process.env.GROQ_API_KEY || '',
    groqModel: c.groq_model || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    resendKey: c.resend_api_key || process.env.RESEND_API_KEY || '',
    emailFrom: c.email_from || process.env.EMAIL_FROM || 'SAT Arena <onboarding@resend.dev>',
    adsEnabled: c.ads_enabled === '1' || String(process.env.ADS_ENABLED) === '1',
    adsCode: c.ads_code || process.env.ADS_CODE || '',
    adsNetwork: c.ads_network || 'custom', // 'custom' (snippet) | 'adsense' (auto ads)
    adsenseClient: c.adsense_client || process.env.ADSENSE_CLIENT || '',
    stripeKey: c.stripe_secret_key || process.env.STRIPE_SECRET_KEY || '',
    premiumPriceCents: parseInt(c.premium_price_cents || process.env.PREMIUM_PRICE_CENTS || '999', 10) || 999,
  };
}

// Save a batch of key→value entries. Empty/null values delete the row so the
// env fallback takes over again.
async function setConfig(entries) {
  const upsert = db.prepare(`
    INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `);
  for (const [k, v] of Object.entries(entries || {})) {
    if (v === null || v === undefined || String(v).trim() === '') {
      await db.prepare('DELETE FROM app_config WHERE key = ?').run(k);
    } else {
      await upsert.run(k, String(v).trim());
    }
  }
  cache = await readAll(); // refresh immediately so the next request sees the change
  cacheAt = Date.now();
}

// Mask a secret for display: "abc123…wxyz"
function maskSecret(v) {
  if (!v) return '';
  if (v.length <= 10) return '•'.repeat(Math.min(v.length, 8));
  return v.slice(0, 4) + '•'.repeat(Math.min(8, v.length - 8)) + v.slice(-4);
}

module.exports = { getConfig, setConfig, maskSecret };
