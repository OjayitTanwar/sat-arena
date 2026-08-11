'use strict';

// Load .env if present (Node >= 20.12 built-in)
try { process.loadEnvFile(); } catch { /* no .env file — fine */ }

const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');

const db = require('./db');
const { generateQuestion, generateQuestionByTopic, generateSet, generateTestModule, computeScaledScore, scoreBand } = require('./lib/questions');
const { levelProgress, xpAward, nextCombo, checkBadges, BADGES, levelFromXp, updateRating, nextDifficulty, proficiencyLevel, marksForAnswer, testGrade } = require('./lib/gamification');
const { tutorReply, tutorStatus } = require('./lib/ai-tutor');
const { getConfig, setConfig, maskSecret } = require('./lib/config');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_DAYS = 30;

// Cache of recently generated questions, so /api/answer can look them up
// without regenerating (ids are content hashes).
const questionCache = new Map();
const CACHE_MAX = 2000;

// Per-user sets of question ids already answered — gates combo-gem rewards so
// replaying one cached question can't farm gems. (In-memory is fine: a restart
// just allows the occasional duplicate, same as the question cache.)
const answeredQuestionIds = new Map();
const ANSWERED_CAP = 2000;

// Active practice-test sessions: token -> { modules, answers }
const testSessions = new Map();
const TEST_MAX = 100;

// ── Store catalog + gem economy ────────────────────────────────────────────
// Items are consumable power-ups bought with gems. The admin account gets
// everything for free (is_admin bypasses gem costs). Real-money gem packs go
// through Stripe Checkout when STRIPE_SECRET_KEY is configured.
const STORE_CATALOG = {
  hearts: { id: 'hearts', name: 'Heart refill', desc: 'Refill all hearts for your current round', price: 80, icon: 'heart' },
  hint: { id: 'hint', name: '50/50 hint', desc: 'Eliminate two wrong answers on a question', price: 60, icon: 'star' },
  freeze: { id: 'freeze', name: 'Streak freeze', desc: 'Protects your daily streak for one missed day', price: 150, icon: 'flame' },
  boost: { id: 'boost', name: 'XP boost', desc: 'Double XP on your next 10 questions', price: 200, icon: 'zap' },
  shield: { id: 'shield', name: 'Combo shield', desc: 'One wrong answer won\'t break your combo', price: 250, icon: 'trophy' },
};
const GEM_PACKS = [
  { id: 'pack_500', label: '500 gems', gems: 500, priceCents: 299 },
  { id: 'pack_1200', label: '1,200 gems', gems: 1200, priceCents: 599 },
  { id: 'pack_3000', label: '3,000 gems', gems: 3000, priceCents: 1299 },
];
const XP_BOOST_AMOUNT = 10; // questions a boost covers

// ── Subscription / free-tier limits ───────────────────────────────────────
// Free accounts get a small daily taste; premium unlocks everything.
const FREE_DAILY_QUESTIONS = 10;  // practice questions per day on the free tier
const FREE_TUTOR_DAILY = 3;       // AI tutor messages per day on the free tier

// Is this user on the premium tier? Admins always are. An admin grant sets
// premium_until to NULL (permanent); paid subscriptions set a real expiry.
function isPremium(user) {
  if (!user) return false;
  if (user.is_admin) return true;
  if (user.plan !== 'premium') return false;
  if (!user.premium_until) return true; // permanent (admin grant)
  return user.premium_until > new Date().toISOString();
}

async function todayAnswerCount(userId) {
  const r = await db.prepare("SELECT COUNT(*) as n FROM answers WHERE user_id = ? AND date(created_at) = date('now')").get(userId);
  return r ? r.n : 0;
}

async function todayTutorCount(userId) {
  const r = await db.prepare("SELECT COUNT(*) as n FROM tutor_log WHERE user_id = ? AND date(created_at) = date('now')").get(userId);
  return r ? r.n : 0;
}

// ── OTP (email verification + password reset) ──────────────────────────────
function generateOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

// Send an email. Three paths, in priority order:
//   1. SMTP (any provider — Gmail app password, SMTP2GO, Brevo, Zoho…) — free
//      and works TODAY without a verified domain, so it wins when configured.
//   2. Resend API (needs a verified sending domain for external recipients).
//   3. DEV mode: no provider configured — the code is returned in the
//      response so signup/reset flows still work locally.
async function sendEmail(to, subject, html) {
  const c = await getConfig();
  if (c.smtpHost && c.smtpUser) {
    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: c.smtpHost,
        port: c.smtpPort,
        secure: c.smtpSecure, // true for 465, false for 587 (STARTTLS)
        auth: { user: c.smtpUser, pass: c.smtpPass },
      });
      await transporter.sendMail({ from: c.smtpUser, to, subject, html });
      return { sent: true, dev: false, via: 'smtp' };
    } catch (e) {
      console.error('SMTP send failed:', e && e.message ? e.message : e);
      return { sent: false, dev: false, via: 'smtp' };
    }
  }
  if (!c.resendKey) return { sent: false, dev: true };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + c.resendKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: c.emailFrom, to, subject, html }),
    });
    if (!res.ok) {
      console.error('Resend error:', res.status, (await res.text()).slice(0, 200));
      return { sent: false, dev: false };
    }
    return { sent: true, dev: false, via: 'resend' };
  } catch (e) {
    console.error('Email send failed:', e && e.message ? e.message : e);
    return { sent: false, dev: false, via: 'resend' };
  }
}

async function issueOtp(email, purpose) {
  const code = generateOtp();
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  // one live code per email+purpose: delete older rows first
  await db.prepare('DELETE FROM otps WHERE email = ? AND purpose = ?').run(email, purpose);
  await db.prepare('INSERT INTO otps (email, code, purpose, expires_at) VALUES (?, ?, ?, ?)').run(email, code, purpose, expires);
  return code;
}

