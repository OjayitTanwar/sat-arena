// Verify the authoritative admin seed fix.
// Scenario: existing DB where the admin email has a DIFFERENT password.
// The server is spawned with ADMIN_PASSWORD forced, so the seed must reset
// the password to it + grant admin — then login succeeds with that password.
// (Emails/passwords come from env with dev fallbacks — no creds hardcoded.)
try { process.loadEnvFile(); } catch { /* no .env — use dev fallbacks */ }
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');

// db.js lowercases ADMIN_EMAIL on seed — match it so the assertions never
// spuriously fail on a mixed-case env value.
const adminEmail = String(process.env.ADMIN_EMAIL || 'tanwarojayit@gmail.com').trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword) {
  console.error('ADMIN_PASSWORD is required (set it in .env or the shell) — the server seeds the admin from it, and no password ships in source.');
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', ...opts });
  if (r.error) throw r.error;
  return r;
}

// 1. Build a fake OLD database where the admin email has the WRONG password.
fs.rmSync(DATA, { recursive: true, force: true });
fs.mkdirSync(DATA, { recursive: true });
run('node', ['-e', `
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/satarena.db');
db.exec(\`CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  combo INTEGER NOT NULL DEFAULT 0,
  last_active TEXT,
  target_date TEXT,
  daily_goal INTEGER NOT NULL DEFAULT 10,
  adaptive_rating REAL NOT NULL DEFAULT 50,
  adaptive_diff INTEGER NOT NULL DEFAULT 2,
  gemini_key TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  google_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)\`);
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync('OLDWRONGPASSWORD123', salt, 64).toString('hex');
db.prepare('INSERT INTO users (username, email, password_hash, is_admin) VALUES (?, ?, ?, 0)')
  .run('olduser', ${JSON.stringify(adminEmail)}, salt + ':' + hash);
console.log('old db seeded with WRONG password, is_admin=0');
`]);
console.log('step 1: old-wrong-password DB created');

// 2. Start the server detached — the seed should reset the password + grant admin.
const server = spawn('node', ['server.js'], {
  cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  // Pin the admin password AND force LOCAL mode: an empty TURSO_URL makes
  // db.js use the local data/ dir, so this test can never touch a remote
  // Turso database or reset a production admin password.
  env: { ...process.env, ADMIN_PASSWORD: adminPassword, TURSO_URL: '', TURSO_AUTH_TOKEN: '' },
});
server.unref();
let serverLog = '';
server.stdout.on('data', d => { serverLog += d; });
server.stderr.on('data', d => { serverLog += d; });
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  await wait(2500);
  const adminLines = serverLog.split('\n').filter(l => l.includes('Admin'));
  console.log('server admin log:', adminLines.join(' | ') || '(no admin line yet)');

  // 3. Login with the forced password — must succeed.
  const r = run('node', ['-e', `
const { spawnSync } = require('node:child_process');
const r = spawnSync('curl', ['-s', '-X', 'POST', 'localhost:3000/api/auth/login',
  '-H', 'Content-Type: application/json',
  '-d', JSON.stringify({ identifier: ${JSON.stringify(adminEmail)}, password: ${JSON.stringify(adminPassword)} })],
  { encoding: 'utf8' });
const body = r.stdout.trim();
console.log('login response:', body.slice(0, 220));
const j = JSON.parse(body);
if (j.user && j.user.email === ${JSON.stringify(adminEmail)}) {
  console.log('PASS: login with forced ADMIN_PASSWORD succeeded, is_admin =', j.user.is_admin);
} else {
  console.log('FAIL: login did not succeed:', body);
  process.exit(1);
}
`]);
  console.log(r.stdout.trim());

  // 4. Also confirm the OLD password no longer works.
  const r2 = run('node', ['-e', `
const { spawnSync } = require('node:child_process');
const r = spawnSync('curl', ['-s', '-X', 'POST', 'localhost:3000/api/auth/login',
  '-H', 'Content-Type: application/json',
  '-d', JSON.stringify({ identifier: ${JSON.stringify(adminEmail)}, password: 'OLDWRONGPASSWORD123' })],
  { encoding: 'utf8' });
const j = JSON.parse(r.stdout.trim());
console.log(j.error ? 'PASS: old password rejected (' + j.error + ')' : 'FAIL: old password still works');
`]);
  console.log(r2.stdout.trim());

  // 5. Cleanup
  try { process.kill(-server.pid); } catch (e) {}
  await wait(500);
  fs.rmSync(DATA, { recursive: true, force: true });
  console.log('done');
})().catch(e => { console.error('TEST ERROR:', e.message); try { process.kill(-server.pid); } catch (_) {} process.exit(1); });
