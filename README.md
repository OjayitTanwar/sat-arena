# 🎓 SAT Arena

A **gamified SAT prep web app** with real account login, a dashboard that tracks your progress, **questions generated live on the spot** that mimic real SAT questions, a **full-length simulated practice test** with real digital-SAT timing, **adaptive modules**, a built-in **Desmos graphing calculator**, a **SAT-style marks system**, XP/levels/streaks/badges, a leaderboard, and a **free AI tutor** (optional real LLM via a free Gemini key).

No build step, no paid APIs required. Data persists in a local SQLite file in dev, or in free **Turso** (SQLite over HTTPS) when deployed to a free always-on host like Render — the DB layer auto-detects.

---

## ✨ Features

| Feature | Details |
|---|---|
| **Auth** | Real signup/login with hashed passwords (scrypt + salt), HttpOnly session cookies, SQLite storage, optional **Google sign-in (OAuth 2.0)** |
| **Dashboard** | Level ring, XP progress bar, daily streak 🔥, weekly activity chart, badge collection, exam countdown, daily goal tracker |
| **Weak-area analytics** | Accuracy per topic; your weakest topics (accuracy < 60%) surface on the dashboard with one-click **targeted drill** |
| **Adaptive difficulty** | A server-tracked skill rating (0–100) adjusts after every answer — difficulty moves one step at a time between Easy/Medium/Hard. Harder questions give more XP |
| **Per-topic proficiency** | Every topic gets its own difficulty-weighted rating with bands (Developing → Proficient → Advanced → Mastered); shown on the dashboard, in drills, and on each answer's feedback. Full practice-test answers feed it too |
| **Full practice test** | **Real digital-SAT length** — 4 modules, 108 questions, ~2h15m. R&W modules run 32 min each, Math modules 35 min each, with **adaptive Module 2** (difficulty set by your Module 1 score, like Bluebook). Instant feedback per question + estimated **400–1600 scaled score** with letter grade, section breakdowns, and question-by-question review |
| **Desmos built-in** | The **same graphing calculator the real SAT uses** (official Desmos embed) is available in every Math module via a 🧮 toggle — in both quick practice and the full test |
| **SAT-style marking** | Difficulty-weighted **marks** (10/20/30 per question, +4 speed bonus, **no penalty for wrong answers** — just like the real SAT), mapped to a letter grade (S–F) on round results |
| **Harder questions** | Every math template rewritten significantly harder — bigger numbers, multi-step algebra, negative values, harder geometry/data; reading gained a hard vocab tier + tougher passages. All 34 math templates independently re-solved and verified |
| **Massive hard question bank** | **61 math template topics** (up from 34) — quadratics (discriminant, vertex, minimum), function composition, systems (no-solution / infinitely-many), radical equations, complex numbers, right-triangle trig, inscribed angles, similar triangles, sphere/sector/arc, density, work-rate, mixtures, overlapping sets, linear/exponential tables, slope-intercept, mean-removal, ratio-difference, and new grid-ins (systems + fraction answers like 3/2 that accept 1.5). Reading: **19 more hard vocab words**, 4 new grammar builders (pronoun case, its/it's, comparatives, intervening phrases), 7 more transitions, 4 new passages. Every new template auto-verified (4 unique choices, correct answer index, no junk strings) |
| **Duolingo-style game layer** | Daily quests (answer 15 · get 10 right · earn 100 XP — reset locally at midnight), a reactive **owl mascot** in the game that cheers or comforts, **hearts in the top bar** during rounds, an animated **XP count-up** and **Perfect round** celebration on results, and a **Review your misses** list on every round result. Keyboard shortcuts: press **1-4 / A-D** to answer, **Enter** to submit a grid-in |
| **Live question generation** | Template engine generates fresh SAT-authentic questions every request — algebra, quadratics, systems, exponents, geometry, data, **grid-in (student-produced response)**, vocab-in-context, grammar, transitions, and 12+ reading passages |
| **Game modes** | ⚡ Quick Fire, 🧮 Math Arena, 📖 Reading Blitz, ⏱️ Timed Challenge (45s/question, speed bonus), 🎯 targeted topic drills (each shows its live proficiency %) |
| **Gamification** | XP with combo/speed/difficulty bonuses, 13 badges (🌱 First Steps → 💯 Century Club), 3-lives heart system, daily streaks, global leaderboard |
| **AI Tutor** | "SAT Sage" answers strategy/grammar/math questions. Works with **zero API keys** via a built-in tutor; optionally upgraded to a real free-tier LLM — paste a **free Google Gemini key in Settings** (stored per-account) or set a `GEMINI_API_KEY`/`GROQ_API_KEY` env var. Falls back gracefully if the API call fails |
| **Polish** | Web-Audio sound effects (correct/wrong/level-up), light/dark theme toggle, confetti, XP popups, micro-interactions |
| **Anti-cheat** | The correct answer is never sent to the client in quick practice — grading happens server-side via a question cache |

---

## 🎨 Design system

SAT Arena's UI follows an **Apple minimalism meets Duolingo playfulness** principle:

- **Flat & clean** — no gradients, no drop shadows. Thin 0.5–1px hairline borders define cards and buttons.
- **One accent color** — a saturated green (`#16a34a`) used sparingly: the primary button, progress rings, active states. Success is soft green (`#34d399`); locked/inactive content is muted gray at reduced opacity.
- **Typography** — system sans-serif (SF Pro / Inter) in two weights (regular + medium). Sentence case everywhere, no all-caps, no exclamation marks. 18px medium titles, 14–15px body, 13px muted captions.
- **Layout** — single-column, thumb-friendly with generous whitespace (20–28px outer padding, 12–16px gaps). Large corner radii (16–28px) on cards and buttons. One primary action per screen.
- **Icons** — simple outline stroke icons only (checkmark, flame, gem, lock, book, zap, clock, calculator). No filled/skeuomorphic icons, no emoji.
- **Components** — circular progress ring with percentage in the center, streak counter (flame icon + number) and points counter (gem icon + XP) in the top bar, vertical lesson path with completed/current/locked states (Duolingo-style), and a full-width primary button (52px tall, pill-shaped).

Light theme is the default; a muted dark theme is available via the sidebar toggle.

```bash
npm install
npm start          # or: npm run dev (auto-restart)
```

Then open **http://localhost:3000** — create an account and start training.

> Requires **Node.js ≥ 22.5** (uses the built-in `node:sqlite` module — no native compilation).

## 🔐 Admin account

The admin account is seeded on every server start from env vars (see `.env.example`):

- `ADMIN_EMAIL` (default: the original admin email) and `ADMIN_USERNAME` (default: `admin`) define the account.
- `ADMIN_PASSWORD` has **no default and never ships in source**. While it's set, the seed force-sets the admin's password to that value on every start (guaranteed access). When it's **unset**, an existing admin's password is left untouched — a restart no longer reverts a password you changed — and a brand-new admin gets a **random password printed once** in the server log.

To rotate the admin password: put `ADMIN_PASSWORD=<new>` in `.env` and restart the server once, then remove it (or keep it to pin the password permanently). The admin panel lives at `/#/admin`.

## 🤖 Optional: free AI tutor upgrade

The app works 100% without API keys. To supercharge the tutor with a real LLM, either:

- **In-app (per user):** open **Settings → Free AI key** and paste a free Google Gemini key. It's stored on your account and powers SAT Sage immediately.
- **Globally:** copy `.env.example` to `.env` and add **one** free-tier key:
  - **Google Gemini (free tier):** `GEMINI_API_KEY=...` — get one at https://aistudio.google.com/apikey
- **Google sign-in:** set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env` to enable "Continue with Google". Create an OAuth 2.0 Client ID (Web application) at Google Cloud Console and add `http://localhost:3000/api/auth/google/callback` as an authorized redirect URI. **Or** enter them in the admin panel → Integrations — no restart needed.
- **Admin control center** (`/#/admin`): the admin account can manage everything from one place — Overview (stats + top XP), Users (full table + per-user detail), **Integrations** (set Google OAuth keys, server-wide Gemini/Groq AI keys, and APP_URL live from the UI — stored in the DB with env fallback, applied instantly), and Activity (admin action log).
  - **OR Groq (free tier):** `GROQ_API_KEY=...` — get one at https://console.groq.com/keys

If the LLM call fails, the tutor automatically falls back to the built-in engine.

---

## ✨ Recent UI polish (loop rounds)

- **Chat + mascot** — SAT Sage bubbles now have a mascot avatar, typing shows three bouncing dots, and the auth page greets you with the study buddy (floating animation).
- **Live feedback** — top-bar streak/XP chips pop when they change, mode cards have press feedback and XP hints, and round results now show an animated accuracy ring with a count-up.
- **Leaderboard** — top 3 get a podium above the table (gold/silver/bronze), your own row is highlighted with a "you" tag.
- **Full-test results** — the scaled score sits inside an animated 400–1600 progress ring with a count-up.
- **Dashboard** — weekly activity bars grow in with a stagger, settings modal got a cleaner layout with an AI-tutor divider.
- All usernames in the leaderboard/podium are HTML-escaped.

## ☁️ Deploy to Cloudflare

SAT Arena is a standard Node/Express server (no build step, file-based SQLite). There are two ways to put it on Cloudflare:

### Option A — Cloudflare Tunnel (recommended, zero code changes)

The server keeps running on any always-on machine (a $5 VPS, an old laptop, or your own box) and Cloudflare proxies your domain to it over a secure tunnel. Works with the free plan, and everything — SQLite, sessions, Google OAuth, Desmos — behaves exactly like localhost.

**1. Get a domain on Cloudflare** (free plan is fine) or use a free `*.trycloudflare.com` quick URL for testing.

**2. Install `cloudflared` and log in:**
```bash
brew install cloudflared        # macOS
# or: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads
cloudflared tunnel login        # opens browser, picks a zone
```

**3. Create a named tunnel and give it a DNS route:**
```bash
cloudflared tunnel create satarena
cloudflared tunnel route dns satarena sat.yourdomain.com
```

**4. Run the server and the tunnel on that machine:**
```bash
# in a tmux session / systemd service on the server:
node server.js

# and:
cloudflared tunnel run satarena
```
That's it — `https://sat.yourdomain.com` now serves the app. Your `data/satarena.db` lives on that machine, so progress persists.

**5. Post-deploy config:**
- Set `APP_URL=https://sat.yourdomain.com` (in `.env` or the admin panel → Integrations) so Google OAuth builds the right callback.
- Add `https://sat.yourdomain.com/api/auth/google/callback` to your Google Cloud console as an authorized redirect URI.
- The admin panel → Integrations keeps all keys editable live.

### ✅ Deployed on this Mac (launchd — always-on, zero cloud cost)

The app is **live right now** from this machine through a free Cloudflare quick tunnel, kept alive by two launchd agents (`~/Library/LaunchAgents/com.satarena.server.plist` + `com.satarena.tunnel.plist`). Both auto-restart if they crash and come back on reboot.

**Get the current public URL** (quick-tunnel URLs change each time the tunnel restarts):
```bash
grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/tunnel.log | tail -1
```

**Daily ops:**
```bash
launchctl list | grep satarena        # both agents should show a PID
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/   # server health
launchctl kickstart -k gui/$(id -u)/com.satarena.server    # restart the server only
```

**Stop everything:**
```bash
launchctl unload ~/Library/LaunchAgents/com.satarena.server.plist
launchctl unload ~/Library/LaunchAgents/com.satarena.tunnel.plist
```

**Upgrade to a permanent URL** (quick-tunnel URL stops changing):
```bash
cloudflared tunnel login                 # one-time browser auth, picks your zone
cloudflared tunnel create satarena
cloudflared tunnel route dns satarena sat.yourdomain.com
# then edit com.satarena.tunnel.plist: replace '--url http://localhost:3000'
# with 'run' + 'satarena', and reload: launchctl unload/load the plist
```

## ☁️ Deploy to Render (free, always-on, persistent data)

SAT Arena is already wired for a free always-on host: **Render free web service + Turso (free persistent SQLite over HTTPS)**. Render's free tier spins down after ~15 min idle and wipes its local filesystem on every restart, so a plain SQLite file can't live there — that's why `db.js` is an async facade: set `TURSO_URL` + `TURSO_AUTH_TOKEN` and every query runs against Turso (persistent across spin-downs and redeploys); without them it uses the local `data/satarena.db` for dev.

**1. Create a free Turso database (~2 min):**
```bash
curl -sSfL https://get.turso.tech/install.sh | bash   # installs the `turso` CLI
# restart your shell, then:
turso auth login
turso db create sat-arena
turso db show sat-arena --url        # prints TURSO_URL (libsql://sat-arena-<org>.turso.io)
turso db tokens create sat-arena     # prints TURSO_AUTH_TOKEN
```

**2. Push this repo to GitHub** (`git init` → `git add .` → commit → push to a new repo).

**3. Create the Render service:**
- Render dashboard → **New → Blueprint** → connect the GitHub repo (it reads `render.yaml`).
- Fill the secret env vars: `TURSO_URL`, `TURSO_AUTH_TOKEN`, and `APP_URL` (your `https://<name>.onrender.com` URL).
- Deploy. The app migrates the schema into Turso, seeds the admin account, and serves.

**4. Post-deploy (optional but recommended):**
- Set `APP_URL` so Google OAuth builds the right callback, and add `https://<your-app>.onrender.com/api/auth/google/callback` to the Google Cloud console.
- Add a free `GEMINI_API_KEY` (aistudio.google.com/apikey) to power SAT Sage server-wide — or let users paste their own key in Settings.
- The admin panel (`/#/admin` → Integrations) can manage all of these live from the UI.

> **Cold starts:** free Render instances sleep after ~15 min idle and take ~30–60s to wake on the first request. Traffic wakes it; your data is never lost.

### Option B — Cloudflare Workers + D1 (fully serverless, needs a refactor)

Workers have **no persistent filesystem**, so the file-based `node:sqlite` database and in-memory session/OAuth state do not survive there. Going this route requires porting the data layer:

- Replace `node:sqlite` (`db.js`) with **Cloudflare D1** (async `await env.DB.prepare(...)`) — every route becomes async.
- Move sessions, the OAuth `state` map, and the config cache into **D1/KV** instead of in-memory Maps.
- Run Express inside the Worker via `cloudflare:node`'s `httpServerHandler` + `nodejs_compat` in `wrangler.toml`.
- Serve `public/` as Workers Static Assets.

It's a real migration (every DB call changes from sync to async). If you want the app live today, use **Option A**; if you'd like me to do the D1 migration, say so and I'll take it on.

---

## 🗂️ Project structure

```
├── server.js                  Express API: auth, sessions, questions, grading, full tests,
│                              weak-area analytics, study plan, settings, tutor
├── db.js                      async SQLite facade + schema (local node:sqlite ↔ Turso/libsql remote)
├── lib/
│   ├── questions/
│   │   ├── index.js           orchestrator: drills, adaptive full-length test modules, scaled scores
│   │   ├── math.js            34 harder templates incl. grid-in answers (independently verified)
│   │   ├── reading.js         vocab, grammar, transitions + 14 reading passages
│   │   └── util.js            random helpers + content-hash ids
│   ├── gamification.js        XP, levels, streak & badge logic + adaptive rating + SAT-style marks
│   └── ai-tutor.js            Gemini/Groq integration + built-in tutor fallback
├── public/                    vanilla JS SPA (no framework, no build step)
│   ├── index.html
│   ├── styles.css             gamified UI with light/dark themes
│   └── app.js                 router, dashboard, games, full adaptive test, Desmos, settings
├── scripts/                   verification scripts (curl + headless Chrome)
└── data/                      created at runtime — satarena.db (gitignored)
```

## 🔐 How grading stays honest

1. `GET /api/question` generates questions and keeps the answers in an **in-memory cache** keyed by content hash.
2. In quick practice the client only ever receives the prompt + choices — `POST /api/answer` grades server-side.
3. Full practice tests include answers client-side for **instant feedback** (it's a practice tool); the scaled score is still computed server-side from the submitted answers, and the client is told nothing that would let it fake the score.
4. Grid-in (student-produced response) answers are normalized server-side (`"7"`, `"7.0"`, and `"3/4"` vs `"0.75"` all match).
5. **Marks** are difficulty-weighted (10/20/30 + 4 speed bonus) with **no guessing penalty**, mirroring the real SAT. The round grade (S–F) comes from your % of maximum achievable marks.
6. **Desmos** loads from the official public embed (the same graphing calculator the digital SAT ships) only when you open the 🧮 toggle.

## 📝 Notes

- **XP & levels:** advancing from level N→N+1 costs `100 × N` XP (level 2 at 100 XP, level 3 at 300, level 5 at 1000…).
- **Combo:** consecutive correct answers multiply XP (capped), and the 3-heart system ends a round after 3 misses. Combo is tracked server-side and resets each round.
- **Adaptive rating:** both the global skill rating and per-topic ratings are updated as a difficulty-weighted moving average (harder questions move the needle more). Difficulty changes are capped at one step per answer for stability.
- **Scaled score:** each section maps linearly to 200–800 (0% → 200, 100% → 800); the total is 400–1600.
- **Full test:** 108 unique questions across 4 modules (module 2s generated on the fly after your Module 1, difficulty set by your ≥70% threshold). Finish early or let the real per-module timer run out — either way you get a full score.
- **Sessions** are DB-backed tokens; expired sessions are filtered on every request.
- Test data lives in `data/` — delete the folder to reset everyone's progress.