// Verify an OTP. On success the row is consumed (deleted). On failure the
// attempt counter climbs and the code dies after 5 wrong tries.
async function verifyOtp(email, purpose, code) {
  const row = await db.prepare('SELECT * FROM otps WHERE email = ? AND purpose = ?').get(email, purpose);
  if (!row) return { ok: false, error: 'No code was sent to that email. Request a new one.' };
  if (row.expires_at < new Date().toISOString()) {
    await db.prepare('DELETE FROM otps WHERE id = ?').run(row.id);
    return { ok: false, error: 'That code expired. Request a new one.' };
  }
  if (row.attempts >= 5) {
    await db.prepare('DELETE FROM otps WHERE id = ?').run(row.id);
    return { ok: false, error: 'Too many wrong attempts. Request a new code.' };
  }
  const clean = String(code || '').trim();
  if (clean !== row.code) {
    await db.prepare('UPDATE otps SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    return { ok: false, error: 'Incorrect code. Check it and try again.' };
  }
  await db.prepare('DELETE FROM otps WHERE id = ?').run(row.id);
  return { ok: true };
}

async function getItemQty(userId, itemId) {
  const row = await db.prepare('SELECT qty FROM user_items WHERE user_id = ? AND item_id = ?').get(userId, itemId);
  return row ? row.qty : 0;
}
async function addItem(userId, itemId, qty = 1) {
  await db.prepare(`INSERT INTO user_items (user_id, item_id, qty) VALUES (?, ?, ?)
    ON CONFLICT(user_id, item_id) DO UPDATE SET qty = qty + excluded.qty`).run(userId, itemId, qty);
}
async function consumeItem(userId, itemId, qty = 1) {
  const r = await db.prepare('UPDATE user_items SET qty = qty - ? WHERE user_id = ? AND item_id = ? AND qty >= ?')
    .run(qty, userId, itemId, qty);
  return r.changes === 1;
}
async function getGems(userId) {
  const row = await db.prepare('SELECT gems FROM users WHERE id = ?').get(userId);
  return row ? row.gems : 0;
}
async function awardGems(userId, amount, reason) {
  await db.prepare('UPDATE users SET gems = gems + ? WHERE id = ?').run(amount, userId);
  await db.prepare('INSERT INTO gem_tx (user_id, amount, reason) VALUES (?, ?, ?)').run(userId, amount, String(reason).slice(0, 80));
}
async function spendGems(userId, amount, reason) {
  const r = await db.prepare('UPDATE users SET gems = gems - ? WHERE id = ? AND gems >= ?').run(amount, userId, amount);
  if (r.changes !== 1) return false;
  await db.prepare('INSERT INTO gem_tx (user_id, amount, reason) VALUES (?, ?, ?)').run(userId, -amount, String(reason).slice(0, 80));
  return true;
}

// Daily-streak rollover with streak-freeze protection (consumes a freeze when
// a day is missed so the streak survives). Shared by login + answer paths.
async function nextDayStreak(user) {
  const today = new Date().toISOString().slice(0, 10);
  if (user.last_active === today) return { streak: user.streak, today, freezeUsed: false };
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  if (user.last_active === yesterday) return { streak: user.streak + 1, today, freezeUsed: false };
  const qty = await getItemQty(user.id, 'freeze');
  if (qty > 0) {
    await consumeItem(user.id, 'freeze', 1);
    return { streak: user.streak, today, freezeUsed: true };
  }
  return { streak: 1, today, freezeUsed: false };
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Helpers ────────────────────────────────────────────────────────────────

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(pw, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(pw, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex'));
}

function validateUsername(u) {
  return typeof u === 'string' && /^[a-zA-Z0-9_]{3,20}$/.test(u);
}
function validateEmail(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}
function validatePassword(p) {
  return typeof p === 'string' && p.length >= 6;
}

function publicUser(row) {
  const prog = levelProgress(row.xp);
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    xp: row.xp,
    level: prog.level,
    levelPct: prog.pct,
    streak: row.streak,
    best_streak: row.best_streak,
    target_date: row.target_date || null,
    daily_goal: row.daily_goal || 10,
    has_gemini_key: Boolean(row.gemini_key),
    is_admin: Boolean(row.is_admin),
    gems: row.gems || 0,
    xp_boost: row.xp_boost || 0,
    plan: row.plan || 'free',
    premium: isPremium(row),
    premium_until: row.premium_until || null,
    created_at: row.created_at,
  };
}

async function getSessionUser(req) {
  const token = req.cookies_token;
  if (!token) return null;
  const row = await db.prepare(`
    SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token);
  return row || null;
}

async function setSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  await db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires);
  res.setHeader('Set-Cookie', `sat_token=${token}; HttpOnly; Path=/; Max-Age=${SESSION_DAYS * 86400}; SameSite=Lax`);
}

async function authRequired(req, res, next) {
  let user;
  try {
    user = await getSessionUser(req);
  } catch (e) {
    // Express 4 doesn't catch async errors — keep the 500 contract instead
    // of leaving the client's request hanging.
    console.error('Auth lookup failed:', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Something went wrong.' });
  }
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  req.user = user;
  next();
}

async function adminRequired(req, res, next) {
  let user;
  try {
    user = await getSessionUser(req);
  } catch (e) {
    console.error('Admin auth lookup failed:', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Something went wrong.' });
  }
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  if (!user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  req.user = user;
  next();
}

// ── FormPost webhook (optional — logs auth events to formpost.ai) ──────────
const FORMPOST_URL = 'https://submit.formpost.ai/2usoeqa5';
function postToFormpost(data) {
  // Fire-and-forget — never blocks the response
  fetch(FORMPOST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(data),
  }).catch(() => {}); // silently ignore failures
}

// ── Cookie parsing (no extra dependency) ───────────────────────────────────
app.use((req, _res, next) => {
  const header = req.headers.cookie || '';
  const found = header.split(';').map((s) => s.trim()).find((s) => s.startsWith('sat_token='));
  req.cookies_token = found ? decodeURIComponent(found.slice('sat_token='.length)) : null;
  next();
});

// ── Auth routes ────────────────────────────────────────────────────────────

// Email signup requires a one-time passcode (sent by /api/auth/otp/request
// with purpose=signup) so accounts are only created from real inboxes.
app.post('/api/auth/signup', async (req, res) => {
  const { username, email, password, otp } = req.body || {};
  if (!validateUsername(username)) return res.status(400).json({ error: 'Username must be 3–20 characters (letters, numbers, underscore).' });
  if (!validateEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (!validatePassword(password)) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const exists = await db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (exists) return res.status(409).json({ error: 'That username or email is already registered.' });

  const v = await verifyOtp(String(email).toLowerCase(), 'signup', otp);
  if (!v.ok) return res.status(400).json({ error: v.error });

  const info = await db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)')
    .run(username, email.toLowerCase(), hashPassword(password));
  await setSession(res, info.lastInsertRowid);
  const row = await db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  postToFormpost({ type: 'signup', username, email, time: new Date().toISOString() });
  res.json({ user: publicUser(row) });
});

// Request a one-time passcode: purpose=signup (new accounts) or purpose=reset
// (existing accounts). When no email provider is configured the code comes
// back as `dev` so local/testing flows still work.
app.post('/api/auth/otp/request', async (req, res) => {
  const { email, purpose } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!validateEmail(cleanEmail)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  const purposeStr = purpose === 'reset' ? 'reset' : 'signup';

  if (purposeStr === 'signup') {
    const exists = await db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (exists) return res.status(409).json({ error: 'That email is already registered. Log in instead.' });
  } else {
    // reset: stay silent about unknown emails (no account enumeration)
    const exists = await db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (!exists) return res.json({ ok: true, dev: null, silent: true });
  }

  const code = await issueOtp(cleanEmail, purposeStr);
  const label = purposeStr === 'signup' ? 'create your SAT Arena account' : 'reset your SAT Arena password';
  const mail = await sendEmail(
    cleanEmail,
    purposeStr === 'signup' ? 'Your SAT Arena verification code' : 'Reset your SAT Arena password',
    `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto"><h2 style="color:#16a34a">SAT Arena</h2><p>Your code to ${label} is:</p><p style="font-size:32px;font-weight:bold;letter-spacing:6px;margin:18px 0">${code}</p><p>It expires in 10 minutes. If you didn't ask for this, you can safely ignore this email.</p></div>`
  );
  // Dev mode: surface the code so signup/reset works before a provider is added.
  res.json({ ok: true, dev: mail.dev ? code : null });
});

// Password reset: verify the emailed code, then set the new password and kill
// every active session so the old password stops working everywhere.
app.post('/api/auth/reset/confirm', async (req, res) => {
  const { email, otp, password } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!validateEmail(cleanEmail)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (!validatePassword(password)) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const v = await verifyOtp(cleanEmail, 'reset', otp);
  if (!v.ok) return res.status(400).json({ error: v.error });
  const user = await db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (!user) return res.status(400).json({ error: 'No account uses that email.' });

  await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), user.id);
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  postToFormpost({ type: 'password_reset', email: cleanEmail, time: new Date().toISOString() });
  res.json({ ok: true });
});

app.post('/api/auth/login', async (req, res) => {
  const { identifier, password } = req.body || {};
  const row = await db.prepare('SELECT * FROM users WHERE username = ? OR email = ?')
    .get(identifier, String(identifier || '').toLowerCase());
  if (!row || !verifyPassword(password || '', row.password_hash)) {
    return res.status(401).json({ error: 'Incorrect username/email or password.' });
  }
  // refresh daily streak on login if needed (streak freeze protects it)
  const today = new Date().toISOString().slice(0, 10);
  if (row.last_active !== today) {
    const s = await nextDayStreak(row);
    await db.prepare('UPDATE users SET streak = ?, last_active = ? WHERE id = ?').run(s.streak, today, row.id);
    row.streak = s.streak; row.last_active = today;
  }
  await setSession(res, row.id);
  postToFormpost({ type: 'login', identifier, time: new Date().toISOString() });
  res.json({ user: publicUser(row) });
});

app.post('/api/auth/logout', authRequired, async (req, res) => {
  await db.prepare('DELETE FROM sessions WHERE token = ?').run(req.cookies_token);
  res.setHeader('Set-Cookie', 'sat_token=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/me', async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) return res.json({ user: null });
  const c = await getConfig();
  res.json({
    user: publicUser(user),
    plan: {
      premium: isPremium(user),
      plan: user.plan || 'free',
      premium_until: user.premium_until || null,
      dailyUsed: await todayAnswerCount(user.id),
      dailyLimit: FREE_DAILY_QUESTIONS,
      tutorUsed: await todayTutorCount(user.id),
      tutorLimit: FREE_TUTOR_DAILY,
    },
    ads: isPremium(user) ? { enabled: false } : {
      enabled: c.adsEnabled,
      code: c.adsEnabled && c.adsNetwork !== 'adsense' ? c.adsCode : '',
      network: c.adsNetwork || 'custom',
      adsenseClient: c.adsEnabled && c.adsNetwork === 'adsense' ? c.adsenseClient : '',
    },
  });
});

// Current public tunnel URL (used by the local watchdog so you can always find
// the live link after a cloudflared restart rotates the trycloudflare host).
// Works only when the tunnel log path is available (local dev via launchd).
app.get('/api/live-url', (_req, res) => {
  const fs = require('node:fs');
  const LOG = process.env.TUNNEL_LOG || '/tmp/tunnel.log';
  try {
    const text = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8') : '';
    const urls = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g) || [];
    res.json({ url: urls.length ? urls[urls.length - 1] : null });
  } catch {
    res.json({ url: null });
  }
});

// ── Question routes ────────────────────────────────────────────────────────

