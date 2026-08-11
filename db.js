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
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
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

  // Seed admin user (AUTHORITATIVE — always works): every server start
  // guarantees the admin account exists with EXACTLY this email + password.
  const ADMIN_EMAIL = 'tanwarojayit@gmail.com';
  const ADMIN_USERNAME = 'admin';
  const ADMIN_PASSWORD = 'baldeyan';

  function scryptHash(pw) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
    return `${salt}:${hash}`;
  }
  function scryptVerify(pw, stored) {
    if (!stored || !stored.includes(':')) return false;
    const [salt, hash] = stored.split(':');
    const candidate = crypto.scryptSync(pw, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex'));
  }

  const existing = await b.prepare('SELECT id, password_hash, is_admin FROM users WHERE email = ?').get(ADMIN_EMAIL);
  if (!existing) {
    await b.prepare('INSERT INTO users (username, email, password_hash, is_admin) VALUES (?, ?, ?, 1)')
      .run(ADMIN_USERNAME, ADMIN_EMAIL, scryptHash(ADMIN_PASSWORD));
    console.log('✓ Admin user created (tanwarojayit@gmail.com / baldeyan)');
  } else {
    let changed = false;
    if (!existing.is_admin) {
      await b.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(existing.id);
      changed = true;
    }
    if (!scryptVerify(ADMIN_PASSWORD, existing.password_hash)) {
      await b.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(scryptHash(ADMIN_PASSWORD), existing.id);
      changed = true;
    }
    if (changed) console.log('✓ Admin credentials ensured (tanwarojayit@gmail.com / baldeyan)');
    else console.log('✓ Admin account ready (tanwarojayit@gmail.com)');
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
