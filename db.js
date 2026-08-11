'use strict';

// ─── Database layer (async facade) ──────────────────────────────────────────
// Two backends behind one API:
//   • TURSO_URL + TURSO_AUTH_TOKEN set  → persistent remote SQLite (Turso /
//     libsql over HTTPS). This is what makes Render's free tier viable: the
//     remote DB survives idle spin-downs and redeploys that wipe the local
//     filesystem.
//   • otherwise                          → local file DB (data/satarena.db)
//
// The exported API mirrors what the sync code used:
//     db.prepare(sql).all(...args)   → Promise<rows>
//     db.prepare(sql).get(...args)   → Promise<row | undefined>
//     db.prepare(sql).run(...args)   → Promise<{ changes, lastInsertRowid }>
//     db.exec(sql)                   → Promise<void>
//     db.init()                      → Promise (schema + admin seed, before listen)
// All statement methods are async in BOTH modes so call sites don't need to
// branch. Lazy init: the first query waits for the schema/seed to finish.

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const REMOTE_URL = (process.env.TURSO_URL || '').trim();
const REMOTE_TOKEN = (process.env.TURSO_AUTH_TOKEN || '').trim();
const IS_REMOTE = Boolean(REMOTE_URL);

let _backend = null; // { exec(sql), prepare(sql) -> { all, get, run } }  (methods async)
let _ready = null;   // promise<backend> once schema + seed complete

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  xp            INTEGER NOT NULL DEFAULT 0,
  level         INTEGER NOT NULL DEFAULT 1,
  streak        INTEGER NOT NULL DEFAULT 0,
  best_streak   INTEGER NOT NULL DEFAULT 0,
  combo         INTEGER NOT NULL DEFAULT 0,
  last_active   TEXT,
  target_date   TEXT,
  daily_goal    INTEGER NOT NULL DEFAULT 10,
  adaptive_rating REAL NOT NULL DEFAULT 50, -- global skill rating driving adaptive difficulty
  adaptive_diff  INTEGER NOT NULL DEFAULT 2, -- current adaptive difficulty level (1-3)
  gemini_key    TEXT,                        -- optional per-user free AI key (stored locally)
  is_admin      INTEGER NOT NULL DEFAULT 0,   -- admin flag for user management panel
  google_id     TEXT,                          -- Google OAuth subject id (links a Google account)
  gems          INTEGER NOT NULL DEFAULT 0,    -- spendable in-app currency (store)
  xp_boost      INTEGER NOT NULL DEFAULT 0,    -- remaining questions with 2x XP (store item)
  plan          TEXT NOT NULL DEFAULT 'free',   -- 'free' | 'premium' (subscription tier)
  premium_until TEXT,                          -- subscription expiry (NULL = permanent/admin-granted)
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One-time passcodes for email signup + password reset (OTP flow)
CREATE TABLE IF NOT EXISTS otps (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL,
  code       TEXT NOT NULL,
  purpose    TEXT NOT NULL,                 -- 'signup' | 'reset'
  attempts   INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- AI tutor message log (used to enforce the free-tier daily tutor limit)
CREATE TABLE IF NOT EXISTS tutor_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS answers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section    TEXT NOT NULL,
  topic      TEXT NOT NULL,
  difficulty INTEGER NOT NULL,
  correct    INTEGER NOT NULL,
  xp_earned  INTEGER NOT NULL DEFAULT 0,
  time_ms    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS badges (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id   TEXT NOT NULL,
  earned_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, badge_id)
);

CREATE TABLE IF NOT EXISTS topic_stats (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic      TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  correct    INTEGER NOT NULL DEFAULT 0,
  rating     REAL NOT NULL DEFAULT 50,  -- 0-100 proficiency rating, difficulty-weighted
  last_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, topic)
);

-- Store inventory: consumable power-ups (hearts, hints, shields, freezes)
CREATE TABLE IF NOT EXISTS user_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id    TEXT NOT NULL,
  qty        INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, item_id)
);