// Generates questions ON THE SPOT — every request returns fresh, unique questions.
// ?section=math|reading, ?topic=<exact topic> for drills, ?count=1..5
// ?adaptive=1 uses the user's server-tracked adaptive difficulty; otherwise
// ?difficulty=1|2|3 forces a level explicitly.
app.get('/api/question', authRequired, async (req, res) => {
  // Free tier gets a daily question budget; premium is unlimited.
  if (!isPremium(req.user)) {
    const used = await todayAnswerCount(req.user.id);
    if (used >= FREE_DAILY_QUESTIONS) {
      return res.status(402).json({
        error: `You've used your ${FREE_DAILY_QUESTIONS} free questions today — go premium for unlimited practice.`,
        upgrade: true, code: 'daily_limit',
        plan: { dailyUsed: used, dailyLimit: FREE_DAILY_QUESTIONS },
      });
    }
  }
  const section = req.query.section; // 'math' | 'reading' | undefined (mixed)
  const topic = req.query.topic;
  const count = Math.min(parseInt(req.query.count, 10) || 1, 5);
  const adaptive = req.query.adaptive === '1' || req.query.adaptive === 'true';
  let difficulty = null;
  let adaptiveDiff = null;
  if (adaptive) {
    adaptiveDiff = nextDifficulty({ prev: req.user.adaptive_diff, rating: req.user.adaptive_rating });
    difficulty = adaptiveDiff;
    await db.prepare('UPDATE users SET adaptive_diff = ? WHERE id = ?').run(adaptiveDiff, req.user.id);
  } else if (req.query.difficulty) {
    difficulty = Math.min(Math.max(parseInt(req.query.difficulty, 10) || 2, 1), 3);
  }
  const questions = topic
    ? (() => {
        const seen = new Set();
        const out = [];
        let guard = 0;
        while (out.length < count && guard++ < count * 40) {
          const q = generateQuestionByTopic(topic, difficulty);
          if (seen.has(q.id)) continue;
          seen.add(q.id);
          out.push(q);
        }
        return out;
      })()
    : generateSet(count, section, difficulty);
  const payload = questions.map((q) => {
    questionCache.set(q.id, q); // keep answer for grading
    if (questionCache.size > CACHE_MAX) questionCache.delete(questionCache.keys().next().value);
    const { correctIndex, answer, ...rest } = q;
    return rest;
  });
  res.json({ questions: payload, adaptiveDiff, status: await tutorStatus({ geminiKey: req.user.gemini_key }) });
});

// grade a single answer (multiple choice via answerIndex, grid-in via answerValue)
app.post('/api/answer', authRequired, async (req, res) => {
  const { questionId, answerIndex, answerValue, timeMs, newRound } = req.body || {};

  // Server recomputes the exact same question from its id for integrity.
  const q = findQuestionById(questionId);
  if (!q) return res.status(404).json({ error: 'Question not found.' });

  let correct;
  if (q.type === 'grid') {
    if (typeof answerValue !== 'string') return res.status(400).json({ error: 'Missing answer.' });
    correct = normalizeNumber(answerValue) === normalizeNumber(q.answer);
  } else {
    if (typeof answerIndex !== 'number') return res.status(400).json({ error: 'Missing answer.' });
    correct = answerIndex === q.correctIndex;
  }
  const user = req.user;
  const today = new Date().toISOString().slice(0, 10);

  // Combo is tracked server-side so a scripted client can't fake it. A new
  // round (newRound flag from the client) resets the streak to 0 first — the
  // flag can only lower a combo, never raise it, so it isn't exploitable.
  // Combo shield (store item): a wrong answer consumes a shield instead of
  // breaking your combo — unless a brand-new round just started.
  let shieldUsed = false;
  let combo = nextCombo({ userCombo: user.combo, correct, newRound: Boolean(newRound) });
  if (!correct && !newRound) {
    const shieldQty = await getItemQty(user.id, 'shield');
    if (shieldQty > 0) {
      await consumeItem(user.id, 'shield', 1);
      combo = user.combo;
      shieldUsed = true;
    }
  }
  // XP boost (store item): double XP on the next N correct answers.
  let xp = xpAward({ correct, difficulty: q.difficulty, combo: combo > 1 ? combo - 1 : 0, timeMs });
  let boostUsed = false;
  if (correct && user.xp_boost > 0) {
    xp *= 2;
    boostUsed = true;
    await db.prepare('UPDATE users SET xp_boost = xp_boost - 1 WHERE id = ? AND xp_boost > 0').run(user.id);
  }
  const marks = marksForAnswer({ correct, difficulty: q.difficulty, timeMs }); // SAT-style marking
  await db.prepare('UPDATE users SET combo = ? WHERE id = ?').run(combo, user.id);

  // track answered question ids (gem-reward dedupe, capped per user)
  {
    let seen = answeredQuestionIds.get(user.id);
    if (!seen) { seen = new Set(); answeredQuestionIds.set(user.id, seen); }
    seen.add(questionId);
    if (seen.size > ANSWERED_CAP) { seen.clear(); seen.add(questionId); } // keep the newest
  }

  // fresh xp_boost value for the response (the pre-read one may be stale)
  const boostLeft = (await db.prepare('SELECT xp_boost FROM users WHERE id = ?').get(user.id))?.xp_boost || 0;

  // ── Adaptive difficulty: update the user's global skill rating, then derive
  // the difficulty for the NEXT question (moves at most one step per answer).
  const adaptiveRating = updateRating({ rating: user.adaptive_rating, correct, difficulty: q.difficulty });
  const adaptiveDiff = nextDifficulty({ prev: user.adaptive_diff, rating: adaptiveRating });
  await db.prepare('UPDATE users SET adaptive_rating = ?, adaptive_diff = ? WHERE id = ?')
    .run(adaptiveRating, adaptiveDiff, user.id);

  // ── Per-topic proficiency rating (same engine, scoped to this topic).
  const ts = await db.prepare('SELECT * FROM topic_stats WHERE user_id = ? AND topic = ?').get(user.id, q.topic);
  const profRating = updateRating({ rating: ts ? ts.rating : 50, correct, difficulty: q.difficulty });
  let profAttempts, profCorrect;
  if (ts) {
    await db.prepare('UPDATE topic_stats SET attempts = attempts + 1, correct = correct + ?, rating = ?, last_at = datetime(\'now\') WHERE id = ?')
      .run(correct ? 1 : 0, profRating, ts.id);
    profAttempts = ts.attempts + 1;
    profCorrect = ts.correct + (correct ? 1 : 0);
  } else {
    await db.prepare('INSERT INTO topic_stats (user_id, topic, attempts, correct, rating, last_at) VALUES (?, ?, 1, ?, ?, datetime(\'now\'))')
      .run(user.id, q.topic, correct ? 1 : 0, profRating);
    profAttempts = 1;
    profCorrect = correct ? 1 : 0;
  }
  const s = await nextDayStreak(user);
  const streak = s.streak;

  await db.prepare('UPDATE users SET xp = xp + ?, last_active = ?, streak = ? WHERE id = ?')
    .run(xp, today, streak, user.id);

  await db.prepare('INSERT INTO answers (user_id, section, topic, difficulty, correct, xp_earned, time_ms) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(user.id, q.section, q.topic, q.difficulty, correct ? 1 : 0, xp, timeMs || 0);

  // recompute aggregates
  const stats = await db.prepare(`
    SELECT COUNT(*) as total, SUM(correct) as correct,
           SUM(CASE WHEN section='math' THEN 1 ELSE 0 END) as mathCount,
           SUM(CASE WHEN section='reading' THEN 1 ELSE 0 END) as readingCount
    FROM answers WHERE user_id = ?
  `).get(user.id);
  const totalAnswered = stats.total;
  const totalCorrect = stats.correct || 0;
  const mathCount = stats.mathCount || 0;
  const readingCount = stats.readingCount || 0;

  const bestStreak = Math.max(user.best_streak, combo, correct ? 1 : 0);
  await db.prepare('UPDATE users SET best_streak = ? WHERE id = ?').run(bestStreak, user.id);

  const newXp = user.xp + xp;
  const level = levelFromXp(newXp);
  const leveledUp = level > user.level;
  await db.prepare('UPDATE users SET level = ? WHERE id = ?').run(level, user.id);

  // badges
  const newBadges = checkBadges({
    totalAnswered, totalCorrect, bestStreak, level, streak,
    mathCount, readingCount,
    perfectRound: correct && combo >= 4,
  });
  const newlyEarned = [];
  for (const badgeId of newBadges) {
    const result = await db.prepare('INSERT OR IGNORE INTO badges (user_id, badge_id) VALUES (?, ?)').run(user.id, badgeId);
    if (result.changes === 1) newlyEarned.push(badgeId); // actually newly inserted
  }

  // ── Gem economy rewards: combo streaks, level-ups, and new badges ──────
  // Combo gems are paid at most once per question id (tracked in memory) so
  // replaying a cached question can't farm gems — the questionCache keeps
  // questions by id, and the correct index comes back in the response.
  let gemsEarned = 0;
  if (correct && combo >= 4) {
    const seen = answeredQuestionIds.get(user.id);
    if (!seen || !seen.has(questionId)) {
      await awardGems(user.id, 10, 'combo x' + combo);
      gemsEarned += 10;
    }
  }
  if (leveledUp) { await awardGems(user.id, 50, 'level ' + level); gemsEarned += 50; }
  for (const b of newlyEarned) { await awardGems(user.id, 75, 'badge ' + b); gemsEarned += 75; }
  const gemsNow = await getGems(user.id);

  res.json({
    correct,
    correctIndex: q.correctIndex,
    answer: q.type === 'grid' ? q.answer : undefined,
    explanation: q.explanation,
    xpEarned: xp,
    marks,
    combo,
    leveledUp,
    level,
    newBadges: newlyEarned.map((id) => ({ id, ...BADGES[id] })),
    gems: gemsNow,
    gemsEarned,
    boostUsed,
    boostLeft: boostLeft,
    shieldUsed,
    stats: { totalAnswered, totalCorrect, xp: newXp, streak },
    adaptiveDiff,
    adaptiveRating: Math.round(adaptiveRating),
    proficiency: {
      topic: q.topic,
      rating: Math.round(profRating),
      level: proficiencyLevel(profRating),
      attempts: profAttempts,
      correct: profCorrect,
    },
  });
});

// normalize a numeric student response ("7.0" === "7", "3/4" === "0.75")
function normalizeNumber(v) {
  const s = String(v).trim();
  if (s.includes('/')) {
    const [n, d] = s.split('/').map((x) => parseFloat(x));
    if (!d) return null;
    const val = n / d;
    return Number.isFinite(val) ? val.toFixed(4) : null;
  }
  const num = parseFloat(s);
  return Number.isFinite(num) ? num.toFixed(4) : null;
}

// ── Full practice test (real digital-SAT length, adaptive modules) ────────
// Structure mirrors the actual digital SAT:
//   R&W Module 1 (27 Q) → R&W Module 2 (27 Q, difficulty set by Module 1)
//   Math Module 1 (27 Q) → Math Module 2 (27 Q, difficulty set by Module 1)
// Module 2 is generated on demand after Module 1 is submitted (between-module
// adaptivity, like Bluebook). Answers are included in the payload so students
// get instant feedback; the final score is computed server-side.

function testModulePayload(m) {
  return {
    key: m.key, name: m.name, section: m.section,
    questions: m.questions.map(({ correctIndex, answer, ...rest }) => ({ ...rest, _correct: correctIndex, _answer: answer })),
  };
}

function cacheQuestion(q) {
  questionCache.set(q.id, q);
  if (questionCache.size > CACHE_MAX) questionCache.delete(questionCache.keys().next().value);
}

const TEST_MODULE_ORDER = ['rw1', 'rw2', 'math1', 'math2'];

// Start the test: generate both Module 1s up front. All 4 modules share one
// `seen` set so the whole test contains 108 unique questions (real-SAT style).
app.post('/api/practice-test/start', authRequired, async (req, res) => {
  // Full-length practice tests are a premium feature.
  if (!isPremium(req.user)) {
    return res.status(402).json({ error: 'Full practice tests are for premium members. Upgrade to unlock.', upgrade: true, code: 'premium' });
  }
  const token = crypto.randomBytes(8).toString('hex');
  const seen = new Set();
  const rw1 = generateTestModule('reading', { key: 'rw1', name: 'Reading & Writing · Module 1', seen });
  const math1 = generateTestModule('math', { key: 'math1', name: 'Math · Module 1', seen });
  for (const m of [rw1, math1]) for (const q of m.questions) cacheQuestion(q);
  const session = { token, userId: req.user.id, startedAt: Date.now(), modules: { rw1, math1 }, levels: {}, seen };
  testSessions.set(token, session);
  if (testSessions.size > TEST_MAX) testSessions.delete(testSessions.keys().next().value);
  res.json({ token, modules: [testModulePayload(rw1), testModulePayload(math1)] });
});

// After a Module 1 is submitted, generate that section's Module 2. Its level
// is 'hard' when the student scored ≥70% on Module 1, else 'easy'.
app.post('/api/practice-test/next', authRequired, (req, res) => {
  const { token, moduleKey, answers } = req.body || {};
  const session = testSessions.get(token);
  if (!session || session.userId !== req.user.id) {
    return res.status(404).json({ error: 'Test session not found.' });
  }
  const prev = session.modules[moduleKey];
  if (!prev) return res.status(404).json({ error: 'Module not found.' });

  // Like the real SAT: every question counts — unanswered ones are wrong.
  let correct = 0, total = prev.questions.length;
  for (const q of prev.questions) {
    const a = answers ? answers[q.id] : undefined;
    if (a === undefined || a === null) continue;
    const ok = q.type === 'grid' ? normalizeNumber(a) === normalizeNumber(q.answer) : a === q.correctIndex;
    if (ok) correct++;
  }
  const level = total && correct / total >= 0.7 ? 'hard' : 'easy';
  const nextKey = moduleKey === 'rw1' ? 'rw2' : 'math2';
  const isReading = prev.section === 'reading';
  const next = generateTestModule(prev.section, {
    key: nextKey,
    name: isReading ? 'Reading & Writing · Module 2' : 'Math · Module 2',
    level,
    seen: session.seen, // never repeat questions from earlier modules
  });
  for (const q of next.questions) cacheQuestion(q);
  session.modules[nextKey] = next;
  session.levels[nextKey] = level;
  res.json({ module: testModulePayload(next), level });
});

// Score a completed practice test and persist it
app.post('/api/practice-test/score', authRequired, async (req, res) => {
  const { token, answers } = req.body || {};
  const session = testSessions.get(token);
  if (!session || session.userId !== req.user.id) {
    return res.status(404).json({ error: 'Test session not found.' });
  }

  let rwCorrect = 0, rwTotal = 0, mathCorrect = 0, mathTotal = 0;
  const detail = [];
  for (const key of TEST_MODULE_ORDER) {
    const module = session.modules[key];
    if (!module) continue;
    let modCorrect = 0;
    for (const q of module.questions) {
      const userAns = answers ? answers[q.id] : undefined;
      let correct = false;
      if (userAns !== undefined && userAns !== null) {
        if (q.type === 'grid') correct = normalizeNumber(userAns) === normalizeNumber(q.answer);
        else correct = userAns === q.correctIndex;
        // full-test answers also feed per-topic proficiency (skipped when unanswered)
        const ts = await db.prepare('SELECT * FROM topic_stats WHERE user_id = ? AND topic = ?').get(req.user.id, q.topic);
        const rating = updateRating({ rating: ts ? ts.rating : 50, correct, difficulty: q.difficulty });
        if (ts) await db.prepare('UPDATE topic_stats SET attempts = attempts + 1, correct = correct + ?, rating = ?, last_at = datetime(\'now\') WHERE id = ?')
          .run(correct ? 1 : 0, rating, ts.id);
        else await db.prepare('INSERT INTO topic_stats (user_id, topic, attempts, correct, rating, last_at) VALUES (?, ?, 1, ?, ?, datetime(\'now\'))')
          .run(req.user.id, q.topic, correct ? 1 : 0, rating);
      }
      if (correct) modCorrect++;
      detail.push({ id: q.id, section: q.section, topic: q.topic, correct, explanation: q.explanation });
    }
    if (module.section === 'reading') { rwCorrect += modCorrect; rwTotal += module.questions.length; }
    else { mathCorrect += modCorrect; mathTotal += module.questions.length; }
  }

  const scaled = computeScaledScore(rwCorrect, rwTotal, mathCorrect, mathTotal);
  const band = scoreBand(scaled.total);
  const grade = testGrade(scaled.total);
  await db.prepare('INSERT INTO test_scores (user_id, rw_correct, rw_total, math_correct, math_total, scaled_score) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.user.id, rwCorrect, rwTotal, mathCorrect, mathTotal, scaled.total);
  testSessions.delete(token);

  res.json({
    rw: { correct: rwCorrect, total: rwTotal },
    math: { correct: mathCorrect, total: mathTotal },
    scaled,
    band,
    grade,
    levels: session.levels || {},
    detail,
  });
});

// past test history
app.get('/api/practice-test/history', authRequired, async (req, res) => {
  const rows = await db.prepare('SELECT * FROM test_scores WHERE user_id = ? ORDER BY id DESC LIMIT 10').all(req.user.id);
  res.json({ history: rows });
});

// ── Leaderboard & dashboard ────────────────────────────────────────────────

app.get('/api/leaderboard', async (req, res) => {
  const rows = await db.prepare(`
    SELECT u.username, u.xp, u.level, u.streak, u.best_streak,
           (SELECT COUNT(*) FROM answers a WHERE a.user_id = u.id) as answered
    FROM users u ORDER BY u.xp DESC LIMIT 20
  `).all();
  res.json({ leaderboard: rows });
});

app.get('/api/dashboard', authRequired, async (req, res) => {
  const user = req.user;
  const cfg = await getConfig();
  const stats = await db.prepare(`
    SELECT COUNT(*) as total, SUM(correct) as correct, SUM(xp_earned) as xp
    FROM answers WHERE user_id = ?
  `).get(user.id);
  const bySection = await db.prepare(`
    SELECT section, COUNT(*) as n, SUM(correct) as correct FROM answers WHERE user_id = ? GROUP BY section
  `).all(user.id);
  const recent = await db.prepare('SELECT * FROM answers WHERE user_id = ? ORDER BY id DESC LIMIT 8').all(user.id);
  const badges = await db.prepare(`
    SELECT b.badge_id, b.earned_at FROM badges b WHERE b.user_id = ? ORDER BY b.id DESC
  `).all(user.id);
  const last7 = await db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as n, SUM(correct) as correct
    FROM answers WHERE user_id = ? AND created_at >= datetime('now', '-7 days')
    GROUP BY day ORDER BY day
  `).all(user.id);

  // today's progress vs goal
  const today = new Date().toISOString().slice(0, 10);
  const answeredToday = (await db.prepare(`
    SELECT COUNT(*) as n FROM answers WHERE user_id = ? AND date(created_at) = date('now')
  `).get(user.id)).n;
  let daysLeft = null;
  if (user.target_date) {
    daysLeft = Math.ceil((new Date(user.target_date + 'T00:00:00') - new Date()) / 864e5);
  }

  // weak topics (accuracy < 60%, min 2 attempts) — annotated with proficiency
  const weak = (await db.prepare(`
    SELECT a.topic, a.section, COUNT(*) as n, SUM(a.correct) as correct, ts.rating as rating
    FROM answers a
    LEFT JOIN topic_stats ts ON ts.user_id = a.user_id AND ts.topic = a.topic
    WHERE a.user_id = ?
    GROUP BY a.topic HAVING n >= 2 AND (SUM(a.correct) * 1.0 / COUNT(*)) < 0.6
    ORDER BY (SUM(a.correct) * 1.0 / COUNT(*)) ASC LIMIT 4
  `).all(user.id)).map((r) => {
    const rating = r.rating === null || r.rating === undefined ? 50 : r.rating;
    return {
      topic: r.topic,
      section: r.section,
      n: r.n,
      accuracy: Math.round((r.correct / r.n) * 100),
      proficiency: Math.round(rating),
      level: proficiencyLevel(rating),
    };
  });

  // top per-topic proficiency ratings (most-attempted first)
  const topics = (await db.prepare(`
    SELECT ts.topic, ts.attempts, ts.correct, ts.rating,
           (SELECT section FROM answers a WHERE a.user_id = ts.user_id AND a.topic = ts.topic LIMIT 1) as section
    FROM topic_stats ts WHERE ts.user_id = ?
    ORDER BY ts.attempts DESC, ts.rating DESC LIMIT 6
  `).all(user.id)).map((r) => ({
    topic: r.topic,
    section: r.section,
    attempts: r.attempts,
    correct: r.correct,
    rating: Math.round(r.rating),
    level: proficiencyLevel(r.rating),
  }));

  const testHistory = await db.prepare('SELECT scaled_score, rw_correct, rw_total, math_correct, math_total, created_at FROM test_scores WHERE user_id = ? ORDER BY id DESC LIMIT 3').all(user.id);

  // store summary (gem balance + owned items + active boosts)
  const inv = await db.prepare('SELECT item_id, qty FROM user_items WHERE user_id = ?').all(user.id);
  const items = {};
  for (const r of inv) items[r.item_id] = r.qty;

  res.json({
    user: publicUser(user),
    stats: {
      totalAnswered: stats.total || 0,
      totalCorrect: stats.correct || 0,
      accuracy: stats.total ? Math.round((stats.correct / stats.total) * 100) : 0,
      totalXp: stats.xp || 0,
      mathAnswered: (bySection.find((s) => s.section === 'math') || {}).n || 0,
      readingAnswered: (bySection.find((s) => s.section === 'reading') || {}).n || 0,
      answeredToday,
      dailyGoal: user.daily_goal || 10,
      goalPct: Math.min(100, Math.round((answeredToday / (user.daily_goal || 10)) * 100)),
      daysLeft,
      adaptiveDiff: user.adaptive_diff,
      adaptiveRating: Math.round(user.adaptive_rating),
    },
    badges: badges.map((b) => ({ id: b.badge_id, ...BADGES[b.badge_id] })),
    recent,
    last7,
    weak,
    topics,
    testHistory,
    tutor: await tutorStatus({ geminiKey: user.gemini_key }),
    store: { gems: user.gems || 0, xpBoost: user.xp_boost || 0, items, free: Boolean(user.is_admin) },
    plan: {
      premium: isPremium(user),
      plan: user.plan || 'free',
      premium_until: user.premium_until || null,
      dailyUsed: answeredToday,
      dailyLimit: FREE_DAILY_QUESTIONS,
      tutorUsed: await todayTutorCount(user.id),
      tutorLimit: FREE_TUTOR_DAILY,
    },
    ads: isPremium(user) ? { enabled: false } : {
      enabled: cfg.adsEnabled,
      code: cfg.adsEnabled && cfg.adsNetwork !== 'adsense' ? cfg.adsCode : '',
      network: cfg.adsNetwork || 'custom',
      adsenseClient: cfg.adsEnabled && cfg.adsNetwork === 'adsense' ? cfg.adsenseClient : '',
    },
  });
});

// ── Weak-area analytics ────────────────────────────────────────────────────

// Accuracy + proficiency per topic; returns weakest topics first (n >= 2 attempts)
app.get('/api/topics', authRequired, async (req, res) => {
  // Deep topic analytics is a premium feature.
  if (!isPremium(req.user)) {
    return res.status(402).json({ error: 'Topic analytics is a premium feature. Upgrade to unlock.', upgrade: true, code: 'premium' });
  }
  const rows = await db.prepare(`
    SELECT a.topic, a.section,
           COUNT(*) as n, SUM(a.correct) as correct,
           ts.rating as rating
    FROM answers a
    LEFT JOIN topic_stats ts ON ts.user_id = a.user_id AND ts.topic = a.topic
    WHERE a.user_id = ?
    GROUP BY a.topic HAVING n >= 2
    ORDER BY (SUM(a.correct) * 1.0 / COUNT(*)) ASC, n DESC
  `).all(req.user.id);
  const topics = rows.map((r) => {
    const rating = r.rating === null || r.rating === undefined ? 50 : r.rating;
    return {
      topic: r.topic,
      section: r.section,
      n: r.n,
      correct: r.correct || 0,
      accuracy: Math.round((r.correct / r.n) * 100),
      proficiency: Math.round(rating),
      level: proficiencyLevel(rating),
    };
  });
  const weak = topics.filter((t) => t.accuracy < 60);
  res.json({ topics, weak });
});

// ── Study plan / countdown ─────────────────────────────────────────────────

app.get('/api/study-plan', authRequired, async (req, res) => {
  const user = req.user;
  const today = new Date().toISOString().slice(0, 10);
  const answeredToday = (await db.prepare(`
    SELECT COUNT(*) as n FROM answers
    WHERE user_id = ? AND date(created_at) = date('now')
  `).get(user.id)).n;

  let daysLeft = null;
  if (user.target_date) {
    const target = new Date(user.target_date + 'T00:00:00');
    const now = new Date();
    daysLeft = Math.ceil((target - now) / 864e5);
  }

  res.json({
    target_date: user.target_date || null,
    days_left: daysLeft,
    daily_goal: user.daily_goal || 10,
    answered_today: answeredToday,
    goal_pct: Math.min(100, Math.round((answeredToday / (user.daily_goal || 10)) * 100)),
  });
});

app.post('/api/settings', authRequired, async (req, res) => {
  const { target_date, daily_goal, gemini_key } = req.body || {};

  // free AI key: stored locally per user; null/'' clears it
  if (gemini_key !== undefined) {
    const k = gemini_key === null || gemini_key === '' ? null : String(gemini_key).trim();
    if (k && k.length < 8) return res.status(400).json({ error: 'That API key looks too short.' });
    await db.prepare('UPDATE users SET gemini_key = ? WHERE id = ?').run(k, req.user.id);
  }

  const updates = [];
  const values = [];
  if (target_date !== undefined) {
    if (target_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(target_date)) {
      return res.status(400).json({ error: 'Invalid date.' });
    }
    updates.push('target_date = ?'); values.push(target_date);
  }
  if (daily_goal !== undefined) {
    const g = parseInt(daily_goal, 10);
    if (!Number.isFinite(g) || g < 1 || g > 200) return res.status(400).json({ error: 'Daily goal must be 1–200.' });
    updates.push('daily_goal = ?'); values.push(g);
  }
  if (!updates.length) {
    // only the AI key changed — return the refreshed user anyway
    const row = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    return res.json({ user: publicUser(row) });
  }
  values.push(req.user.id);
  await db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  const row = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(row) });
});

// ── AI Tutor ───────────────────────────────────────────────────────────────

app.post('/api/tutor', authRequired, async (req, res) => {
  const { message, history } = req.body || {};
  if (!message || !message.trim()) return res.status(400).json({ error: 'Empty message.' });
  // Free tier gets a few tutor messages a day; premium chats freely.
  if (!isPremium(req.user)) {
    const used = await todayTutorCount(req.user.id);
    if (used >= FREE_TUTOR_DAILY) {
      return res.status(402).json({
        error: `You've used your ${FREE_TUTOR_DAILY} free tutor messages today — go premium for unlimited tutoring.`,
        upgrade: true, code: 'tutor_limit',
        plan: { tutorUsed: used, tutorLimit: FREE_TUTOR_DAILY },
      });
    }
  }
  try {
    const result = await tutorReply(message.slice(0, 2000), Array.isArray(history) ? history : [], {
      geminiKey: req.user.gemini_key,
    });
    await db.prepare('INSERT INTO tutor_log (user_id) VALUES (?)').run(req.user.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Tutor unavailable right now. Try again.' });
  }
});