-- Gem ledger: every gem earned or spent, with a reason (auditable)
CREATE TABLE IF NOT EXISTS gem_tx (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount     INTEGER NOT NULL,
  reason     TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Real-money orders (Stripe checkout sessions) for gem packs
CREATE TABLE IF NOT EXISTS store_orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan          TEXT NOT NULL,
  gems          INTEGER NOT NULL,
  amount_cents  INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  provider      TEXT NOT NULL DEFAULT 'stripe',
  provider_ref  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Admin session log (tracks admin actions)
CREATE TABLE IF NOT EXISTS admin_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action     TEXT NOT NULL,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Runtime app configuration (admin-editable keys with env fallback)
CREATE TABLE IF NOT EXISTS app_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS test_scores (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rw_correct    INTEGER NOT NULL DEFAULT 0,
  rw_total      INTEGER NOT NULL DEFAULT 0,
  math_correct  INTEGER NOT NULL DEFAULT 0,
  math_total    INTEGER NOT NULL DEFAULT 0,
  scaled_score  INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_answers_user ON answers(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_answers_topic ON answers(user_id, topic);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_tests_user ON test_scores(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_topic_stats_user ON topic_stats(user_id, attempts);
CREATE INDEX IF NOT EXISTS idx_gem_tx_user ON gem_tx(user_id, id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON store_orders(user_id, id);
`;

async function initBackend() {
  if (IS_REMOTE) {
    // eslint-disable-next-line global-require
    const { createClient } = require('@libsql/client');
    const client = createClient({ url: REMOTE_URL, authToken: REMOTE_TOKEN, intMode: 'number' });
    return {
      async exec(sql) {
        await client.execute({ sql });
      },
      prepare(sql) {
        const execOpts = (...args) => (args.length ? { sql, args } : { sql });
        return {
          all: (...args) => client.execute(execOpts(...args)).then((r) => r.rows),
          get: (...args) => client.execute(execOpts(...args)).then((r) => (r.rows.length ? r.rows[0] : undefined)),
          run: (...args) => client.execute(execOpts(...args)).then((r) => ({
            changes: Number(r.rowsAffected) || 0,
            lastInsertRowid: Number(r.lastInsertRowid),
          })),
        };
      },
    };
  }

  const { DatabaseSync } = require('node:sqlite');
  const DATA_DIR = path.join(__dirname, 'data');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const local = new DatabaseSync(path.join(DATA_DIR, 'satarena.db'));
  return {
    async exec(sql) {
      local.exec(sql);
    },
    prepare(sql) {
      const stmt = local.prepare(sql);
      return {
        all: (...args) => Promise.resolve(stmt.all(...args)),
        get: (...args) => Promise.resolve(stmt.get(...args)),
        run: (...args) => Promise.resolve(stmt.run(...args)),
      };
    },
  };
}

// Schema + lightweight migrations + authoritative admin seed. Runs once.
// Statements are executed one at a time (not as one multi-statement blob) so
// the same code works against both node:sqlite's exec() and Turso's libsql
// HTTP execute, which is stricter about multiple statements per call.
async function migrateAndSeed(b) {
  const pragmas = IS_REMOTE
    ? 'PRAGMA foreign_keys = ON'
    : 'PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON';
  const statements = (pragmas + ';' + SCHEMA)
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await b.exec(stmt);
  }

  async function ensureColumn(table, column, ddl) {
    const rows = await b.prepare(`SELECT name FROM pragma_table_info('${table}')`).all();
    const cols = rows.map((c) => c.name);
    if (!cols.includes(column)) await b.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
  await ensureColumn('users', 'combo', 'combo INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('users', 'target_date', 'target_date TEXT');
  await ensureColumn('users', 'daily_goal', 'daily_goal INTEGER NOT NULL DEFAULT 10');
  await ensureColumn('users', 'adaptive_rating', 'adaptive_rating REAL NOT NULL DEFAULT 50');
  await ensureColumn('users', 'adaptive_diff', 'adaptive_diff INTEGER NOT NULL DEFAULT 2');
  await ensureColumn('users', 'gemini_key', 'gemini_key TEXT');
  await ensureColumn('users', 'is_admin', 'is_admin INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('users', 'google_id', 'google_id TEXT');
  await ensureColumn('users', 'gems', 'gems INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('users', 'xp_boost', 'xp_boost INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('users', 'plan', "plan TEXT NOT NULL DEFAULT 'free'");
  await ensureColumn('users', 'premium_until', 'premium_until TEXT');

  // Seed admin user. Credentials come from env vars (see .env.example) so no
  // password ever ships in source:
  //   ADMIN_EMAIL    — admin login email (default keeps existing installs working)
  //   ADMIN_USERNAME — display name (default 'admin')
  //   ADMIN_PASSWORD — NO default. While set, the seed FORCE-SETS the admin's
  //                    password to this value on every start (guaranteed access,
  //                    like the old hardcoded seed). When unset, an existing
  //                    admin's password is left untouched (a restart no longer
  //                    reverts a changed password), and a brand-new admin gets a
  //                    random password printed once to the console.
  const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || 'tanwarojayit@gmail.com').trim().toLowerCase();
  const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || 'admin').trim();
  const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '').trim();

  function scryptHash(pw) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
    return `${salt}:${hash}`;
  }
  function scryptVerify(pw, stored) {
    if (!stored || !stored.includes(':')) return false;
    const [salt, hash] = stored.split(':');
    // Corrupt hash (empty salt/hash) must never throw in the boot seed.
    if (!salt || !hash) return false;
    const expected = Buffer.from(hash, 'hex');
    const candidate = crypto.scryptSync(pw, salt, 64);
    // timingSafeEqual throws on length mismatch — never let a malformed hash
    // crash the seed (this runs on every boot).
    return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
  }

  // email/username are UNIQUE — these checks keep the seed from ever crashing
  // startup on a collision (e.g. a regular user who registered "admin").
  async function emailFree(email, excludeId) {
    const row = await b.prepare('SELECT id FROM users WHERE email = ?').get(email);
    return !row || row.id === excludeId;
  }
  async function usernameFree(name, excludeId) {
    const row = await b.prepare('SELECT id FROM users WHERE username = ?').get(name);
    return !row || row.id === excludeId;
  }
  async function setPassword(id, password) {
    await b.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(scryptHash(password), id);
  }

  const ADMIN_FIELDS = 'id, username, email, password_hash, is_admin';

  // 1) A user with the env email already exists → guarantee admin + password.
  let existing = await b.prepare(`SELECT ${ADMIN_FIELDS} FROM users WHERE email = ?`).get(ADMIN_EMAIL);

  // 2) Otherwise promote the current admin (covers a changed ADMIN_EMAIL —
  //    never create a second admin).
  if (!existing) {
    existing = await b.prepare(`SELECT ${ADMIN_FIELDS} FROM users WHERE is_admin = 1 ORDER BY id LIMIT 1`).get();
    if (existing) {
      let changed = false;
      if (existing.email !== ADMIN_EMAIL) {
        if (await emailFree(ADMIN_EMAIL, existing.id)) {
          await b.prepare('UPDATE users SET email = ? WHERE id = ?').run(ADMIN_EMAIL, existing.id);
          changed = true;
        } else {
          console.log('⚠  ADMIN_EMAIL is already registered to another user — keeping admin email ' + existing.email);
        }
      }
      if (existing.username !== ADMIN_USERNAME && await usernameFree(ADMIN_USERNAME, existing.id)) {
        await b.prepare('UPDATE users SET username = ? WHERE id = ?').run(ADMIN_USERNAME, existing.id);
        changed = true;
      }
      if (ADMIN_PASSWORD && !scryptVerify(ADMIN_PASSWORD, existing.password_hash)) {
        await setPassword(existing.id, ADMIN_PASSWORD);
        changed = true;
      }
      console.log(changed ? '✓ Admin credentials ensured (' + ADMIN_EMAIL + ')' : '✓ Admin account ready (' + ADMIN_EMAIL + ')');
      return;
    }
  }

  // 3) Existing account with the target email → ensure admin + password
  //    (+ the env username, so ADMIN_USERNAME is enforced here too).
  if (existing) {
    let changed = false;
    if (!existing.is_admin) {
      await b.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(existing.id);
      changed = true;
    }
    if (existing.username !== ADMIN_USERNAME && await usernameFree(ADMIN_USERNAME, existing.id)) {
      await b.prepare('UPDATE users SET username = ? WHERE id = ?').run(ADMIN_USERNAME, existing.id);
      changed = true;
    }
    // Only force-reset the password when ADMIN_PASSWORD is explicitly set —
    // otherwise respect whatever the owner changed it to.
    if (ADMIN_PASSWORD && !scryptVerify(ADMIN_PASSWORD, existing.password_hash)) {
      await setPassword(existing.id, ADMIN_PASSWORD);
      changed = true;
    }
    if (changed) console.log('✓ Admin credentials ensured (' + ADMIN_EMAIL + ')');
    else console.log('✓ Admin account ready (' + ADMIN_EMAIL + ')');
    return;
  }

  // 4) Brand-new install — create the admin. Guard the UNIQUE username so a
  //    regular user who already took "admin" can never crash the boot seed.
  let username = ADMIN_USERNAME;
  if (!(await usernameFree(username, null))) {
    username = ADMIN_USERNAME + '_' + crypto.randomBytes(3).toString('hex');
    console.log('⚠  Username "' + ADMIN_USERNAME + '" is taken — creating admin as "' + username + '". Set ADMIN_USERNAME in .env to control it.');
  }
  if (!ADMIN_PASSWORD) {
    // No env password and no existing admin — create one with a random
    // password and print it once (this line is the only place it appears).
    const generated = crypto.randomBytes(12).toString('base64url'); // ~16 chars, URL-safe
    await b.prepare('INSERT INTO users (username, email, password_hash, is_admin) VALUES (?, ?, ?, 1)')
      .run(username, ADMIN_EMAIL, scryptHash(generated));
    console.log('⚠  Admin created with a RANDOM password — set ADMIN_PASSWORD in .env to control it.');
    console.log('   email:    ' + ADMIN_EMAIL);
    console.log('   username: ' + username);
    console.log('   password: ' + generated + '  (shown only once, on first creation)');
  } else {
    await b.prepare('INSERT INTO users (username, email, password_hash, is_admin) VALUES (?, ?, ?, 1)')
      .run(username, ADMIN_EMAIL, scryptHash(ADMIN_PASSWORD));
    console.log('✓ Admin user created (' + ADMIN_EMAIL + ')');
  }
}

function ensureReady() {
  if (!_ready) {
    _ready = initBackend()
      .then(async (b) => {
        _backend = b;
        await migrateAndSeed(b);
        return b;
      })
      .catch((e) => {
        _ready = null;
        throw e;
      });
  }
  return _ready;
}

// Public facade — sync `prepare(sql)` returning a statement whose methods are
// async in both modes, so every call site just needs `await`.
function prepare(sql) {
  return {
    async all(...args) { const b = await ensureReady(); return b.prepare(sql).all(...args); },
    async get(...args) { const b = await ensureReady(); return b.prepare(sql).get(...args); },
    async run(...args) { const b = await ensureReady(); return b.prepare(sql).run(...args); },
  };
}

async function exec(sql) {
  const b = await ensureReady();
  return b.exec(sql);
}

function isRemote() {
  return IS_REMOTE;
}

module.exports = { prepare, exec, init: ensureReady, isRemote };