app.get('/api/tutor/status', authRequired, async (req, res) => {
  res.json(await tutorStatus({ geminiKey: req.user.gemini_key }));
});

// ── Store (gems, items) ──────────────────────────────────────────────────
// Everything is free — no premium tier, no paywalls. Gems are a fun earned
// currency shown in the top bar; every power-up can be claimed and used at
// no cost so practice is never blocked.
app.get('/api/store', authRequired, async (req, res) => {
  const items = {};
  for (const id of Object.keys(STORE_CATALOG)) items[id] = await getItemQty(req.user.id, id);
  res.json({
    gems: await getGems(req.user.id),
    xpBoost: req.user.xp_boost || 0,
    free: true, // always free for everyone
    paymentConfigured: false,
    catalog: Object.values(STORE_CATALOG).map((c) => ({ ...c, owned: items[c.id] || 0, price: 0 })),
    packs: [], // no real-money packs
  });
});

app.post('/api/store/buy', authRequired, async (req, res) => {
  const { itemId } = req.body || {};
  const item = STORE_CATALOG[itemId];
  if (!item) return res.status(400).json({ error: 'Unknown item.' });
  // Free for everyone — no gems needed.
  await addItem(req.user.id, itemId, 1);
  return res.json({ ok: true, free: true, itemId, qty: await getItemQty(req.user.id, itemId), gems: await getGems(req.user.id) });
});

// Use a power-up. Hearts refill a round; hints 50/50 a question; boost
// activates double XP. All free — inventory is just a fun counter.
app.post('/api/store/use', authRequired, async (req, res) => {
  const { itemId, questionId } = req.body || {};
  if (itemId === 'hearts') {
    return res.json({ ok: true, itemId, effect: 'hearts', lives: 3 });
  }
  if (itemId === 'boost') {
    await db.prepare('UPDATE users SET xp_boost = xp_boost + ? WHERE id = ?').run(XP_BOOST_AMOUNT, req.user.id);
    return res.json({ ok: true, itemId, effect: 'boost', boost: XP_BOOST_AMOUNT });
  }
  if (itemId === 'hint') {
    const q = findQuestionById(String(questionId || ''));
    if (!q || !Array.isArray(q.choices) || q.choices.length < 2) {
      return res.status(404).json({ error: 'Question not found.' });
    }
    // Keep the correct answer + one random wrong; return original indices so
    // the client can still map clicks back to the real answer (never leak it).
    const wrongIdxs = q.choices.map((_, i) => i).filter((i) => i !== q.correctIndex);
    const wrongPick = wrongIdxs[Math.floor(Math.random() * wrongIdxs.length)];
    const pair = [
      { idx: q.correctIndex, text: q.choices[q.correctIndex] },
      { idx: wrongPick, text: q.choices[wrongPick] },
    ];
    const choices = Math.random() < 0.5 ? pair : [pair[1], pair[0]];
    return res.json({ ok: true, itemId, effect: 'hint', choices });
  }
  return res.status(400).json({ error: 'Item cannot be used that way.' });
});

// Gem packs: Stripe Checkout when configured; admin always gets them free.
app.post('/api/store/checkout', authRequired, async (req, res) => {
  const { packId } = req.body || {};
  const pack = GEM_PACKS.find((p) => p.id === packId);
  if (!pack) return res.status(400).json({ error: 'Unknown pack.' });
  if (req.user.is_admin) {
    await awardGems(req.user.id, pack.gems, 'admin free pack ' + packId);
    return res.json({ ok: true, free: true, gems: await getGems(req.user.id) });
  }
  const key = (await getConfig()).stripeKey;
  if (!key) return res.status(503).json({ error: 'Payments are not configured yet — ask the admin for a gem grant.' });
  const base = (await getConfig()).appUrl || `${req.protocol}://${req.get('host')}`;
  try {
    const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        mode: 'payment',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][product_data][name]': pack.label + ' — SAT Arena gems',
        'line_items[0][price_data][unit_amount]': String(pack.priceCents),
        'line_items[0][quantity]': '1',
        success_url: `${base}/api/store/confirm?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/#/store`,
        client_reference_id: String(req.user.id),
        metadata: { pack_id: pack.id, gems: String(pack.gems) },
      }),
    });
    const data = await sessionRes.json();
    if (!sessionRes.ok || !data.url) {
      console.error('Stripe checkout error:', data);
      return res.status(502).json({ error: 'Could not start checkout.' });
    }
    await db.prepare('INSERT INTO store_orders (user_id, plan, gems, amount_cents, status, provider, provider_ref) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(req.user.id, pack.id, pack.gems, pack.priceCents, 'pending', 'stripe', data.id);
    res.json({ ok: true, url: data.url });
  } catch (e) {
    console.error('Stripe error:', e);
    res.status(502).json({ error: 'Could not start checkout.' });
  }
});

// Stripe Checkout success redirect — credits gems idempotently (no webhook needed).
app.get('/api/store/confirm', authRequired, async (req, res) => {
  const key = (await getConfig()).stripeKey;
  const sessionId = String(req.query.session_id || '');
  if (!key || !sessionId) return res.redirect('/#/store?paid=error');
  try {
    const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
      headers: { Authorization: 'Bearer ' + key },
    });
    const s = await r.json();
    if (s.payment_status !== 'paid') return res.redirect('/#/store?paid=error');
    // Atomic claim: mark paid only if still pending, so concurrent confirm
    // redirects (or a replay) can never double-credit gems.
    const order = await db.prepare('SELECT user_id, gems FROM store_orders WHERE provider_ref = ? AND status = \'pending\'').get(sessionId);
    if (order && Number(order.user_id) === req.user.id) {
      const claimed = await db.prepare('UPDATE store_orders SET status = \'paid\' WHERE provider_ref = ? AND status = \'pending\'').run(sessionId);
      if (claimed.changes === 1) await awardGems(req.user.id, order.gems, 'stripe order ' + sessionId);
    }
    return res.redirect('/#/store?paid=1');
  } catch (e) {
    console.error('Stripe confirm error:', e);
    res.redirect('/#/store?paid=error');
  }
});

// ── question lookup by id (from the generation cache) ─────────────────────
function findQuestionById(id) {
  return questionCache.get(id) || null;
}

// ── Google OAuth 2.0 (no extra deps — plain fetch, Node >= 22) ────────────
// Credentials come from .env or the admin-editable runtime config (DB).
// Without them the /api/auth/google endpoint returns a friendly error
// instead of crashing the server.
async function googleOAuthCreds() {
  const c = await getConfig();
  return { clientId: c.googleClientId, clientSecret: c.googleClientSecret };
}
async function googleOAuthEnabled() {
  const { clientId, clientSecret } = await googleOAuthCreds();
  return Boolean(clientId && clientSecret);
}

// In-memory CSRF state store for the OAuth handshake (short-lived).
const oauthStates = new Map();
function pushOAuthState() {
  const state = crypto.randomBytes(24).toString('hex');
  oauthStates.set(state, Date.now());
  if (oauthStates.size > 2000) oauthStates.delete(oauthStates.keys().next().value); // oldest by insertion order
  return state;
}
function popOAuthState(state) {
  const created = oauthStates.get(state);
  if (created === undefined) return false;
  // valid for 10 minutes
  if (Date.now() - created > 10 * 60 * 1000) { oauthStates.delete(state); return false; }
  oauthStates.delete(state);
  return true;
}

// Current public tunnel base URL (parsed from the cloudflared log) so Google
// OAuth keeps working even when the trycloudflare host rotates on restart.
function tunnelBaseUrl() {
  const fs = require('node:fs');
  const LOG = process.env.TUNNEL_LOG || '/tmp/tunnel.log';
  try {
    const text = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8') : '';
    const urls = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g) || [];
    return urls.length ? urls[urls.length - 1] : '';
  } catch {
    return '';
  }
}

// Base URL used for the OAuth redirect_uri. An explicit APP_URL (env var or
// admin config) wins (works behind TLS-terminating proxies like
// Heroku/Render/nginx); otherwise the live tunnel URL is used so rotating
// trycloudflare hosts never break the Google handshake; the request-host
// fallback covers plain local dev.
async function oauthRedirectUri(req) {
  const base = (await getConfig()).appUrl || tunnelBaseUrl() || `${req.protocol}://${req.get('host')}`;
  return `${base}/api/auth/google/callback`;
}

// 1. Kick off the flow — redirect the browser to Google's consent screen
app.get('/api/auth/google', async (req, res) => {
  if (!(await googleOAuthEnabled())) {
    return res.status(503).json({ error: 'Google sign-in is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the admin panel or .env' });
  }
  const { clientId } = await googleOAuthCreds();
  const state = pushOAuthState();
  const redirectUri = await oauthRedirectUri(req);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// 2. Google redirects back here with ?code=...&state=...
app.get('/api/auth/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error || !code) {
    return res.redirect('/#/auth?google_error=1');
  }
  if (!popOAuthState(String(state))) {
    return res.redirect('/#/auth?google_error=2');
  }

  const redirectUri = await oauthRedirectUri(req);
  const { clientId, clientSecret } = await googleOAuthCreds();
  try {
    // Exchange the authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      console.error('Google token exchange failed:', err);
      return res.redirect('/#/auth?google_error=3');
    }
    const tokens = await tokenRes.json();

    // Verify the id_token against Google's tokeninfo endpoint (aud, exp, iss)
    const infoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokens.id_token)}`);
    if (!infoRes.ok) return res.redirect('/#/auth?google_error=4');
    const profile = await infoRes.json();
    const issOk = profile.iss === 'accounts.google.com' || profile.iss === 'https://accounts.google.com';
    if (profile.aud !== clientId || !issOk || !profile.sub || !profile.email) {
      return res.redirect('/#/auth?google_error=4');
    }
    if (!profile.email_verified) return res.redirect('/#/auth?google_error=5');

    // Find-or-create the account, keyed by google_id (stable) then email
    let user = await db.prepare('SELECT * FROM users WHERE google_id = ?').get(profile.sub);
    if (!user) {
      const byEmail = await db.prepare('SELECT * FROM users WHERE email = ?').get(String(profile.email).toLowerCase());
      if (byEmail) {
        // link the Google account to an existing email account
        await db.prepare('UPDATE users SET google_id = ? WHERE id = ?').run(profile.sub, byEmail.id);
        user = await db.prepare('SELECT * FROM users WHERE id = ?').get(byEmail.id);
      } else {
        // brand new account — derive a username from the email/name
        const base = (profile.name || profile.email.split('@')[0] || 'player')
          .toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 18) || 'player';
        // username uniqueness: synchronous DB ops with no await between the
        // check and insert make this atomic within this single process
        let username = base;
        let n = 1;
        while (await db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
          username = `${base}${n++}`.slice(0, 20);
        }
        // random password — Google users can't log in with a password
        const pw = crypto.randomBytes(32).toString('hex');
        const info = await db.prepare('INSERT INTO users (username, email, password_hash, google_id) VALUES (?, ?, ?, ?)')
          .run(username, String(profile.email).toLowerCase(), hashPassword(pw), profile.sub);
        user = await db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
      }
    }

    // refresh daily streak on login if needed (same as password login)
    const today = new Date().toISOString().slice(0, 10);
    if (user.last_active !== today) {
      const s = await nextDayStreak(user);
      await db.prepare('UPDATE users SET streak = ?, last_active = ? WHERE id = ?').run(s.streak, today, user.id);
      user.streak = s.streak; user.last_active = today;
    }
    await setSession(res, user.id);
    postToFormpost({ type: 'google_login', email: user.email, time: new Date().toISOString() });
    res.redirect('/#/dashboard');
  } catch (e) {
    console.error('Google OAuth callback error:', e);
    res.redirect('/#/auth?google_error=6');
  }
});

// ── Subscriptions (premium tier) ───────────────────────────────────────────
// Premium unlocks unlimited practice, full practice tests, unlimited tutor
// and topic analytics. Payments go through Stripe Checkout when
// STRIPE_SECRET_KEY is configured; otherwise the admin grants premium for
// free from the admin panel.
app.get('/api/subscription', authRequired, async (req, res) => {
  const c = await getConfig();
  res.json({
    premium: isPremium(req.user),
    plan: req.user.plan || 'free',
    premium_until: req.user.premium_until || null,
    priceCents: c.premiumPriceCents,
    paymentsConfigured: Boolean(c.stripeKey),
    dailyUsed: await todayAnswerCount(req.user.id),
    dailyLimit: FREE_DAILY_QUESTIONS,
    tutorUsed: await todayTutorCount(req.user.id),
    tutorLimit: FREE_TUTOR_DAILY,
  });
});

app.post('/api/subscribe', authRequired, async (req, res) => {
  if (isPremium(req.user)) {
    return res.json({ ok: true, already: true, premium: true });
  }
  const c = await getConfig();
  const key = c.stripeKey;
  if (!key) {
    return res.status(503).json({ error: 'Payments are not configured yet — ask the admin for a premium grant.', upgrade: true });
  }
  const base = c.appUrl || `${req.protocol}://${req.get('host')}`;
  try {
    const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        mode: 'subscription',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][product_data][name]': 'SAT Arena Premium',
        'line_items[0][price_data][unit_amount]': String(c.premiumPriceCents),
        'line_items[0][price_data][recurring][interval]': 'month',
        'line_items[0][quantity]': '1',
        success_url: `${base}/api/subscription/confirm?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/#/store`,
        client_reference_id: String(req.user.id),
        metadata: { plan: 'premium' },
      }),
    });
    const data = await sessionRes.json();
    if (!sessionRes.ok || !data.url) {
      console.error('Stripe subscribe error:', data);
      return res.status(502).json({ error: 'Could not start checkout.' });
    }
    await db.prepare('INSERT INTO store_orders (user_id, plan, gems, amount_cents, status, provider, provider_ref) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(req.user.id, 'premium', 0, c.premiumPriceCents, 'pending', 'stripe', data.id);
    res.json({ ok: true, url: data.url });
  } catch (e) {
    console.error('Stripe subscribe error:', e);
    res.status(502).json({ error: 'Could not start checkout.' });
  }
});

// Stripe subscription success — grants premium for 30 days (idempotent).
app.get('/api/subscription/confirm', authRequired, async (req, res) => {
  const key = (await getConfig()).stripeKey;
  const sessionId = String(req.query.session_id || '');
  if (!key || !sessionId) return res.redirect('/#/store?upgraded=error');
  try {
    const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
      headers: { Authorization: 'Bearer ' + key },
    });
    const s = await r.json();
    if (s.payment_status !== 'paid') return res.redirect('/#/store?upgraded=error');
    const order = await db.prepare("SELECT user_id, plan FROM store_orders WHERE provider_ref = ? AND status = 'pending'").get(sessionId);
    if (order && Number(order.user_id) === req.user.id) {
      const claimed = await db.prepare("UPDATE store_orders SET status = 'paid' WHERE provider_ref = ? AND status = 'pending'").run(sessionId);
      if (claimed.changes === 1) {
        const until = new Date(Date.now() + 30 * 864e5).toISOString();
        await db.prepare('UPDATE users SET plan = ?, premium_until = ? WHERE id = ?').run('premium', until, req.user.id);
      }
    }
    return res.redirect('/#/store?upgraded=1');
  } catch (e) {
    console.error('Stripe confirm error:', e);
    res.redirect('/#/store?upgraded=error');
  }
});

app.post('/api/subscription/cancel', authRequired, async (req, res) => {
  // Admins keep premium forever; everyone else returns to the free tier.
  if (req.user.is_admin) return res.json({ ok: true, premium: true });
  await db.prepare('UPDATE users SET plan = ?, premium_until = NULL WHERE id = ?').run('free', req.user.id);
  res.json({ ok: true, premium: false });
});

// ── Admin API routes ───────────────────────────────────────────────────────
// All admin routes require is_admin = 1

app.get('/api/admin/users', adminRequired, async (req, res) => {
  const users = await db.prepare(`
    SELECT u.id, u.username, u.email, u.xp, u.level, u.streak, u.best_streak,
           u.is_admin, u.plan, u.premium_until, u.created_at, u.last_active,
           (SELECT COUNT(*) FROM answers a WHERE a.user_id = u.id) as total_answers,
           (SELECT SUM(correct) FROM answers a WHERE a.user_id = u.id) as correct_answers,
           (SELECT COUNT(*) FROM badges b WHERE b.user_id = u.id) as badges_count
    FROM users u
    ORDER BY u.xp DESC
  `).all();
  res.json({ users });
});

app.get('/api/admin/stats', adminRequired, async (req, res) => {
  const totalUsers = (await db.prepare('SELECT COUNT(*) as c FROM users').get()).c;
  const totalAnswers = (await db.prepare('SELECT COUNT(*) as c FROM answers').get()).c;
  const totalTests = (await db.prepare('SELECT COUNT(*) as c FROM test_scores').get()).c;
  const activeToday = (await db.prepare("SELECT COUNT(*) as c FROM users WHERE last_active = date('now')").get()).c;
  const recentSignups = (await db.prepare(
    "SELECT COUNT(*) as c FROM users WHERE created_at >= datetime('now', '-7 days')"
  ).get()).c;
  const topByXp = await db.prepare(
    'SELECT username, xp, level FROM users ORDER BY xp DESC LIMIT 5'
  ).all();
  res.json({ stats: { totalUsers, totalAnswers, totalTests, activeToday, recentSignups }, topByXp });
});

app.get('/api/admin/logs', adminRequired, async (req, res) => {
  const logs = await db.prepare(`
    SELECT al.*, u.username FROM admin_log al
    JOIN users u ON u.id = al.admin_id
    ORDER BY al.id DESC LIMIT 50
  `).all();
  res.json({ logs });
});

app.post('/api/admin/log', adminRequired, async (req, res) => {
  const { action, detail } = req.body || {};
  await db.prepare('INSERT INTO admin_log (admin_id, action, detail) VALUES (?, ?, ?)')
    .run(req.user.id, action || 'generic', detail || null);
  res.json({ ok: true });
});

// ── Admin economy: ledger, orders, balances + free gem grants ─────────────
app.get('/api/admin/store', adminRequired, async (req, res) => {
  const ledger = await db.prepare(`
    SELECT gt.id, gt.amount, gt.reason, gt.created_at, u.username
    FROM gem_tx gt JOIN users u ON u.id = gt.user_id
    ORDER BY gt.id DESC LIMIT 30`).all();
  const orders = await db.prepare(`
    SELECT so.id, so.plan, so.gems, so.amount_cents, so.status, so.created_at, u.username
    FROM store_orders so JOIN users u ON u.id = so.user_id
    ORDER BY so.id DESC LIMIT 20`).all();
  const balances = await db.prepare(`
    SELECT u.id, u.username, u.gems, u.xp_boost,
           (SELECT COUNT(*) FROM user_items i WHERE i.user_id = u.id AND i.qty > 0) as item_count
    FROM users u ORDER BY u.gems DESC LIMIT 15`).all();
  res.json({ ledger, orders, balances });
});

// Admin: grant or revoke the premium plan for any user (no payment needed).
app.post('/api/admin/plan', adminRequired, async (req, res) => {
  const { userId, plan } = req.body || {};
  const uid = parseInt(userId, 10);
  if (!uid) return res.status(400).json({ error: 'Invalid user id.' });
  const target = await db.prepare('SELECT id, username FROM users WHERE id = ?').get(uid);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  const p = plan === 'premium' ? 'premium' : plan === 'free' ? 'free' : null;
  if (!p) return res.status(400).json({ error: 'Plan must be premium or free.' });
  await db.prepare('UPDATE users SET plan = ?, premium_until = NULL WHERE id = ?').run(p, uid);
  await db.prepare('INSERT INTO admin_log (admin_id, action, detail) VALUES (?, ?, ?)')
    .run(req.user.id, 'set_plan', `${p} for ${target.username}`);
  res.json({ ok: true, plan: p });
});

app.post('/api/admin/grant-gems', adminRequired, async (req, res) => {
  const { userId, amount, reason } = req.body || {};
  const uid = parseInt(userId, 10);
  const a = parseInt(amount, 10);
  if (!uid || !Number.isFinite(a) || a === 0) return res.status(400).json({ error: 'Invalid grant.' });
  const target = await db.prepare('SELECT id, username FROM users WHERE id = ?').get(uid);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  await awardGems(uid, a, (reason || 'admin grant').slice(0, 80));
  await db.prepare('INSERT INTO admin_log (admin_id, action, detail) VALUES (?, ?, ?)')
    .run(req.user.id, 'grant_gems', `${a} gems to ${target.username}`);
  res.json({ ok: true });
});

// ── Admin runtime config (Google OAuth keys, AI keys, APP_URL) ─────────────
// GET returns masked values so secrets never leave the server; POST stores
// them in the DB (with env fallback) and they take effect immediately.
app.get('/api/admin/config', adminRequired, async (req, res) => {
  const c = await getConfig();
  res.json({
    config: {
      google_client_id: maskSecret(c.googleClientId),
      google_client_secret: maskSecret(c.googleClientSecret),
      app_url: c.appUrl,
      gemini_api_key: maskSecret(c.geminiKey),
      groq_api_key: maskSecret(c.groqKey),
      groq_model: c.groqModel,
      resend_api_key: maskSecret(c.resendKey),
      email_from: c.emailFrom,
      smtp_host: c.smtpHost,
      smtp_port: String(c.smtpPort),
      smtp_user: c.smtpUser,
      smtp_pass: maskSecret(c.smtpPass),
      smtp_secure: c.smtpSecure ? '1' : '',
      ads_enabled: c.adsEnabled ? '1' : '',
      ads_code: c.adsCode,
      ads_network: c.adsNetwork || 'custom',
      adsense_client: maskSecret(c.adsenseClient),
      stripe_secret_key: maskSecret(c.stripeKey),
      premium_price_cents: String(c.premiumPriceCents),
    },
    status: {
      google: Boolean(c.googleClientId && c.googleClientSecret),
      gemini: Boolean(c.geminiKey),
      groq: Boolean(c.groqKey),
      ai: Boolean(c.geminiKey || c.groqKey),
      email: Boolean(c.resendKey || (c.smtpHost && c.smtpUser)),
      ads: c.adsEnabled && Boolean(c.adsNetwork === 'adsense' ? c.adsenseClient : c.adsCode),
      payments: Boolean(c.stripeKey),
    },
  });
});

app.post('/api/admin/config', adminRequired, async (req, res) => {
  const allowed = ['google_client_id', 'google_client_secret', 'app_url', 'gemini_api_key', 'groq_api_key', 'groq_model', 'resend_api_key', 'email_from', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_secure', 'ads_enabled', 'ads_code', 'ads_network', 'adsense_client', 'stripe_secret_key', 'premium_price_cents'];

  // Empty fields and masked values ('•••') are treated as "keep current" so
  // a save that leaves a secret untouched can never overwrite it with the
  // masked placeholder text.
  const entries = {};
  for (const k of allowed) {
    const v = req.body && req.body[k] !== undefined ? String(req.body[k]).trim() : '';
    if (v && !v.includes('•')) entries[k] = v;
  }
  const clears = Array.isArray(req.body && req.body.clear)
    ? req.body.clear.filter((k) => allowed.includes(k))
    : [];
  if (!Object.keys(entries).length && !clears.length) {
    return res.status(400).json({ error: 'No settings to save.' });
  }
  // Delete first, then setConfig() re-reads everything — order matters so the
  // cached snapshot reflects the cleared state (getConfig alone would return
  // the stale cache because setConfig just refreshed its timestamp).
  for (const k of clears) {
    await db.prepare('DELETE FROM app_config WHERE key = ?').run(k);
  }
  await setConfig(entries);
  const actions = [...Object.keys(entries), ...clears.map((k) => k + ':clear')];
  await db.prepare('INSERT INTO admin_log (admin_id, action, detail) VALUES (?, ?, ?)')
    .run(req.user.id, 'updated_config', actions.join(', '));
  const c = getConfig();
  res.json({
    ok: true,
    config: {
      google_client_id: maskSecret(c.googleClientId),
      google_client_secret: maskSecret(c.googleClientSecret),
      app_url: c.appUrl,
      gemini_api_key: maskSecret(c.geminiKey),
      groq_api_key: maskSecret(c.groqKey),
      groq_model: c.groqModel,
      resend_api_key: maskSecret(c.resendKey),
      email_from: c.emailFrom,
      smtp_host: c.smtpHost,
      smtp_port: String(c.smtpPort),
      smtp_user: c.smtpUser,
      smtp_pass: maskSecret(c.smtpPass),
      smtp_secure: c.smtpSecure ? '1' : '',
      ads_enabled: c.adsEnabled ? '1' : '',
      ads_code: c.adsCode,
      ads_network: c.adsNetwork || 'custom',
      adsense_client: maskSecret(c.adsenseClient),
      stripe_secret_key: maskSecret(c.stripeKey),
      premium_price_cents: String(c.premiumPriceCents),
    },
    status: {
      google: Boolean(c.googleClientId && c.googleClientSecret),
      gemini: Boolean(c.geminiKey),
      groq: Boolean(c.groqKey),
      ai: Boolean(c.geminiKey || c.groqKey),
      email: Boolean(c.resendKey || (c.smtpHost && c.smtpUser)),
      ads: c.adsEnabled && Boolean(c.adsNetwork === 'adsense' ? c.adsenseClient : c.adsCode),
      payments: Boolean(c.stripeKey),
    },
  });
});

app.get('/api/admin/user/:id', adminRequired, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (!userId) return res.status(400).json({ error: 'Invalid user id' });
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Don't expose password hash
  const { password_hash, gemini_key, ...safe } = user;

  // Aggregate stats
  const answerStats = await db.prepare(
    'SELECT COUNT(*) as total, SUM(correct) as correct, SUM(xp_earned) as xp FROM answers WHERE user_id = ?'
  ).get(userId);

  const topicStats = await db.prepare(
    'SELECT topic, attempts, correct, rating FROM topic_stats WHERE user_id = ? ORDER BY attempts DESC'
  ).all(userId);

  const recentTests = await db.prepare(
    'SELECT * FROM test_scores WHERE user_id = ? ORDER BY id DESC LIMIT 5'
  ).all(userId);

  const badges = await db.prepare(
    'SELECT badge_id, earned_at FROM badges WHERE user_id = ? ORDER BY id DESC'
  ).all(userId);

  const sessionCount = (await db.prepare(
    "SELECT COUNT(*) as c FROM sessions WHERE user_id = ? AND expires_at > datetime('now')"
  ).get(userId)).c;

  res.json({
    user: safe,
    stats: {
      totalAnswered: answerStats.total || 0,
      totalCorrect: answerStats.correct || 0,
      accuracy: answerStats.total ? Math.round((answerStats.correct / answerStats.total) * 100) : 0,
      totalXp: answerStats.xp || 0,
      activeSessions: sessionCount,
    },
    topics: topicStats,
    tests: recentTests,
    badges,
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

// Async DB calls can reject (e.g. a transient Turso hiccup on Render). Never
// let an unhandled rejection kill the process — log and keep serving.
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err && err.message ? err.message : err);
});

// Wait for the database (schema + admin seed) before accepting requests.
db.init()
  .then(async () => {
    const ts = await tutorStatus();
    app.listen(PORT, () => {
      console.log(`🎓 SAT Arena running at http://localhost:${PORT}`);
      console.log(`   Tutor mode: ${ts.provider}`);
      console.log(`   Database: ${db.isRemote() ? 'Turso (remote)' : 'local SQLite'}`);
    });
  })
  .catch((e) => {
    console.error('Database init failed:', e);
    process.exit(1);
  });
