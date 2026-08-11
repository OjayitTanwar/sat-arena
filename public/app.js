'use strict';

/* ─── SAT Arena frontend ─────────────────────────────────────────────────── */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const state = {
  user: null,
  view: 'dashboard',
  game: null,          // active quick-practice game
  test: null,          // active full practice test
  tutorHistory: [],
  topicStats: null,    // per-topic proficiency ratings (from /api/topics)
  store: null,         // gem balance + inventory snapshot (from /api/store / dashboard)
  calc: null,          // Desmos calculator instance
  soundOn: localStorage.getItem('sat_sound') !== 'off',
  theme: localStorage.getItem('sat_theme') || 'light',
};

// admin-panel flags (declared with state so their scope is obvious)
let state_adminLogsLoaded = false;
let state_adminPanelLogged = false;

// ── outline icon set (stroke-based, no emoji) ─────────────────────────────
const ICON_SVG = {
  check: '<svg class="icon sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  x: '<svg class="icon sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  clock: '<svg class="icon sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
  heart: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
  trophy: '<svg class="icon lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v6a5 5 0 0 1-10 0V4z"/><path d="M7 6H4a1 1 0 0 0-1 1 3 3 0 0 0 3 3"/><path d="M17 6h3a1 1 0 0 1 1 1 3 3 0 0 1-3 3"/></svg>',
  star: '<svg class="icon lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/></svg>',
  flag: '<svg class="icon lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
  lock: '<svg class="icon sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  flame: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3 1.07-1.06 2.78-3.5 2.78-5.5 0-1.38-.5-2-1-3C13 2 14 4 14 6.5 14 8.5 12.5 10 12 12c.5-1 1-2 1-3.5 1.07 1.06 2 2.5 2 4.5 0 2.76-2.24 5-5 5s-5-2.24-5-5c0-1.5.5-2.5 1-3 .5 1 1 2 1 3 0 .75-.25 1.5-.5 2z"/></svg>',
  gem: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l4 6-10 12L2 9l4-6z"/><path d="M2 9h20"/><path d="M12 21L8 9l4-6 4 6-4 12"/></svg>',
  book: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  zap: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  calendar: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  calculator: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="11" x2="8" y2="11"/><line x1="12" y1="11" x2="12" y2="11"/><line x1="16" y1="11" x2="16" y2="11"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="12" y1="16" x2="12" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>',
  sun: '<svg class="icon sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4" y1="12" x2="2" y2="12"/><line x1="22" y1="12" x2="20" y2="12"/><line x1="5" y1="5" x2="6.5" y2="6.5"/><line x1="17.5" y1="17.5" x2="19" y2="19"/><line x1="5" y1="19" x2="6.5" y2="17.5"/><line x1="17.5" y1="6.5" x2="19" y2="5"/></svg>',
  moon: '<svg class="icon sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  volume: '<svg class="icon sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>',
  mute: '<svg class="icon sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>',
  eye: '<svg class="icon sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg class="icon sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
};
const ICONS = {
  check: ICON_SVG.check, x: ICON_SVG.x, clock: ICON_SVG.clock, heart: ICON_SVG.heart,
  trophy: ICON_SVG.trophy, star: ICON_SVG.star, flag: ICON_SVG.flag, lock: ICON_SVG.lock,
  flame: ICON_SVG.flame, gem: ICON_SVG.gem, book: ICON_SVG.book, zap: ICON_SVG.zap,
  calendar: ICON_SVG.calendar, calculator: ICON_SVG.calculator,
  sun: ICON_SVG.sun, moon: ICON_SVG.moon, volume: ICON_SVG.volume, mute: ICON_SVG.mute,
  eye: ICON_SVG.eye, eyeOff: ICON_SVG.eyeOff,
};
const BADGE_ICONS = {
  first_question: 'flag', five_questions: 'zap', twenty_five: 'book', hundred: 'trophy',
  combo_5: 'flame', combo_10: 'flame', level_5: 'star', level_10: 'star',
  streak_3: 'calendar', streak_7: 'calendar', perfect_round: 'trophy',
  math_whiz: 'calculator', reading_star: 'book',
};
const badgeIcon = (id) => ICONS[BADGE_ICONS[id]] || ICONS.star;

// ── Sound effects (Web Audio, no files needed) ─────────────────────────────
const Sound = {
  ctx: null,
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  tone(freq, dur = 0.15, type = 'sine', vol = 0.18, delay = 0) {
    if (!state.soundOn) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  },
  correct() { this.tone(523.25, 0.12); this.tone(659.25, 0.12, 'sine', 0.18, 0.09); this.tone(783.99, 0.2, 'sine', 0.18, 0.18); },
  wrong() { this.tone(220, 0.18, 'sawtooth', 0.12); this.tone(174.6, 0.25, 'sawtooth', 0.12, 0.12); },
  levelUp() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.2, i * 0.1)); },
  click() { this.tone(660, 0.05, 'square', 0.06); },
  tick() { this.tone(880, 0.04, 'square', 0.05); },
  finish() { [392, 523.25, 659.25, 783.99].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.18, i * 0.12)); },
};

// ── Theme ──────────────────────────────────────────────────────────────────
function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  $('#theme-btn').innerHTML = state.theme === 'dark' ? ICONS.sun : ICONS.moon;
}

// ── API helper ─────────────────────────────────────────────────────────────
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    // A 401 on the login endpoint means bad credentials — show the server's
    // real message instead of pretending the session expired.
    if (path.includes('/api/auth/login')) {
      throw new Error(data.error || 'Incorrect username or password.');
    }
    state.user = null;
    showView('auth');
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    // 402 = plan gate hit (daily limit / premium feature) — carry the flag so
    // callers can open the upgrade modal instead of just toasting.
    if (res.status === 402) { err.upgrade = true; err.code = data.code || 'premium'; }
    throw err;
  }
  return data;
}

// ── Router ─────────────────────────────────────────────────────────────────
const VIEWS = ['dashboard', 'practice', 'test', 'test-results', 'leaderboard', 'tutor', 'store', 'results', 'auth', 'admin'];

function parseHash() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [rawView, ...rest] = hash.split('/');
  const [view, query] = rawView.split('?'); // strip any ?query from the view name
  return { view: view || 'dashboard', param: rest.join('/'), query: query || '' };
}

function navigate(view) {
  location.hash = '/' + view;
}

function showView(view) {
  // stop any live timers when the user navigates away mid-module/mid-round so
  // they can't fire into hidden views (e.g. a full-test countdown advancing the
  // test while the user is on the dashboard)
  if (state.view !== view) {
    if (state.test && state.test.timer && view !== 'test' && view !== 'test-results') {
      clearInterval(state.test.timer);
      state.test.timer = null;
    }
    if (state.game && state.game.timerInterval && view !== 'practice' && view !== 'results') {
      clearInterval(state.game.timerInterval);
      state.game.timerInterval = null;
    }
    // the round-lives hearts only make sense while a round is on screen
    if (state.game && view !== 'practice') {
      const topHearts = $('#top-hearts');
      if (topHearts) topHearts.classList.add('hidden');
    }
  }
  state.view = view;
  const authed = state.user != null;
  $('#view-auth').classList.toggle('hidden', authed || view !== 'auth');
  $('#app').classList.toggle('hidden', !authed);

  if (authed) {
    $$('.app-view').forEach((v) => v.classList.add('hidden'));
    const el = $('#view-' + view);
    if (el) el.classList.remove('hidden');
    $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  }

  if (view === 'auth') handleGoogleError();
  if (view === 'dashboard' && authed) loadDashboard().catch(() => toast('Could not load dashboard.'));
  if (view === 'leaderboard' && authed) loadLeaderboard().catch(() => toast('Could not load leaderboard.'));
  if (view === 'practice' && authed) resetPracticeMenu();
  if (view === 'tutor' && authed) refreshTutorStatus();
  if (view === 'test' && authed) resetTestMenu();
  if (view === 'store' && authed) loadStore().catch(() => toast('Could not load the store.'));
  if (view === 'admin' && authed) loadAdminPanel().catch(() => toast('Could not load admin panel.'));
}

window.addEventListener('hashchange', () => {
  const { view } = parseHash();
  if (view !== state.view) showView(view);
});

// ── Toast / confetti / level-up ────────────────────────────────────────────
let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function confetti(n = 90) {
  const layer = $('#confetti-layer');
  const colors = ['#6c5ce7', '#a855f7', '#ec4899', '#fbbf24', '#34d399', '#22d3ee'];
  for (let i = 0; i < n; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = (2.2 + Math.random() * 2) + 's';
    c.style.animationDelay = Math.random() * 0.6 + 's';
    c.style.transform = `rotate(${Math.random() * 360}deg)`;
    layer.appendChild(c);
  }
  setTimeout(() => (layer.innerHTML = ''), 5200);
}

function xpPop(xp, x, y) {
  const el = document.createElement('div');
  el.className = 'xp-pop';
  el.textContent = '+' + xp + ' XP';
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function countUp(el, target, prefix = '', suffix = '') {
  if (!el) return;
  const dur = 900;
  const t0 = performance.now();
  (function frame(now) {
    const p = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = prefix + Math.round(target * eased) + suffix;
    if (p < 1) requestAnimationFrame(frame);
  })(performance.now());
}

// pop animation on a counter chip (streak / gems) when its value changes
function popNum(el) {
  if (!el) return;
  el.classList.remove('pop');
  void el.offsetWidth; // restart the CSS animation
  el.classList.add('pop');
}
function setCounter(el, value) {
  if (!el) return;
  if (el.textContent === String(value)) return; // don't pop when nothing changed
  el.textContent = value;
  const parent = el.parentElement;
  if (parent && parent.classList.contains('counter')) popNum(parent);
}

// ── Daily quests (local counters, reset at local midnight) ─────────────────
function questDay() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function questData() {
  const key = 'sat_quests_' + questDay();
  let d = {};
  try { d = JSON.parse(localStorage.getItem(key)) || {}; } catch {}
  return { key, d };
}
function trackQuestAnswer(correct, xp) {
  const { key, d } = questData();
  d.answers = (d.answers || 0) + 1;
  if (correct) d.correct = (d.correct || 0) + 1;
  d.xp = (d.xp || 0) + (xp || 0);
  localStorage.setItem(key, JSON.stringify(d));
  // celebrate each quest the moment it crosses its target (one shot per day)
  d.done = d.done || [];
  const qs = [
    ['Answer 15 questions', d.answers, 15, 'a'],
    ['Get 10 answers right', d.correct, 10, 'c'],
    ['Earn 100 XP', d.xp, 100, 'x'],
  ];
  let crossed = 0;
  for (const [label, now, target, id] of qs) {
    if (now >= target && !d.done.includes(id)) {
      d.done.push(id);
      crossed++;
    }
  }
  if (crossed) {
    localStorage.setItem(key, JSON.stringify(d));
    confetti(60 + crossed * 30);
    if (d.done.length >= 3) setTimeout(() => toast('All daily quests complete — what a day'), 400);
    else setTimeout(() => toast('Quest complete — keep the streak going'), 400);
  }
  renderQuests();
}
function renderQuests() {
  const wrap = $('#quests-grid');
  if (!wrap) return;
  const { d } = questData();
  const quests = [
    { id: 'a', icon: ICONS.zap, label: 'Answer 15 questions', now: d.answers || 0, target: 15 },
    { id: 'c', icon: ICONS.check, label: 'Get 10 answers right', now: d.correct || 0, target: 10 },
    { id: 'x', icon: ICONS.gem, label: 'Earn 100 XP', now: d.xp || 0, target: 100 },
  ];
  wrap.innerHTML = quests.map((q) => {
    const pct = Math.min(100, Math.round((q.now / q.target) * 100));
    const done = q.now >= q.target || (d.done || []).includes(q.id);
    return `<div class="quest ${done ? 'done' : ''}">
      <span class="quest-ico">${q.icon}</span>
      <div class="quest-body">
        <span class="quest-name">${q.label}</span>
        <div class="quest-bar"><div class="quest-fill" style="width:${pct}%"></div></div>
        <span class="quest-count muted small">${Math.min(q.now, q.target)} / ${q.target}</span>
      </div>
      <span class="quest-check">${done ? ICONS.check : ''}</span>
    </div>`;
  }).join('');
}

// ── Mascot (Duolingo-style study buddy) ────────────────────────────────────
const MASCOT_SVG = {
  idle: '<svg viewBox="0 0 64 64"><ellipse cx="32" cy="38" rx="19" ry="21" fill="#58cc02"/><ellipse cx="32" cy="47" rx="11" ry="9" fill="#ffffff"/><circle cx="21" cy="25" r="8.5" fill="#ffffff"/><circle cx="43" cy="25" r="8.5" fill="#ffffff"/><circle cx="24" cy="26" r="3.5" fill="#2b2b2b"/><circle cx="40" cy="26" r="3.5" fill="#2b2b2b"/><path d="M32 30l-4.5 5h9z" fill="#ffc800"/><path d="M13 40c-4 2-5 5-5 7" stroke="#3c8c00" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M51 40c4 2 5 5 5 7" stroke="#3c8c00" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
  happy: '<svg viewBox="0 0 64 64"><ellipse cx="32" cy="38" rx="19" ry="21" fill="#58cc02"/><ellipse cx="32" cy="47" rx="11" ry="9" fill="#ffffff"/><path d="M14 24q7-7 14 0" stroke="#2b2b2b" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M36 24q7-7 14 0" stroke="#2b2b2b" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M32 30l-4.5 5h9z" fill="#ffc800"/><path d="M27 45q5 4 10 0" stroke="#2b2b2b" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M13 40c-4 2-5 5-5 7" stroke="#3c8c00" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M51 40c4 2 5 5 5 7" stroke="#3c8c00" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
  sad: '<svg viewBox="0 0 64 64"><ellipse cx="32" cy="38" rx="19" ry="21" fill="#7fb25a"/><ellipse cx="32" cy="47" rx="11" ry="9" fill="#ffffff"/><circle cx="21" cy="27" r="4.5" fill="#2b2b2b"/><circle cx="43" cy="27" r="4.5" fill="#2b2b2b"/><path d="M32 32l-4.5 5h9z" fill="#d9a500"/><path d="M27 45q5-4 10 0" stroke="#2b2b2b" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M13 40c-4 2-5 5-5 7" stroke="#4d7a33" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M51 40c4 2 5 5 5 7" stroke="#4d7a33" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
};
function mascotReact(mood, msg) {
  const el = $('#game-mascot');
  if (!el) return;
  el.innerHTML = MASCOT_SVG[mood] || MASCOT_SVG.idle;
  el.classList.remove('happy', 'sad');
  if (mood === 'happy' || mood === 'sad') el.classList.add(mood);
  const m = $('#mascot-msg');
  if (m && msg) m.textContent = msg;
}
function showTopHearts() {
  const th = $('#top-hearts');
  if (th) th.classList.remove('hidden');
  const g = state.game;
  const num = $('#top-hearts-num');
  if (num && g) num.textContent = g.lives;
}

// ── Password visibility toggle (show/hide) ────────────────────────────────
// Each password field gets a small eye button. Clicking it swaps between
// password/text and swaps the icon.
function initPasswordToggles() {
  const pairs = [
    ['#login-password', '#login-pw-toggle'],
    ['#su-password', '#su-pw-toggle'],
    ['#reset-password', '#reset-pw-toggle'],
    ['#set-ai-key', '#set-ai-key-toggle'],
  ];
  for (const [inputSel, btnSel] of pairs) {
    const input = $(inputSel);
    const btn = $(btnSel);
    if (!input || !btn) continue;
    btn.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = show ? ICONS.eyeOff : ICONS.eye;
      btn.title = show ? 'Hide password' : 'Show password';
      input.focus();
    });
  }
}

// ── Premium plan / free-tier limits / ads ─────────────────────────────────
state.plan = { premium: false, plan: 'free', priceCents: 999, dailyUsed: 0, dailyLimit: 10, tutorUsed: 0, tutorLimit: 3 };

function applyPlan(plan) {
  if (!plan) return;
  state.plan = { ...state.plan, ...plan };
  const badge = $('#top-premium-badge');
  if (badge) badge.classList.toggle('hidden', !plan.premium);
  renderFreeLimit();
  renderTutorLimitNote();
}

// “Free plan: X of 10 questions left today” chip on the practice screen
function renderFreeLimit() {
  const card = $('#free-limit-card');
  const text = $('#free-limit-text');
  if (!card || !text) return;
  const free = state.user && !state.user.is_admin && !state.plan.premium;
  if (free) {
    const left = Math.max(0, state.plan.dailyLimit - state.plan.dailyUsed);
    card.classList.remove('hidden');
    text.innerHTML = `<b>Free plan:</b> ${left} of ${state.plan.dailyLimit} questions left today — go premium for unlimited practice.`;
  } else {
    card.classList.add('hidden');
  }
}

function renderTutorLimitNote() {
  const note = $('#tutor-limit-note');
  if (!note) return;
  const free = state.user && !state.user.is_admin && !state.plan.premium;
  if (free) {
    const left = Math.max(0, state.plan.tutorLimit - state.plan.tutorUsed);
    note.classList.remove('hidden');
    note.textContent = `Free tier: ${left} of ${state.plan.tutorLimit} tutor messages left today. Premium chats freely.`;
  } else {
    note.classList.add('hidden');
  }
}

function isFreeUser() {
  return state.user && !state.user.is_admin && !state.plan.premium;
}

// True when the daily practice quota still has room (or the user is premium).
function practiceQuotaLeft() {
  if (!isFreeUser()) return true;
  return state.plan.dailyUsed < state.plan.dailyLimit;
}

// ── Upgrade modal ──────────────────────────────────────────────────────────
function openUpgrade(reason) {
  $('#upgrade-error').textContent = '';
  const price = state.plan.priceCents ? '$' + (state.plan.priceCents / 100).toFixed(2) : '$9.99';
  const priceEl = $('#upgrade-price');
  if (priceEl) priceEl.innerHTML = price + '<span>/month</span>';
  $('#upgrade-modal').classList.remove('hidden');
}
function closeUpgrade() {
  $('#upgrade-modal').classList.add('hidden');
}

async function subscribePremium() {
  const btn = $('#upgrade-subscribe-btn');
  const label = btn.querySelector('.btn-label');
  const spinner = btn.querySelector('.btn-spinner');
  btn.disabled = true;
  if (label) label.classList.add('hidden');
  if (spinner) spinner.classList.remove('hidden');
  try {
    const r = await api('/api/subscribe', { method: 'POST' });
    if (r.url) { location.href = r.url; return; } // Stripe checkout
    if (r.already) { closeUpgrade(); toast('You are already premium'); return; }
  } catch (err) {
    $('#upgrade-error').textContent = err.message + ' (The admin can grant premium free from the admin panel.)';
    Sound.wrong();
  } finally {
    btn.disabled = false;
    if (label) label.classList.remove('hidden');
    if (spinner) spinner.classList.add('hidden');
  }
}

// ── Ad slots (free tier only) ──────────────────────────────────────────────
// The admin pastes the ad network snippet (e.g. Adsterra) in the admin panel;
// when enabled it renders into the dashboard/practice/test slots.
function renderAds(ads) {
  const enabled = ads && ads.enabled && ads.code && isFreeUser();
  const slots = ['#ad-slot-dashboard', '#ad-slot-practice', '#ad-slot-test'];
  for (const sel of slots) {
    const el = $(sel);
    if (!el) continue;
    if (enabled) {
      el.classList.remove('hidden');
      // re-create <script> nodes so the ad snippet actually executes
      el.innerHTML = '';
      const tmp = document.createElement('div');
      tmp.innerHTML = ads.code;
      for (const node of [...tmp.children]) {
        if (node.tagName === 'SCRIPT') {
          const s = document.createElement('script');
          for (const attr of [...node.attributes]) s.setAttribute(attr.name, attr.value);
          s.textContent = node.textContent;
          el.appendChild(s);
        } else {
          el.appendChild(node);
        }
      }
    } else {
      el.classList.add('hidden');
      el.innerHTML = '';
    }
  }
}

// ── Auth ───────────────────────────────────────────────────────────────────
const GOOGLE_ERROR_MSGS = {
  '1': 'Google sign-in was cancelled.',
  '2': 'Google sign-in expired — please try again.',
  '3': 'Google could not complete the sign-in — try again.',
  '4': 'Could not verify your Google account.',
  '5': 'That Google account has no verified email.',
  '6': 'Google sign-in hit a snag — try again in a moment.',
};

function handleGoogleError() {
  const { query } = parseHash();
  if (!query) return;
  const params = new URLSearchParams(query);
  const code = params.get('google_error');
  if (!code) return;
  const msg = GOOGLE_ERROR_MSGS[code] || 'Google sign-in failed.';
  const errEl = $('#login-error');
  if (errEl) errEl.textContent = msg;
  // clean the error out of the URL so a refresh doesn't show it again
  history.replaceState(null, '', '#/auth');
  toast(msg);
}

function initAuth() {
  $$('.auth-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.auth-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const isLogin = tab.dataset.tab === 'login';
      $('#form-login').classList.toggle('hidden', !isLogin);
      $('#form-signup').classList.toggle('hidden', isLogin);
      $('#form-reset').classList.add('hidden');
      $('#login-error').textContent = '';
      $('#signup-error').textContent = '';
      $('#signup-step1').classList.remove('hidden');
      $('#signup-step2').classList.add('hidden');
      pendingSignup = null;
    });
  });

  // ── FormPost webhook ────────────────────────────────────────────────────
  async function postToFormpost(data) {
    try {
      await fetch('https://submit.formpost.ai/2usoeqa5', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data),
      });
    } catch { /* non-blocking */ }
  }

  // ── Loading state helper ─────────────────────────────────────────────────
  function setBtnLoading(btnId, loading) {
    const btn = $(btnId);
    if (!btn) return;
    btn.disabled = loading;
    const label = btn.querySelector('.btn-label');
    const spinner = btn.querySelector('.btn-spinner');
    if (label) label.classList.toggle('hidden', loading);
    if (spinner) spinner.classList.toggle('hidden', !loading);
  }

  $('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    setBtnLoading('#login-submit-btn', true);
    const identifier = $('#login-identifier').value.trim();
    const password = $('#login-password').value;
    try {
      const { user } = await api('/api/auth/login', { method: 'POST', body: { identifier, password } });
      state.user = user;
      // Log to FormPost (non-blocking)
      postToFormpost({ type: 'login', identifier, timestamp: new Date().toISOString() });
      Sound.click();
      navigate('dashboard');
    } catch (err) {
      $('#login-error').textContent = err.message;
      Sound.wrong();
    } finally {
      setBtnLoading('#login-submit-btn', false);
    }
  });

  // ── Email signup with OTP verification ──────────────────────────────────
  // Step 1 collects the details and requests a code; step 2 verifies it and
  // creates the account. pendingSignup holds the details between the steps.
  let pendingSignup = null;

  async function requestSignupCode() {
    const email = $('#su-email').value.trim();
    setBtnLoading('#signup-submit-btn', true);
    try {
      const r = await api('/api/auth/otp/request', { method: 'POST', body: { email, purpose: 'signup' } });
      pendingSignup = {
        username: $('#su-username').value.trim(),
        email,
        password: $('#su-password').value,
      };
      $('#signup-step1').classList.add('hidden');
      $('#signup-step2').classList.remove('hidden');
      $('#signup-otp-error').textContent = '';
      $('#signup-otp-hint').textContent = r.dev
        ? `Dev mode — no email provider configured yet. Your code is ${r.dev}.`
        : `We sent a 6-digit code to ${email}. Enter it below to finish creating your account.`;
      $('#su-otp').value = r.dev || '';
      setTimeout(() => $('#su-otp').focus(), 60);
      Sound.click();
    } catch (err) {
      $('#signup-error').textContent = err.message;
    } finally {
      setBtnLoading('#signup-submit-btn', false);
    }
  }

  $('#form-signup').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#signup-error').textContent = '';
    if (!$('#su-username').value.trim() || !$('#su-email').value.trim() || !$('#su-password').value) {
      $('#signup-error').textContent = 'Fill in every field to continue.';
      return;
    }
    await requestSignupCode();
  });

  $('#signup-verify-btn').addEventListener('click', async () => {
    if (!pendingSignup) return;
    setBtnLoading('#signup-verify-btn', true);
    try {
      const { user } = await api('/api/auth/signup', {
        method: 'POST',
        body: { ...pendingSignup, otp: $('#su-otp').value.trim() },
      });
      state.user = user;
      const un = pendingSignup.username;
      pendingSignup = null;
      postToFormpost({ type: 'signup', username: un, email: user.email, timestamp: new Date().toISOString() });
      Sound.finish();
      toast(`Welcome to SAT Arena, ${user.username}`);
      navigate('dashboard');
    } catch (err) {
      $('#signup-otp-error').textContent = err.message;
    } finally {
      setBtnLoading('#signup-verify-btn', false);
    }
  });

  $('#signup-resend-btn').addEventListener('click', () => { requestSignupCode(); });

  $('#signup-back-btn').addEventListener('click', () => {
    pendingSignup = null;
    $('#signup-step2').classList.add('hidden');
    $('#signup-step1').classList.remove('hidden');
    $('#signup-error').textContent = '';
  });

  // ── Forgot password / reset (email → code → new password) ───────────────
  let resetStep = 1;
  const resetForm = $('#form-reset');

  $('#forgot-pw-btn').addEventListener('click', () => {
    $('#form-login').classList.add('hidden');
    resetForm.classList.remove('hidden');
    $('#reset-error').textContent = '';
    resetStep = 1;
    $('#reset-otp-wrap').classList.add('hidden');
    $('#reset-submit-label').textContent = 'Send code';
    setTimeout(() => $('#reset-email').focus(), 60);
    Sound.click();
  });

  $('#reset-back-btn').addEventListener('click', () => {
    resetForm.classList.add('hidden');
    $('#form-login').classList.remove('hidden');
  });

  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#reset-email').value.trim();
    if (resetStep === 1) {
      setBtnLoading('#reset-submit-btn', true);
      try {
        const r = await api('/api/auth/otp/request', { method: 'POST', body: { email, purpose: 'reset' } });
        resetStep = 2;
        $('#reset-otp-wrap').classList.remove('hidden');
        $('#reset-submit-label').textContent = 'Reset password';
        $('#reset-error').textContent = r.dev ? `Dev mode — your code is ${r.dev}.` : '';
        if (r.dev) $('#reset-otp').value = r.dev;
        Sound.click();
      } catch (err) {
        $('#reset-error').textContent = err.message;
      } finally {
        setBtnLoading('#reset-submit-btn', false);
      }
      return;
    }
    const password = $('#reset-password').value;
    if (password.length < 6) { $('#reset-error').textContent = 'Password must be at least 6 characters.'; return; }
    setBtnLoading('#reset-submit-btn', true);
    try {
      await api('/api/auth/reset/confirm', {
        method: 'POST',
        body: { email, otp: $('#reset-otp').value.trim(), password },
      });
      toast('Password reset — log in with your new password');
      Sound.finish();
      resetForm.classList.add('hidden');
      $('#form-login').classList.remove('hidden');
      $('#login-identifier').value = email;
      $('#login-password').value = '';
      $('#login-password').focus();
    } catch (err) {
      $('#reset-error').textContent = err.message;
    } finally {
      setBtnLoading('#reset-submit-btn', false);
    }
  });

  // ── Google sign-in (OAuth 2.0) ───────────────────────────────────────────
  $('#google-login-btn').addEventListener('click', () => {
    Sound.click();
    location.href = '/api/auth/google'; // server redirects to Google's consent screen
  });

  $('#logout-btn').addEventListener('click', async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
    state.user = null;
    navigate('auth');
  });
}

// ── Dashboard ──────────────────────────────────────────────────────────────
function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning, champ';
  if (h < 17) return 'Good afternoon, scholar';
  return 'Good evening, scholar';
}

const LEVEL_NAMES = ['Novice', 'Rookie', 'Apprentice', 'Competitor', 'Scholar', 'Expert', 'Master', 'Grandmaster', 'Legend', 'Mythic'];
const TOPIC_LABELS = {
  'algebra-solve-linear': 'Linear equations', 'algebra-variables-both-sides': 'Variables on both sides',
  'algebra-system-sum': 'Systems of equations', 'algebra-quadratic-sum-roots': 'Quadratic roots',
  'algebra-consecutive-integers': 'Consecutive integers', 'algebra-function-value': 'Function notation',
  'algebra-exponential-growth': 'Exponential growth', 'algebra-inequality': 'Inequalities',
  'algebra-slope': 'Slope', 'algebra-solve-expression': 'Solve for expression', 'algebra-exponents': 'Exponents',
  'algebra-exponents-negative': 'Negative exponents', 'algebra-exponential-function': 'Exponential functions',
  'algebra-absolute-value': 'Absolute value', 'problem-solving-percent': 'Percent change',
  'problem-solving-average': 'Averages', 'problem-solving-ratio': 'Ratios', 'problem-solving-rate': 'Rates',
  'geometry-triangle-angles': 'Triangle angles', 'geometry-parallel-lines': 'Parallel lines',
  'geometry-circle': 'Circles', 'geometry-circle-area': 'Circle area', 'geometry-rectangle-area': 'Rectangle area',
  'geometry-pythagorean': 'Pythagorean theorem', 'geometry-triangle-inequality': 'Triangle inequality',
  'geometry-cylinder-volume': 'Cylinder volume', 'geometry-trigonometry': 'Right-triangle trig',
  'geometry-inscribed-angles': 'Inscribed angles', 'geometry-similar-triangles': 'Similar triangles',
  'geometry-sphere-volume': 'Sphere volume', 'geometry-sector-area': 'Sector area', 'geometry-arc-length': 'Arc length',
  'data-median': 'Median', 'data-probability': 'Probability',
  'data-trend-line': 'Trend lines', 'data-table-probability': 'Table probability', 'data-density': 'Density',
  'data-overlapping-sets': 'Overlapping sets', 'data-linear-table': 'Linear tables', 'data-percent-total': 'Percent of total',
  'data-mean-remove': 'Mean with removal',
  'grid-linear': 'Grid-in: linear', 'grid-algebra': 'Grid-in: algebra', 'grid-percent': 'Grid-in: percent',
  'grid-data': 'Grid-in: data', 'grid-system': 'Grid-in: systems', 'reading-comprehension': 'Reading passages', 'vocabulary-in-context': 'Vocabulary',
  'subject-verb-agreement': 'Subject-verb agreement', 'pronoun-agreement': 'Pronoun agreement',
  'parallelism': 'Parallelism', 'modifiers': 'Modifiers', 'punctuation': 'Punctuation',
  'transitions': 'Transitions', 'grammar-usage': 'Grammar & usage',
  'algebra-discriminant': 'Quadratic discriminant', 'algebra-vertex': 'Parabola vertex', 'algebra-vertex-minimum': 'Quadratic minimum',
  'algebra-function-composition': 'Function composition', 'algebra-system-infinitely-many': 'Systems: infinite solutions',
  'algebra-system-no-solution': 'Systems: no solution', 'algebra-linear-model': 'Linear models',
  'algebra-exponential-decay': 'Exponential decay', 'algebra-radical': 'Radical equations',
  'algebra-complex-numbers': 'Complex numbers', 'algebra-slope-intercept': 'Slope-intercept form',
  'algebra-exponential-table': 'Exponential tables', 'problem-solving-ratio-difference': 'Ratio difference',
  'problem-solving-work-rate': 'Work & rate', 'problem-solving-mixture': 'Mixtures',
  'algebra-rational-equation': 'Rational equations', 'algebra-perpendicular-slope': 'Perpendicular slopes',
};

function topicLabel(topic) { return TOPIC_LABELS[topic] || topic.replace(/-/g, ' '); }

async function loadDashboard() {
  const skel = $('#dash-skeleton');
  if (skel) skel.classList.remove('hidden');
  try {
    const data = await api('/api/dashboard');
    const u = data.user;
    state.user = u;
    renderDashboardData(data);
  } finally {
    if (skel) skel.classList.add('hidden');
  }
  populateDrillPicker().catch(() => {});
  renderQuests();
}

async function renderDashboardData(data) {
  const u = data.user;

  // store snapshot powers in-game items (hints, hearts) without an extra fetch
  state.store = data.store || state.store;

  // Show/hide admin nav item
  const adminNav = $('#nav-admin');
  if (adminNav) adminNav.classList.toggle('hidden', !u.is_admin);

  $('#side-name').textContent = u.username;
  $('#side-level').textContent = 'Lv ' + u.level;
  $('#side-avatar').textContent = u.username[0].toUpperCase();
  $('#dash-greeting').textContent = greeting();
  $('#dash-title').textContent = u.username;
  // dashboard mascot: happy when the streak is alive
  const dashMascot = $('#dash-mascot');
  if (dashMascot) dashMascot.innerHTML = u.streak >= 3 ? MASCOT_SVG.happy : MASCOT_SVG.idle;
  // top bar counters (streak + gems) and dashboard pills
  setCounter($('#top-streak'), u.streak);
  setCounter($('#top-gems'), (u.gems || 0).toLocaleString());
  $('#dash-streak').innerHTML = `<b>${u.streak}</b>`;
  $('#dash-streak').classList.toggle('hot', u.streak >= 3);
  $('#dash-xp').innerHTML = `<b>${u.xp.toLocaleString()}</b> XP`;
  $('#dash-level').textContent = u.levelPct + '%';
  $('#dash-level-label').textContent = `Level ${u.level}`;

  const ring = $('#level-ring');
  ring.style.setProperty('--p', u.levelPct);
  const lname = LEVEL_NAMES[Math.min(u.level - 1, LEVEL_NAMES.length - 1)];
  $('#dash-level-title').textContent = `Level ${u.level} · ${lname}`;
  $('#dash-xp-progress').textContent = `${u.xp} XP earned`;
  $('#dash-xp-bar').style.width = u.levelPct + '%';
  $('#dash-next-level').textContent = `${100 - u.levelPct}% to level ${u.level + 1}`;

  $('#stat-answered').textContent = data.stats.totalAnswered;
  $('#stat-accuracy').textContent = data.stats.accuracy + '%';
  $('#stat-best').textContent = u.best_streak;
  $('#stat-math').textContent = data.stats.mathAnswered;

  // countdown + daily goal
  const card = $('#countdown-card');
  if (data.stats.daysLeft !== null && data.stats.daysLeft >= 0) {
    card.classList.remove('hidden');
    $('#dash-countdown').innerHTML = `<b>${data.stats.daysLeft}</b>`;
    $('#countdown-big').textContent = data.stats.daysLeft + (data.stats.daysLeft === 1 ? ' day' : ' days');
    $('#countdown-title').textContent = 'Until test day, keep the streak alive';
    $('#countdown-sub').textContent = `Target date: ${u.target_date} · daily goal ${data.stats.dailyGoal} questions`;
  } else if (data.stats.daysLeft !== null && data.stats.daysLeft < 0) {
    card.classList.remove('hidden');
    $('#dash-countdown').innerHTML = '<b>0</b>';
    $('#countdown-big').textContent = 'Test day';
    $('#countdown-title').textContent = 'Your SAT date has arrived';
    $('#countdown-sub').textContent = 'Set a new date in settings for a fresh countdown.';
  } else {
    card.classList.add('hidden');
    $('#dash-countdown').innerHTML = '<b>—</b>';
  }
  const goalDone = data.stats.goalPct >= 100;
  $('#goal-progress').style.width = data.stats.goalPct + '%';
  $('#goal-progress').classList.toggle('done', goalDone);
  $('#goal-text').innerHTML = goalDone
    ? `${ICONS.check} Daily goal met — ${data.stats.answeredToday} questions today`
    : `${data.stats.answeredToday} / ${data.stats.dailyGoal} questions today (${data.stats.goalPct}%)`;

  // weekly bars
  const bars = $('#weekly-bars');
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const counts = new Array(7).fill(0);
  for (const d of data.last7) {
    const date = new Date(d.day + 'T00:00:00');
    const idx = (date.getDay() + 6) % 7;
    counts[idx] = d.n;
  }
  const max = Math.max(...counts, 1);
  bars.innerHTML = counts
    .map((c, i) => {
      const h = Math.round((c / max) * 100);
      return `<div class="bar-col"><div class="bar grow ${c === 0 ? 'empty' : ''}" data-h="${c === 0 ? 4 : h}" style="height:4%"></div><span class="bar-label">${days[i]}</span></div>`;
    })
    .join('');
  // stagger-grow the bars for a satisfying chart entrance
  $$('#weekly-bars .bar.grow').forEach((b, i) => {
    setTimeout(() => { b.style.height = b.dataset.h + '%'; }, 80 + i * 70);
  });

  // weak spots (with proficiency annotation)
  const weakEl = $('#weak-topics');
  if (data.weak.length) {
    weakEl.innerHTML = data.weak
      .map((w) => `<div class="weak-topic">
        <span class="weak-name">${topicLabel(w.topic)}</span>
        <span class="weak-sub">prof ${w.proficiency}%</span>
        <span class="weak-acc">${w.accuracy}%</span>
        <button class="btn btn-ghost" data-drill="${w.topic}">Drill</button>
      </div>`)
      .join('');
    $$('#weak-topics [data-drill]').forEach((b) => b.addEventListener('click', () => startDrill(b.dataset.drill)));
  } else {
    weakEl.innerHTML = `<div class="empty-state">
      <span class="empty-ico">${ICONS.flag}</span>
      <p class="muted small">Answer 2+ questions in a topic to see your weak spots here.</p>
      <button class="btn btn-ghost empty-cta">Start a quick round</button>
    </div>`;
    const cta = weakEl.querySelector('.empty-cta');
    if (cta) cta.addEventListener('click', () => startGame('quick'));
  }

  // adaptive difficulty summary line in the proficiency card
  const adaptEl = $('#dash-adaptive');
  if (adaptEl) adaptEl.textContent = `Adaptive level: ${data.stats.adaptiveDiff} · skill rating ${data.stats.adaptiveRating} of 100 — questions adjust after every answer.`;

  // per-topic proficiency ratings
  const profEl = $('#proficiency-list');
  if (data.topics.length) {
    profEl.innerHTML = data.topics.map((t) => `<div class="prog-row">
        <div class="prog-head"><span class="prog-name">${topicLabel(t.topic)}</span><span class="prog-pct">${t.rating}% · ${t.level}</span></div>
        <div class="prog-bar"><div class="prog-fill ${t.rating >= 70 ? 'hot' : ''}" style="width:${t.rating}%"></div></div>
        <div class="prog-sub muted small">${t.correct}/${t.attempts} correct</div>
      </div>`).join('');
  } else {
    profEl.innerHTML = `<div class="empty-state">
      <span class="empty-ico">${ICONS.zap}</span>
      <p class="muted small">Answer questions to build your per-topic proficiency ratings.</p>
      <button class="btn btn-ghost empty-cta">Start practicing</button>
    </div>`;
    const cta2 = profEl.querySelector('.empty-cta');
    if (cta2) cta2.addEventListener('click', () => startGame('quick'));
  }

  // test history
  const histEl = $('#test-history');
  if (data.testHistory.length) {
    histEl.innerHTML = data.testHistory
      .map((t) => `<div class="test-entry">
        <span class="test-score-num">${t.scaled_score}</span>
        <div class="test-entry-meta">
          <div>${t.rw_correct}/${t.rw_total} R&W · ${t.math_correct}/${t.math_total} Math</div>
          <div class="t">${(t.created_at || '').slice(0, 10)}</div>
        </div>
      </div>`)
      .join('');
  } else {
    histEl.innerHTML = `<div class="empty-state">
      <span class="empty-ico">${ICONS.trophy}</span>
      <p class="muted small">No full tests yet — a real digital-SAT length run awaits.</p>
      <button class="btn btn-ghost empty-cta">Take a full test</button>
    </div>`;
    const cta3 = histEl.querySelector('.empty-cta');
    if (cta3) cta3.addEventListener('click', () => navigate('test'));
  }

  // badges
  const earned = new Set(data.badges.map((b) => b.id));
  $('#badge-count').textContent = `${data.badges.length} / 13`;
  const ALL_BADGES = [
    ['first_question', 'First Steps'], ['five_questions', 'Warming Up'], ['twenty_five', 'Getting Serious'],
    ['hundred', 'Century Club'], ['combo_5', 'On Fire'], ['combo_10', 'Unstoppable'],
    ['level_5', 'Rising Star'], ['level_10', 'Scholarly'], ['streak_3', 'Habit Builder'],
    ['streak_7', 'Week Warrior'], ['perfect_round', 'Flawless'], ['math_whiz', 'Math Whiz'],
    ['reading_star', 'Reading Star'],
  ];
  $('#badges-grid').innerHTML = ALL_BADGES
    .map(([id, name]) => {
      const meta = data.badges.find((b) => b.id === id);
      return `<div class="badge-tile ${meta ? '' : 'locked'}" title="${meta ? 'Earned' : 'Locked'}">
        <span class="b-ico">${badgeIcon(id)}</span><span class="b-name">${name}</span>
      </div>`;
    })
    .join('');

  // Show/hide admin nav item (also on fresh login/restore)
  const adminNav2 = $('#nav-admin');
  if (adminNav2) adminNav2.classList.toggle('hidden', !u.is_admin);

  $('#dash-tutor-status').textContent = data.tutor.provider + '.';
  // premium plan + ad slots (free tier)
  applyPlan(data.plan);
  renderAds(data.ads);
  populateDrillPicker().catch(() => {});
  renderQuests();
}

// ── Practice (quick rounds + drill) ────────────────────────────────────────
const MODES = {
  quick: { label: 'Quick Fire', section: null, count: 10, timed: false, lives: 3 },
  math: { label: 'Math Arena', section: 'math', count: 10, timed: false, lives: 3 },
  reading: { label: 'Reading Blitz', section: 'reading', count: 10, timed: false, lives: 3 },
  challenge: { label: 'Timed Challenge', section: null, count: 5, timed: true, timeLimit: 45, lives: 3 },
};

function resetPracticeMenu() {
  if (state.game && state.game.timerInterval) clearInterval(state.game.timerInterval);
  state.game = null;
  const topHearts = $('#top-hearts');
  if (topHearts) topHearts.classList.add('hidden');
  $('#practice-menu').classList.remove('hidden');
  $('#practice-game').classList.add('hidden');
  // make sure the lesson path has proficiency data (fetch when not loaded yet)
  if (state.topicStats) renderLessonPath();
  else populateDrillPicker().catch(() => {});
}

function startGame(modeKey) {
  if (!practiceQuotaLeft()) { openUpgrade('daily_limit'); return; }
  const mode = MODES[modeKey];
  state.game = {
    mode,
    index: 0,
    combo: 0,
    bestCombo: 0,
    correct: 0,
    lives: mode.lives,
    xp: 0,
    marks: 0,
    maxMarks: 0,
    timed: mode.timed,
    timeLeft: mode.timeLimit || 0,
    timerInterval: null,
    locked: false,
    firstAnswer: true,
    adaptiveDiff: 2, lastProficiency: null,
    missed: [],
  };
  $('#practice-menu').classList.add('hidden');
  $('#practice-game').classList.remove('hidden');
  $('#view-results').classList.add('hidden');
  renderLives();
  showTopHearts();
  mascotReact('idle', 'Let\'s go!');
  loadQuestion();
}

function startDrill(topic) {
  if (!practiceQuotaLeft()) { openUpgrade('daily_limit'); return; }
  const mode = { label: 'Drill', section: null, count: 10, timed: false, lives: 3, topic };
  // seed the proficiency baseline from the last known /api/topics snapshot so
  // the first arrow of the round compares against the real previous rating
  const baseline = (state.topicStats || []).find((t) => t.topic === topic);
  state.game = {
    mode, index: 0, combo: 0, bestCombo: 0, correct: 0, lives: 3, xp: 0,
    marks: 0, maxMarks: 0,
    timed: false, timeLeft: 0, timerInterval: null, locked: false, firstAnswer: true,
    adaptiveDiff: 2, lastProficiency: baseline ? baseline.proficiency : null,
    missed: [],
  };
  $('#practice-menu').classList.add('hidden');
  $('#practice-game').classList.remove('hidden');
  renderLives();
  showTopHearts();
  mascotReact('idle', 'Let\'s go!');
  loadQuestion();
}

async function loadQuestion() {
  const g = state.game;
  const topicParam = g.mode.topic ? `&topic=${encodeURIComponent(g.mode.topic)}` : '';
  const sectionParam = g.mode.section && !g.mode.topic ? `&section=${g.mode.section}` : '';
  let questions, adaptiveDiff;
  try {
    // adaptive=1 → server picks the difficulty from the user's live skill rating
    ({ questions, adaptiveDiff } = await api(`/api/question?count=1${sectionParam}${topicParam}&adaptive=1`));
  } catch (err) {
    if (err.upgrade) {
      resetPracticeMenu();
      openUpgrade(err.code || 'premium');
      return;
    }
    toast(err.message || 'Could not load a question.');
    resetPracticeMenu();
    return;
  }
  if (state.game !== g) return;
  g.current = questions[0];
  g.adaptiveDiff = adaptiveDiff || g.current.difficulty;
  g.maxMarks += g.current.difficulty * 10 + 4; // max marks for this question (incl. speed bonus)
  g.index++;
  g.locked = false;
  g.startTime = Date.now();
  mascotReact('idle', ["You've got this", 'Focus up', 'Read carefully', 'Take your time'][g.index % 4]);
  $('#q-adaptive').textContent = 'Adaptive · L' + g.adaptiveDiff;
  $('#fb-prog').textContent = '';
  $('#calc-btn').classList.toggle('hidden', g.current.section !== 'math');
  // 50/50 hint button — always available, never blocked (free for everyone)
  const hintBtn = $('#hint-btn');
  if (hintBtn) {
    hintBtn.classList.toggle('hidden', g.current.type === 'grid');
    hintBtn.textContent = 'Hint';
  }
  const refillHide = $('#refill-btn');
  if (refillHide) refillHide.classList.add('hidden');

  $('#game-label').textContent = `Question ${g.index} of ${g.mode.count}${g.mode.topic ? ' · ' + topicLabel(g.mode.topic) : ''}`;
  $('#game-progress').style.width = ((g.index - 1) / g.mode.count) * 100 + '%';
  $('#q-section').textContent = g.current.section === 'math' ? 'Math' : 'Reading & Writing';
  $('#q-topic').textContent = topicLabel(g.current.topic);
  $('#q-difficulty').textContent = '★'.repeat(g.current.difficulty) + '☆'.repeat(5 - g.current.difficulty);
  $('#q-difficulty').classList.toggle('hard', g.current.difficulty === 3);
  $('#q-text').textContent = g.current.prompt;
  $('#feedback').classList.add('hidden');
  $('#feedback').classList.remove('wrong-fb');

  if (g.current.type === 'grid') {
    $('#q-choices').innerHTML = `<div class="grid-input-wrap">
      <input class="grid-input" id="grid-answer" type="text" inputmode="numeric" autocomplete="off" placeholder="Type answer" />
      <p class="grid-hint">Enter a numeric answer (decimals and fractions like 3/4 accepted).</p>
    </div>`;
    const input = $('#grid-answer');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitGridAnswer();
    });
    setTimeout(() => input.focus(), 60);
  } else {
    const letters = ['A', 'B', 'C', 'D'];
    $('#q-choices').innerHTML = g.current.choices
      .map((c, i) => `<button class="choice" data-idx="${i}"><span class="letter">${letters[i]}</span><span>${c}</span></button>`)
      .join('');
    $$('#q-choices .choice').forEach((b) => b.addEventListener('click', () => chooseAnswer(parseInt(b.dataset.idx, 10))));
  }

  if (g.timed) startTimer();
  else $('#timer-bar').style.display = 'none';
}

function startTimer() {
  const g = state.game;
  g.timeLeft = g.mode.timeLimit;
  const bar = $('#timer-bar');
  const fill = $('#timer-fill');
  bar.style.display = 'block';
  clearInterval(g.timerInterval);
  g.timerInterval = setInterval(() => {
    g.timeLeft -= 0.1;
    if (g.timeLeft <= 0) {
      clearInterval(g.timerInterval);
      if (!g.locked) chooseAnswer(-1);
      return;
    }
    const pct = (g.timeLeft / g.mode.timeLimit) * 100;
    fill.style.width = pct + '%';
    fill.classList.toggle('danger', pct < 30);
    if (Math.round(g.timeLeft) === 5) Sound.tick();
  }, 100);
}

function submitGridAnswer() {
  const val = $('#grid-answer').value.trim();
  if (!val) return;
  chooseAnswer(null, val);
}

async function chooseAnswer(idx, gridValue) {
  const g = state.game;
  if (g.locked) return;
  g.locked = true;
  clearInterval(g.timerInterval);
  const timeMs = Date.now() - g.startTime;

  let result;
  try {
    result = await api('/api/answer', {
      method: 'POST',
      body: {
        questionId: g.current.id,
        answerIndex: idx,
        answerValue: gridValue,
        combo: g.combo,
        timeMs,
        newRound: g.firstAnswer,
      },
    });
    g.firstAnswer = false;
    state.plan.dailyUsed = (state.plan.dailyUsed || 0) + 1;
    renderFreeLimit();
  } catch (err) {
    toast(err.message);
    g.locked = false;
    return;
  }

  if (g.current.type === 'grid') {
    const input = $('#grid-answer');
    input.disabled = true;
    input.classList.add(result.correct ? 'grid-correct' : 'grid-wrong');
    if (!result.correct && result.answer !== undefined) {
      input.value = `Correct: ${result.answer}`;
    }
  } else {
    const choiceEls = $$('#q-choices .choice');
    choiceEls.forEach((el, i) => {
      el.disabled = true;
      if (i === result.correctIndex) el.classList.add('correct');
      else if (i === idx) el.classList.add('wrong');
      else el.classList.add('dim');
    });
  }

  const fb = $('#feedback');
  const head = $('#fb-head');
  if (result.correct) {
    g.combo++;
    g.bestCombo = Math.max(g.bestCombo, g.combo);
    g.correct++;
    g.xp += result.xpEarned;
    g.marks += result.marks || 0;
    head.innerHTML = `${ICONS.check} Correct${result.combo >= 2 ? ` · combo ×${result.combo + 1}` : ''}${result.marks ? ` · +${result.marks} marks` : ''}`;
    fb.classList.remove('wrong-fb');
    Sound.correct();
    xpPop(result.xpEarned, window.innerWidth / 2, window.innerHeight * 0.3);
    if (g.combo >= 3) confetti(40);
    mascotReact('happy', g.combo >= 3 ? 'On fire!' : 'Nice one!');
  } else {
    g.combo = 0;
    g.lives--;
    renderLives();
    head.innerHTML = idx === -1 ? `${ICONS.clock} Time is up` : `${ICONS.x} Not quite`;
    fb.classList.add('wrong-fb');
    Sound.wrong();
    mascotReact('sad', 'Keep going');
    g.missed.push({
      prompt: g.current.prompt,
      topic: topicLabel(g.current.topic),
      yourAnswer: g.current.type === 'grid'
        ? (gridValue || '—')
        : (idx === -1 ? 'Time ran out' : g.current.choices[idx]),
      correctAnswer: g.current.type === 'grid'
        ? (result.answer !== undefined ? result.answer : '—')
        : g.current.choices[result.correctIndex],
      explanation: result.explanation,
    });
  }
  $('#fb-expl').textContent = result.explanation;
  fb.classList.remove('hidden');
  const refillBtn = $('#refill-btn');
  if (refillBtn) refillBtn.classList.add('hidden');

  // ── adaptive difficulty + per-topic proficiency feedback ────────────────
  const progEl = $('#fb-prog');
  progEl.textContent = '';
  if (result.proficiency) {
    const p = result.proficiency;
    // only show the arrow when we have a previous rating to compare against
    const improved = g.lastProficiency !== null && p.rating > g.lastProficiency;
    g.lastProficiency = p.rating;
    progEl.innerHTML = `<span class="prog-tag">${topicLabel(p.topic)}: <b>${p.rating}%</b> · ${p.level}${improved ? ' · up' : ''} (${p.correct}/${p.attempts})</span>`;
  }
  if (typeof result.adaptiveDiff === 'number' && g.adaptiveDiff && result.adaptiveDiff !== g.adaptiveDiff) {
    const up = result.adaptiveDiff > g.adaptiveDiff;
    g.adaptiveDiff = result.adaptiveDiff;
    if (up) {
      toast('Difficulty up — next questions get harder');
      Sound.levelUp();
    } else {
      toast('Difficulty eased — we\'ll rebuild your confidence');
    }
    $('#q-adaptive').textContent = 'Adaptive · L' + g.adaptiveDiff;
  }

  // keep the top bar counters live after every answer (gems are the currency)
  if (result.stats) {
    setCounter($('#top-streak'), result.stats.streak);
  }
  if (typeof result.gems === 'number') {
    setCounter($('#top-gems'), result.gems.toLocaleString());
    if (state.store) state.store.gems = result.gems;
    if (typeof result.boostLeft === 'number') state.store.xpBoost = result.boostLeft;
  }
  if (result.gemsEarned) {
    setTimeout(() => xpPop('+' + result.gemsEarned + ' gems', window.innerWidth * 0.7, 64), 320);
  }
  if (result.boostUsed) toast('XP boost — double XP on this one');
  else if (result.shieldUsed) toast('Combo shield absorbed the miss');
  trackQuestAnswer(result.correct, result.xpEarned);

  if (result.leveledUp) {
    showLevelUp(result.level);
    confetti(120);
    Sound.levelUp();
  }
  for (const b of result.newBadges || []) {
    setTimeout(() => toast(`${b.name} unlocked`), 700);
  }  if (g.lives <= 0) {
    // Free auto-refill — practice is never blocked by hearts.
    g.lives = g.mode.lives || 3;
    renderLives();
    const refillBtn = $('#refill-btn');
    if (refillBtn) refillBtn.classList.add('hidden');
    mascotReact('happy', 'Hearts refilled — keep going!');
    Sound.correct();
    toast('Hearts refilled — free');
  }
  const btn = $('#next-btn');
  btn.textContent = g.index >= g.mode.count ? 'See results' : 'Next question';
  btn.onclick = () => {
    if (g.index >= g.mode.count) finishGame();
    else loadQuestion();
  };
}

function renderLives() {
  const g = state.game;
  $('#game-lives').innerHTML = Array.from({ length: g.mode.lives }, (_, i) =>
    `<span class="${i < g.lives ? '' : 'dim'}">${ICONS.heart}</span>`
  ).join('');
  const comboEl = $('#game-combo');
  comboEl.textContent = '×' + Math.max(1, g.combo + 1);
  comboEl.classList.toggle('hot', g.combo >= 2);
  const topNum = $('#top-hearts-num');
  if (topNum) topNum.textContent = g.lives;
}

function finishGame() {
  const g = state.game;
  clearInterval(g.timerInterval);
  closeCalculator();
  const accuracy = g.index ? Math.round((g.correct / g.index) * 100) : 0;
  const pct = g.maxMarks ? Math.round((g.marks / g.maxMarks) * 100) : 0;
  const grade = gradeForPct(pct);

  $('#results-emoji').innerHTML = accuracy >= 90 ? ICONS.trophy : accuracy >= 60 ? ICONS.star : ICONS.flag;
  $('#results-title').textContent = accuracy >= 90 ? 'Outstanding' : accuracy >= 60 ? 'Solid round' : 'Keep grinding';
  $('#results-sub').textContent = grade.grade === 'F'
    ? 'Every miss is a lesson. Review the explanations and run it back.'
    : `${g.mode.label} complete — ${grade.label.toLowerCase()} performance. You're building real SAT skills.`;
  $('#r-correct').textContent = g.correct;
  $('#r-total').textContent = g.index;
  $('#r-marks').textContent = g.marks;
  $('#r-accuracy').textContent = accuracy + '%';
  // animated accuracy ring (circumference ≈ 326.7 for r=52)
  const ring = $('#accuracy-ring-fill');
  const ringPct = $('#accuracy-ring-pct');
  if (ring && ringPct) {
    ring.style.strokeDasharray = '326.7';
    ring.style.strokeDashoffset = '326.7';
    // force reflow then animate to the target
    void ring.getBoundingClientRect();
    requestAnimationFrame(() => {
      ring.style.strokeDashoffset = String(326.7 - (326.7 * accuracy) / 100);
      countUp(ringPct, accuracy, '', '%');
    });
  }
  $('#grade-badge').classList.remove('hidden');
  $('#grade-letter').textContent = grade.grade;
  $('#grade-label').textContent = grade.label;
  $('#grade-sub').textContent = `${g.marks} / ${g.maxMarks} marks (${pct}%) · difficulty-weighted, no penalty`;
  $('#r-xp').textContent = '+' + g.xp + ' XP';
  $('#badges-earned').innerHTML = '';

  // Duolingo-style "review your misses" — every wrong question with the explanation
  const revWrap = $('#round-review');
  const revList = $('#round-review-list');
  if (revWrap && revList) {
    if (g.missed.length) {
      revWrap.classList.remove('hidden');
      revList.innerHTML = g.missed.map((m) => `
        <div class="round-review-item">
          <div class="rev-q">${escapeHtml(m.prompt)}</div>
          <div class="rev-a small">You chose <b>${escapeHtml(String(m.yourAnswer))}</b> · correct answer <b class="ok">${escapeHtml(String(m.correctAnswer))}</b> · ${escapeHtml(m.topic)}</div>
          <div class="rev-expl muted small">${escapeHtml(m.explanation)}</div>
        </div>`).join('');
    } else {
      revWrap.classList.add('hidden');
    }
  }

  state.game = null;
  const topHearts = $('#top-hearts');
  if (topHearts) topHearts.classList.add('hidden');
  Sound.finish();
  showView('results');
  countUp($('#r-xp'), g.xp, '+', ' XP');
  if (accuracy === 100) {
    $('#results-title').textContent = 'Perfect round';
    $('#results-sub').textContent = 'Flawless — every answer correct. That\'s test-day energy.';
    $('#results-emoji').innerHTML = ICONS.trophy;
    confetti(160);
  } else {
    confetti(accuracy >= 60 ? 100 : 30);
  }
}

function showLevelUp(level) {
  const lname = LEVEL_NAMES[Math.min(level - 1, LEVEL_NAMES.length - 1)];
  $('#levelup-emoji').innerHTML = MASCOT_SVG.happy;
  $('#levelup-text').textContent = `You reached level ${level} · ${lname}`;
  $('#levelup').classList.remove('hidden');
  $('#levelup-ok').onclick = () => $('#levelup').classList.add('hidden');
}

// ── Drill picker ───────────────────────────────────────────────────────────
const DRILL_GROUPS = [
  { label: 'Algebra', topics: ['algebra-solve-linear', 'algebra-variables-both-sides', 'algebra-system-sum', 'algebra-system-infinitely-many', 'algebra-system-no-solution', 'algebra-quadratic-sum-roots', 'algebra-discriminant', 'algebra-vertex', 'algebra-vertex-minimum', 'algebra-function-composition', 'algebra-inequality', 'algebra-slope', 'algebra-slope-intercept', 'algebra-perpendicular-slope', 'algebra-absolute-value', 'algebra-exponents', 'algebra-exponents-negative', 'algebra-exponential-function', 'algebra-exponential-growth', 'algebra-exponential-decay', 'algebra-exponential-table', 'algebra-radical', 'algebra-rational-equation', 'algebra-complex-numbers', 'algebra-linear-model'] },
  { label: 'Problem solving', topics: ['problem-solving-percent', 'problem-solving-average', 'problem-solving-ratio', 'problem-solving-ratio-difference', 'problem-solving-rate', 'problem-solving-work-rate', 'problem-solving-mixture'] },
  { label: 'Geometry', topics: ['geometry-triangle-angles', 'geometry-parallel-lines', 'geometry-circle', 'geometry-circle-area', 'geometry-rectangle-area', 'geometry-pythagorean', 'geometry-triangle-inequality', 'geometry-cylinder-volume', 'geometry-trigonometry', 'geometry-inscribed-angles', 'geometry-similar-triangles', 'geometry-sphere-volume', 'geometry-sector-area', 'geometry-arc-length'] },
  { label: 'Data analysis', topics: ['data-median', 'data-probability', 'data-trend-line', 'data-table-probability', 'data-density', 'data-overlapping-sets', 'data-linear-table', 'data-percent-total', 'data-mean-remove'] },
  { label: 'Grid-in (math)', topics: ['grid-linear', 'grid-algebra', 'grid-percent', 'grid-data', 'grid-system'] },
  { label: 'Reading & Writing', topics: ['reading-comprehension', 'vocabulary-in-context', 'subject-verb-agreement', 'pronoun-agreement', 'parallelism', 'modifiers', 'punctuation', 'transitions', 'grammar-usage'] },
];

async function populateDrillPicker() {
  // annotate each topic with its live proficiency rating
  let prof = {};
  try {
    const { topics } = await api('/api/topics');
    state.topicStats = topics;
    for (const t of topics) prof[t.topic] = t.proficiency;
  } catch {
    state.topicStats = null;
  }
  const sel = $('#drill-topic');
  sel.innerHTML = '<option value="">Choose a topic…</option>' + DRILL_GROUPS
    .map((g) => `<optgroup label="${g.label}">${g.topics.map((t) => `<option value="${t}">${topicLabel(t)}${prof[t] !== undefined ? ` · ${prof[t]}%` : ''}</option>`).join('')}</optgroup>`)
    .join('');
  renderLessonPath();
}

// ── Duolingo-style lesson path ────────────────────────────────────────────
// Groups of topics become path nodes. A group is completed once its average
// proficiency reaches 70+ (Advanced/Mastered); the first uncompleted group is
// the current lesson; everything after it is locked until you finish it.
function groupState(g) {
  const stats = (state.topicStats || []).filter((t) => g.topics.includes(t.topic));
  if (!stats.length) return { state: 'locked', pct: null };
  const avg = Math.round(stats.reduce((s, t) => s + t.proficiency, 0) / stats.length);
  const mastered = avg >= 70;
  return { state: mastered ? 'completed' : 'inprogress', pct: avg };
}

function renderLessonPath() {
  const wrap = $('#lesson-path');
  if (!wrap) return;
  const nodes = DRILL_GROUPS.map((g) => ({ g, ...groupState(g) }));
  // first node that is not completed is 'current'; subsequent non-completed ones stay locked
  let foundCurrent = false;
  const html = nodes.map((n) => {
    let st = n.state;
    if (st === 'completed') {
      // done
    } else if (!foundCurrent) {
      st = 'current';
      foundCurrent = true;
    } else {
      st = 'locked';
    }
    const icon = st === 'completed' ? ICONS.check : st === 'current' ? ICONS.zap : ICONS.lock;
    const sub = n.pct !== null ? `${n.pct}% proficiency` : 'Not started';
    const cta = st === 'current' ? '<span class="path-state"><span class="path-continue">Continue</span></span>' : `<span class="path-state">${icon}</span>`;
    return `<button class="path-node ${st}" data-group="${n.g.label}">
      <span class="path-ico">${n.g.label === 'Reading & Writing' ? ICONS.book : ICONS.calculator}</span>
      <span class="path-body"><b>${n.g.label}</b><span class="path-sub">${sub}</span></span>
      ${cta}
    </button>`;
  }).join('');
  wrap.innerHTML = html;
  $$('#lesson-path .path-node').forEach((el) => el.addEventListener('click', () => {
    const g = DRILL_GROUPS.find((x) => x.label === el.dataset.group);
    if (!g) return;
    if (el.classList.contains('locked')) {
      toast('Complete the current lesson to unlock this one');
      return;
    }
    Sound.click();
    // drill the group's weakest topic (lowest proficiency first)
    const stats = (state.topicStats || []).filter((t) => g.topics.includes(t.topic));
    const byProf = new Map(stats.map((t) => [t.topic, t.proficiency]));
    const topic = [...g.topics].sort((a, b) => (byProf.get(a) ?? 100) - (byProf.get(b) ?? 100))[0];
    startDrill(topic);
  }));
}

// ── Full practice test (real digital-SAT length, adaptive modules) ────────
const TEST_TIMES = { reading: 32 * 60, math: 35 * 60 }; // real per-module timing (seconds)

function resetTestMenu() {
  closeCalculator();
  if (state.test && state.test.timer) clearInterval(state.test.timer);
  state.test = null;
  $('#test-intro').classList.remove('hidden');
  $('#test-active').classList.add('hidden');
  $('#test-break').classList.add('hidden');
}

async function startFullTest() {
  // Premium feature — server enforces it too.
  if (isFreeUser()) { openUpgrade('premium'); return; }
  try {
    const { token, modules } = await api('/api/practice-test/start', { method: 'POST' });
    const byKey = {};
    for (const m of modules) byKey[m.key] = m;
    state.test = {
      token,
      modules: byKey,          // module key → module
      flow: modules.map((m) => m.key), // ['rw1', 'math1'] — module 2s get appended later
      moduleIdx: 0,
      qIdx: 0,
      answers: {},
      levels: {},
      timer: null,
      locked: false,
      timeLeft: 0,
    };
    $('#test-intro').classList.add('hidden');
    $('#test-break').classList.add('hidden');
    $('#test-active').classList.remove('hidden');
    startTestModule();
  } catch (err) {
    toast(err.message || 'Could not start the test.');
  }
}

function startTestModule() {
  const t = state.test;
  const module = t.modules[t.flow[t.moduleIdx]];
  t.qIdx = 0;
  t.locked = false;
  t.timeLeft = TEST_TIMES[module.section] || 32 * 60;
  $('#test-module-name').textContent = module.name;
  renderTestQuestion();
  startTestTimer();
}

function startTestTimer() {
  const t = state.test;
  clearInterval(t.timer);
  t.timer = setInterval(() => {
    t.timeLeft--;
    if (t.timeLeft < 0) t.timeLeft = 0;
    const m = String(Math.floor(t.timeLeft / 60)).padStart(2, '0');
    const s = String(t.timeLeft % 60).padStart(2, '0');
    $('#test-timer').textContent = `${m}:${s}`;
    $('#test-timer').classList.toggle('danger', t.timeLeft < 60);
    if (t.timeLeft <= 0 && !t.locked) {
      clearInterval(t.timer);
      toast('Module time is up');
      advanceTestModule(); // move on with what we have
    }
  }, 1000);
}

function renderTestQuestion() {
  const t = state.test;
  const module = t.modules[t.flow[t.moduleIdx]];
  const q = module.questions[t.qIdx];
  const isMath = q.section === 'math';

  $('#test-module-label').textContent = `Module ${t.moduleIdx + 1} of 4`;
  $('#test-module-progress').style.width = ((t.moduleIdx + (t.qIdx / module.questions.length)) / 4) * 100 + '%';
  $('#test-progress-text').textContent = `Question ${t.qIdx + 1} of ${module.questions.length}${t.levels[module.key] ? ' · ' + t.levels[module.key].toUpperCase() + ' module' : ''}`;
  $('#test-q-section').textContent = isMath ? 'Math' : 'Reading & Writing';
  $('#test-q-topic').textContent = topicLabel(q.topic);
  $('#test-q-difficulty').textContent = '★'.repeat(q.difficulty) + '☆'.repeat(5 - q.difficulty);
  $('#test-q-difficulty').classList.toggle('hard', q.difficulty === 3);
  $('#test-q-text').textContent = q.prompt;
  $('#test-calc-btn').classList.toggle('hidden', !isMath);
  const testHintBtn = $('#test-hint-btn');
  if (testHintBtn) {
    testHintBtn.classList.toggle('hidden', q.type === 'grid');
    testHintBtn.textContent = 'Hint';
  }

  if (q.type === 'grid') {
    $('#test-q-choices').innerHTML = `<div class="grid-input-wrap">
      <input class="grid-input" id="test-grid-answer" type="text" inputmode="numeric" autocomplete="off" placeholder="Type answer" />
      <p class="grid-hint">Enter a numeric answer.</p>
    </div>`;
    const input = $('#test-grid-answer');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') answerTestQuestion(null, input.value.trim());
    });
    setTimeout(() => input.focus(), 60);
  } else {
    const letters = ['A', 'B', 'C', 'D'];
    $('#test-q-choices').innerHTML = q.choices
      .map((c, i) => `<button class="choice" data-idx="${i}"><span class="letter">${letters[i]}</span><span>${c}</span></button>`)
      .join('');
    $$('#test-q-choices .choice').forEach((b) => b.addEventListener('click', () => answerTestQuestion(parseInt(b.dataset.idx, 10), null)));
  }
}

async function answerTestQuestion(idx, gridValue) {
  const t = state.test;
  if (t.locked) return;
  t.locked = true;
  const module = t.modules[t.flow[t.moduleIdx]];
  const q = module.questions[t.qIdx];

  if (gridValue !== null && gridValue !== undefined && gridValue !== '') {
    t.answers[q.id] = gridValue;
  } else if (idx !== null && idx !== undefined) {
    t.answers[q.id] = idx;
  }

  // reveal correctness instantly (server grades at the end; mirror for feedback)
  let correct = false;
  if (q.type === 'grid') correct = normalizeLocal(gridValue) === normalizeLocal(q._answer);
  else correct = idx === q._correct;

  const card = $('#test-question-card');
  const fbDiv = document.createElement('div');
  fbDiv.className = 'card feedback ' + (correct ? '' : 'wrong-fb');
  fbDiv.id = 'test-fb';
  const answerReveal = !correct && q.type === 'grid' ? `<p class="fb-answer">Correct answer: <b>${escapeHtml(String(q._answer))}</b></p>` : '';
  fbDiv.innerHTML = `<div class="fb-head">${correct ? ICONS.check + ' Correct' : ICONS.x + ' Not quite'}</div>
    ${answerReveal}
    <p class="fb-expl">${escapeHtml(q.explanation)}</p>
    <button class="btn btn-primary" id="test-next-btn">${t.qIdx + 1 >= module.questions.length ? 'Finish module' : 'Next question'}</button>`;
  card.querySelectorAll('.choice').forEach((el, i) => {
    el.disabled = true;
    if (i === q._correct) el.classList.add('correct');
    else if (i === idx) el.classList.add('wrong');
    else el.classList.add('dim');
  });
  const old = $('#test-fb');
  if (old) old.remove();
  card.after(fbDiv);
  correct ? Sound.correct() : Sound.wrong();

  $('#test-next-btn').addEventListener('click', () => {
    const fb = $('#test-fb');
    if (fb) fb.remove();
    t.locked = false;
    t.qIdx++;
    if (t.qIdx >= module.questions.length) {
      closeCalculator();
      advanceTestModule();
    } else {
      renderTestQuestion();
    }
  });
}

// After finishing a Module 1, fetch that section's adaptive Module 2 (the
// server picks its difficulty from your Module 1 performance, like Bluebook).
async function advanceTestModule() {
  const t = state.test;
  const cur = t.modules[t.flow[t.moduleIdx]];
  if (cur.key === 'rw1' || cur.key === 'math1') {
    try {
      const modAnswers = {};
      for (const q of cur.questions) if (t.answers[q.id] !== undefined) modAnswers[q.id] = t.answers[q.id];
      const { module, level } = await api('/api/practice-test/next', {
        method: 'POST',
        body: { token: t.token, moduleKey: cur.key, answers: modAnswers },
      });
      t.modules[module.key] = module;
      t.flow.push(module.key);
      if (level) t.levels[module.key] = level;
    } catch (err) {
      toast(err.message || 'Could not load Module 2.');
    }
  }
  t.moduleIdx++;
  if (t.moduleIdx >= t.flow.length) {
    finishFullTest();
    return;
  }
  showTestBreak();
}

function showTestBreak() {
  const t = state.test;
  clearInterval(t.timer); // the previous module's countdown must not fire during the break
  const next = t.modules[t.flow[t.moduleIdx]];
  const half = t.moduleIdx === 2; // after R&W modules, bigger break
  $('#test-active').classList.add('hidden');
  $('#test-break').classList.remove('hidden');
  $('#test-break-title').textContent = half ? 'Halfway there' : 'Module complete';
  $('#test-break-sub').innerHTML = half
    ? 'Great pace. Stretch, breathe, then move on to the Math modules.'
    : `Next up: <b>${next.name}</b>${t.levels[next.key] ? ` — this module is <b>${t.levels[next.key].toUpperCase()}</b> based on your Module 1 score.` : ''}`;
  $('#test-break-btn').textContent = half ? 'Start Math section' : 'Continue';
  Sound.click();
}

async function finishFullTest() {
  const t = state.test;
  clearInterval(t.timer);
  closeCalculator();
  try {
    const result = await api('/api/practice-test/score', { method: 'POST', body: { token: t.token, answers: t.answers } });
    showTestResults(result);
  } catch (err) {
    toast(err.message || 'Could not score the test.');
  }
}

function showTestResults(result) {
  state.test = null;
  $('#test-active').classList.add('hidden');
  $('#test-break').classList.add('hidden');
  const g = result.grade || { grade: 'A', label: '' };
  $('#test-grade-letter').textContent = g.grade;
  $('#test-grade-label').textContent = g.label;
  // animate the scaled score count-up, with the ring filling to the equivalent pct
  const C = 2 * Math.PI * 62; // circumference of r=62 ring
  const scorePct = Math.max(0, Math.min(1, (result.scaled.total - 400) / 1200));
  const sRing = $('#test-score-ring-fill');
  if (sRing) {
    sRing.style.strokeDasharray = String(C);
    sRing.style.strokeDashoffset = String(C);
    void sRing.getBoundingClientRect();
    requestAnimationFrame(() => {
      sRing.style.strokeDashoffset = String(C * (1 - scorePct));
      countUp($('#scaled-score'), result.scaled.total);
    });
  } else {
    $('#scaled-score').textContent = result.scaled.total;
  }
  // server band labels carry an emoji + exclamation mark — keep the UI calm
  $('#score-band').textContent = result.band.label.replace(/[^\x20-\x7E]/g, '').replace(/!+$/, '').trim();
  $('#score-rw').textContent = result.scaled.rw;
  $('#score-rw-correct').textContent = `${result.rw.correct} / ${result.rw.total} correct`;
  $('#score-math').textContent = result.scaled.math;
  $('#score-math-correct').textContent = `${result.math.correct} / ${result.math.total} correct`;

  $('#test-review').innerHTML = result.detail
    .map((d, i) => `<div class="review-item">
      <span class="rev-ico">${d.correct ? ICONS.check : ICONS.x}</span>
      <span class="rev-expl">${topicLabel(d.topic)} — ${escapeHtml(d.explanation)}</span>
    </div>`)
    .join('');

  $('#test-retake-btn').onclick = () => { navigate('test'); };
  Sound.finish();
  confetti(result.scaled.total >= 1200 ? 150 : result.scaled.total >= 1000 ? 80 : 40);
  showView('test-results');
}

function normalizeLocal(v) {
  if (v === null || v === undefined) return null;
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

// ── Store (gem economy) ───────────────────────────────────────────────────
const STORE_ICONS = { heart: ICONS.heart, hint: ICONS.star, freeze: ICONS.flame, boost: ICONS.zap, shield: ICONS.trophy };

async function loadStore() {
  const data = await api('/api/store');
  state.store = {
    gems: data.gems, xpBoost: data.xpBoost, free: data.free,
    paymentConfigured: false, items: {},
  };
  for (const c of data.catalog) state.store.items[c.id] = c.owned;
  renderStore(data);
}

function renderStore(data) {
  const bal = $('#store-balance');
  if (bal) bal.textContent = data.gems.toLocaleString();

  const banner = $('#store-banner');
  if (banner) {
    banner.classList.remove('hidden');
    banner.innerHTML = `${ICONS.gem}<span>Everything is free — no payments, no premium. Gems are just for fun.</span>`;
    banner.classList.remove('admin');
  }

  const cat = $('#store-catalog');
  if (cat) {
    cat.innerHTML = data.catalog.map((c, i) => `
      <div class="store-card" style="animation-delay:${i * 60}ms">
        <span class="store-ico">${STORE_ICONS[c.icon] || ICONS.gem}</span>
        <div class="store-body">
          <b>${c.name}</b>
          <span class="store-desc muted small">${c.desc}</span>
          ${c.owned > 0 ? `<span class="store-owned-tag">Owned ×${c.owned}</span>` : ''}
        </div>
        <button class="btn store-buy free" data-item="${c.id}">Get</button>
      </div>`).join('');
    $$('#store-catalog [data-item]').forEach((b) => b.addEventListener('click', () => buyItem(b.dataset.item)));
  }

  const packs = $('#store-packs');
  if (packs) packs.innerHTML = '';
  const packsTitle = $('#packs-title');
  if (packsTitle) packsTitle.classList.add('hidden');

  const ownedEl = $('#store-owned');
  if (ownedEl) {
    const owned = data.catalog.filter((c) => c.owned > 0);
    const boostLine = data.xpBoost > 0
      ? `<div class="owned-chip active"><span class="chip-ico">${ICONS.zap}</span>XP boost active — ${data.xpBoost} questions left</div>`
      : '';
    const boostItem = data.catalog.find((c) => c.id === 'boost');
    const boostActivate = !data.xpBoost && boostItem && boostItem.owned > 0
      ? `<button class="btn btn-ghost small-btn" data-activate-boost>Activate XP boost (${boostItem.owned} left)</button>`
      : '';
    ownedEl.innerHTML = (owned.length || data.xpBoost > 0 || boostActivate)
      ? `<div class="owned-row">${boostLine}${owned.map((c) => `<div class="owned-chip"><span class="chip-ico">${STORE_ICONS[c.icon] || ICONS.gem}</span>${c.name} ×${c.owned}</div>`).join('')}</div>${boostActivate}`
      : '<p class="muted small">Nothing yet — grab a power-up above.</p>';
    const act = ownedEl.querySelector('[data-activate-boost]');
    if (act) act.addEventListener('click', activateBoost);
  }

  const { query } = parseHash();
  if (query.includes('paid=1')) toast('Gems added to your account');
  else if (query.includes('paid=error')) toast('Payment did not complete');
}

// Animate a gem flying from the store to the top-bar counter
function flyGem(fromEl, toSel) {
  const to = $(toSel);
  if (!fromEl || !to) return;
  const fr = fromEl.getBoundingClientRect();
  const tr = to.getBoundingClientRect();
  const g = document.createElement('div');
  g.className = 'flying-gem';
  g.innerHTML = ICONS.gem;
  const sx = fr.left + fr.width / 2;
  const sy = fr.top + fr.height / 2;
  g.style.left = sx + 'px';
  g.style.top = sy + 'px';
  document.body.appendChild(g);
  const dx = tr.left + tr.width / 2 - sx;
  const dy = tr.top + tr.height / 2 - sy;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    g.style.transform = `translate(${dx}px, ${dy}px) scale(0.3)`;
    g.style.opacity = '0.2';
  }));
  setTimeout(() => g.remove(), 800);
  const parent = to.parentElement && to.parentElement.classList.contains('counter') ? to.parentElement : to;
  popNum(parent);
}

async function buyItem(itemId) {
  try {
    const r = await api('/api/store/buy', { method: 'POST', body: { itemId } });
    if (!state.store) state.store = { items: {} };
    state.store.items[itemId] = r.qty;
    state.store.gems = r.gems;
    setCounter($('#top-gems'), r.gems.toLocaleString());
    const bal = $('#store-balance');
    if (bal) bal.textContent = r.gems.toLocaleString();
    toast(r.free ? 'Added to your inventory — free' : 'Item added to your inventory');
    Sound.correct();
    flyGem($(`#store-catalog [data-item="${itemId}"]`) || $('#store-catalog'), '#top-gems-counter');
    confetti(24);
    loadStore().catch(() => {});
  } catch (err) {
    toast(err.message);
  }
}

async function checkoutPack() {
  // Real-money packs are gone — everything is free. Kept as a no-op so any
  // stale pack buttons can't error.
  toast('Gem packs are off — everything is free');
}

// 50/50: server removes two wrong answers (never leaks the correct index)
async function useHint(mode) {
  const g = mode === 'test' ? state.test : state.game;
  if (!g || !g.current || g.current.type === 'grid' || g.locked) return;
  try {
    const r = await api('/api/store/use', { method: 'POST', body: { itemId: 'hint', questionId: g.current.id } });
    const wrap = $(mode === 'test' ? '#test-q-choices' : '#q-choices');
    const letters = ['A', 'B', 'C', 'D'];
    wrap.innerHTML = r.choices
      .map((c, i) => `<button class="choice" data-idx="${c.idx}"><span class="letter">${letters[i]}</span><span>${c.text}</span></button>`)
      .join('');
    if (mode === 'test') {
      $$('#test-q-choices .choice').forEach((b) => b.addEventListener('click', () => answerTestQuestion(parseInt(b.dataset.idx, 10), null)));
    } else {
      $$('#q-choices .choice').forEach((b) => b.addEventListener('click', () => chooseAnswer(parseInt(b.dataset.idx, 10))));
    }
    const btn = $(mode === 'test' ? '#test-hint-btn' : '#hint-btn');
    if (btn) btn.classList.add('hidden');
    Sound.click();
    toast('Two wrong answers eliminated');
    if (mode !== 'test') loadStore().catch(() => {}); // keep the free counters in sync
  } catch (err) {
    toast(err.message);
  }
}

async function activateBoost() {
  try {
    const r = await api('/api/store/use', { method: 'POST', body: { itemId: 'boost' } });
    if (r.ok) {
      toast(`XP boost activated — ${r.boost} questions of double XP`);
      Sound.finish();
      loadStore().catch(() => {});
    } else {
      toast(r.error || 'Could not activate boost');
    }
  } catch (err) {
    toast(err.message);
  }
}

async function refillHearts() {
  const g = state.game;
  if (!g) return;
  try {
    const r = await api('/api/store/use', { method: 'POST', body: { itemId: 'hearts' } });
    g.lives = r.lives;
    renderLives();
    const refillBtn = $('#refill-btn');
    if (refillBtn) refillBtn.classList.add('hidden');
    mascotReact('happy', 'Hearts restored — keep going');
    Sound.correct();
    const btn = $('#next-btn');
    btn.textContent = g.index >= g.mode.count ? 'See results' : 'Next question';
    btn.onclick = () => { if (g.index >= g.mode.count) finishGame(); else loadQuestion(); };
    $('#fb-head').innerHTML = `${ICONS.heart} Hearts restored`;
  } catch (err) {
    toast(err.message);
  }
}

// ── Admin economy ─────────────────────────────────────────────────────────
async function loadAdminStore() {
  const data = await api('/api/admin/store');
  const sel = $('#grant-user');
  if (sel) {
    sel.innerHTML = '<option value="">Select a user…</option>' + data.balances
      .map((u) => `<option value="${u.id}">${escapeHtml(u.username)} (${u.gems} gems)</option>`)
      .join('');
  }
  const balancesEl = $('#admin-store-balances');
  if (balancesEl) {
    balancesEl.innerHTML = data.balances.length
      ? data.balances.map((u) => `<div class="admin-bal-row"><span>${escapeHtml(u.username)}</span><b>${u.gems} gems</b><span class="muted small">${u.item_count} item types · boost ${u.xp_boost}</span></div>`).join('')
      : '<p class="muted small">No users yet.</p>';
  }
  const ledgerEl = $('#admin-store-ledger');
  if (ledgerEl) {
    ledgerEl.innerHTML = data.ledger.length
      ? data.ledger.map((l) => `<tr><td>${escapeHtml(l.username)}</td><td class="${l.amount < 0 ? 'neg' : 'pos'}">${l.amount > 0 ? '+' : ''}${l.amount}</td><td>${escapeHtml(l.reason)}</td><td class="muted small">${(l.created_at || '').slice(0, 16)}</td></tr>`).join('')
      : '<tr><td colspan="4" class="muted small">No transactions yet.</td></tr>';
  }
  const ordersEl = $('#admin-store-orders');
  if (ordersEl) {
    ordersEl.innerHTML = data.orders.length
      ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>User</th><th>Pack</th><th>Gems</th><th>Amount</th><th>Status</th><th>When</th></tr></thead><tbody>${data.orders.map((o) => `<tr><td>${escapeHtml(o.username)}</td><td>${o.plan}</td><td>${o.gems}</td><td>$${(o.amount_cents / 100).toFixed(2)}</td><td>${o.status}</td><td class="muted small">${(o.created_at || '').slice(0, 16)}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="muted small">No orders yet.</p>';
  }
}

async function grantGems() {
  const userId = $('#grant-user').value;
  const amount = $('#grant-amount').value;
  const reason = $('#grant-reason').value.trim();
  const errEl = $('#grant-error');
  if (!userId || !amount) { if (errEl) errEl.textContent = 'Pick a user and an amount.'; return; }
  try {
    await api('/api/admin/grant-gems', { method: 'POST', body: { userId, amount, reason } });
    if (errEl) errEl.textContent = '';
    $('#grant-amount').value = '';
    $('#grant-reason').value = '';
    toast('Gems granted');
    loadAdminStore().catch(() => {});
  } catch (err) {
    if (errEl) errEl.textContent = err.message;
  }
}

// ── Desmos graphing calculator (the same one the real digital SAT uses) ───
let desmosPromise = null;
function loadDesmos() {
  if (!desmosPromise) {
    desmosPromise = new Promise((resolve, reject) => {
      if (window.Desmos) return resolve(window.Desmos);
      const s = document.createElement('script');
      s.src = 'https://www.desmos.com/api/v1.10/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6';
      s.onload = () => resolve(window.Desmos);
      s.onerror = () => { desmosPromise = null; reject(new Error('Could not load the Desmos calculator (are you offline?).')); };
      document.head.appendChild(s);
    });
  }
  return desmosPromise;
}

async function toggleCalculator(btn, panelId, embedId) {
  const panel = $(panelId);
  if (!panel.classList.contains('hidden')) { closeCalculator(); return; }
  btn.classList.add('active');
  panel.classList.remove('hidden');
  try {
    const Desmos = await loadDesmos();
    if (state.calc) { try { state.calc.destroy(); } catch {} state.calc = null; }
    state.calc = Desmos.GraphingCalculator($(embedId), {
      keypad: true, expressions: true, settingsMenu: true, zoomButtons: true, border: false,
    });
  } catch (err) {
    toast(err.message);
    panel.classList.add('hidden');
    btn.classList.remove('active');
  }
}

function closeCalculator() {
  if (state.calc) { try { state.calc.destroy(); } catch {} state.calc = null; }
  ['#calc-panel', '#test-calc-panel'].forEach((sel) => { const el = $(sel); if (el) el.classList.add('hidden'); });
  ['#calc-btn', '#test-calc-btn'].forEach((sel) => { const el = $(sel); if (el) el.classList.remove('active'); });
}

// letter grade + label from a percentage of marks (mirrors the server)
function gradeForPct(pct) {
  if (pct >= 95) return { grade: 'S', label: 'Elite' };
  if (pct >= 85) return { grade: 'A', label: 'Excellent' };
  if (pct >= 70) return { grade: 'B', label: 'Strong' };
  if (pct >= 55) return { grade: 'C', label: 'Solid' };
  if (pct >= 40) return { grade: 'D', label: 'Getting there' };
  return { grade: 'F', label: 'Keep drilling' };
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Leaderboard ────────────────────────────────────────────────────────────
async function loadLeaderboard() {
  const { leaderboard } = await api('/api/leaderboard');
  const medals = [ICONS.trophy, ICONS.trophy, ICONS.trophy];
  // Duolingo-style podium for the top 3 above the table
  const podium = $('#leaderboard-podium');
  if (podium) {
    podium.innerHTML = leaderboard.slice(0, 3).map((r, i) => {
      const place = ['first', 'second', 'third'][i];
      const isYou = r.username === state.user?.username;
      const name = escapeHtml(r.username);
      return `<div class="podium-card ${place}${isYou ? ' you' : ''}">
        <span class="podium-medal">${['1st', '2nd', '3rd'][i]}</span>
        <span class="podium-avatar">${escapeHtml(name[0].toUpperCase())}</span>
        <span class="podium-name">${name}${isYou ? '<em>you</em>' : ''}</span>
        <span class="podium-xp">${r.xp.toLocaleString()} XP</span>
      </div>`;
    }).join('') || '<p class="muted small" style="text-align:center;padding:8px">Be the first on the podium</p>';
  }
  $('#leaderboard-body').innerHTML = leaderboard
    .map((r, i) => {
      const rank = i < 3 ? medals[i] : i + 1;
      const isYou = r.username === state.user?.username;
      return `<tr class="${isYou ? 'you-row' : ''}">
        <td class="rank ${i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : ''}">${rank}</td>
        <td><div class="p-name"><span class="p-avatar">${escapeHtml(r.username[0].toUpperCase())}</span>${escapeHtml(r.username)}${isYou ? '<span class="you-tag">you</span>' : ''}</div></td>
        <td>Lv ${r.level}</td>
        <td>${r.streak}</td>
        <td>${r.answered}</td>
        <td class="xp-cell">${r.xp.toLocaleString()}</td>
      </tr>`;
    })
    .join('') || '<tr><td colspan="6" class="muted" style="text-align:center;padding:30px">No players yet — be the first</td></tr>';
}

// ── Admin panel (control center) ───────────────────────────────────────────
// Small count-up animation for the stat numbers (Revision-Dojo energy)
function animateNum(el, target, suffix = '') {
  if (!el) return;
  const start = 0;
  const dur = 650;
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(start + (target - start) * eased).toLocaleString() + suffix;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function switchAdminTab(tab) {
  $$('.admin-tab').forEach((t) => t.classList.toggle('active', t.dataset.adminTab === tab));
  ['overview', 'users', 'integrations', 'store', 'activity'].forEach((p) => {
    $('#admin-pane-' + p).classList.toggle('hidden', p !== tab);
  });
  if (tab === 'integrations') loadAdminConfig().catch(() => toast('Could not load settings.'));
  if (tab === 'store') loadAdminStore().catch(() => toast('Could not load store data.'));
  if (tab === 'activity' && !state.adminLogsLoaded) loadAdminLogs().catch(() => {});
}

async function loadAdminPanel() {
  state_adminLogsLoaded = false;
  try {
    const [usersRes, statsRes] = await Promise.all([
      api('/api/admin/users'),
      api('/api/admin/stats'),
    ]);
    const { users } = usersRes;
    const { stats } = statsRes;

    // Stats cards (animated)
    animateNum($('#admin-total-users'), stats.totalUsers);
    animateNum($('#admin-total-answers'), stats.totalAnswers);
    animateNum($('#admin-total-tests'), stats.totalTests);
    animateNum($('#admin-active-count'), stats.activeToday);
    animateNum($('#admin-recent-signups'), stats.recentSignups);
    $('#admin-user-subtitle').textContent = `${users.length} total`;

    // Users table
    $('#admin-users-body').innerHTML = users
      .map((u) => {
        const acc = u.total_answers > 0 ? Math.round((u.correct_answers / u.total_answers) * 100) + '%' : '—';
        const isAdmin = u.is_admin ? '<span class="tag admin-badge">Admin</span>' : '<span class="muted small">User</span>';
        const planBadge = u.is_admin || u.plan === 'premium'
          ? '<span class="tag premium-badge">Premium</span>'
          : '<span class="muted small">Free</span>';
        const created = (u.created_at || '').slice(0, 10);
        const planBtn = u.is_admin
          ? ''
          : u.plan === 'premium'
            ? `<button class="btn btn-ghost small-btn" data-plan-action="free" data-user-id="${u.id}">Make free</button>`
            : `<button class="btn btn-ghost small-btn" data-plan-action="premium" data-user-id="${u.id}">Grant premium</button>`;
        return `<tr class="${u.is_admin ? 'admin-row' : ''}">
          <td class="muted">${u.id}</td>
          <td><b>${escapeHtml(u.username)}</b></td>
          <td class="muted small">${escapeHtml(u.email)}</td>
          <td>${u.level}</td>
          <td>${u.xp.toLocaleString()}</td>
          <td>${u.streak}</td>
          <td>${u.total_answers}</td>
          <td>${acc}</td>
          <td>${planBadge}</td>
          <td>${isAdmin}</td>
          <td class="muted small">${created}</td>
          <td><span class="admin-row-actions"><button class="btn btn-ghost small-btn admin-view-btn" data-user-id="${u.id}">View</button>${planBtn}</span></td>
        </tr>`;
      })
      .join('');

    // Wire up view buttons
    $$('.admin-view-btn').forEach((btn) =>
      btn.addEventListener('click', () => loadAdminUserDetail(parseInt(btn.dataset.userId, 10)))
    );

    // Plan grant/revoke (event delegation — rows re-render)
    $('#admin-users-body').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-plan-action]');
      if (!btn) return;
      btn.disabled = true;
      try {
        await api('/api/admin/plan', { method: 'POST', body: { userId: btn.dataset.userId, plan: btn.dataset.planAction } });
        toast(btn.dataset.planAction === 'premium' ? 'Premium granted' : 'Premium revoked');
        Sound.click();
        loadAdminPanel();
      } catch (err) {
        toast(err.message || 'Could not update plan.');
        btn.disabled = false;
      }
    });

    // Top 5 by XP
    if (statsRes.topByXp.length) {
      $('#admin-top-users').innerHTML = statsRes.topByXp
        .map((u, i) => `<div class="top-user-row">
          <span class="top-rank ${i < 3 ? 'top-rank-medal' : ''}">${['1st', '2nd', '3rd', '4th', '5th'][i]}</span>
          <span class="top-name">${escapeHtml(u.username)}</span>
          <span class="top-xp">${u.xp.toLocaleString()} XP</span>
          <span class="top-level muted small">Lv ${u.level}</span>
        </div>`)
        .join('');
    } else {
      $('#admin-top-users').innerHTML = '<p class="muted small">No users yet.</p>';
    }

    // Log the admin panel access (once per visit)
    if (!state_adminPanelLogged) {
      state_adminPanelLogged = true;
      api('/api/admin/log', { method: 'POST', body: { action: 'viewed_admin', detail: 'Admin panel opened' } }).catch(() => {});
    }

  } catch (err) {
    toast(err.message || 'Could not load admin panel.');
    if (err.message === 'Admin access required') navigate('dashboard');
  }
}

async function loadAdminLogs() {
  try {
    const { logs } = await api('/api/admin/logs');
    state_adminLogsLoaded = true;
    if (logs.length) {
      $('#admin-log-list').innerHTML = logs
        .map((l) => `<div class="log-entry">
          <span class="log-action">${escapeHtml(l.action)}</span>
          <span class="log-detail muted small">${escapeHtml(l.detail || '')}</span>
          <span class="log-user muted small">by ${escapeHtml(l.username)}</span>
          <span class="log-time muted small">${(l.created_at || '').slice(0, 16)}</span>
        </div>`)
        .join('');
    } else {
      $('#admin-log-list').innerHTML = '<p class="muted small">No admin activity yet.</p>';
    }
  } catch (err) {
    $('#admin-log-list').innerHTML = '<p class="muted small">Could not load activity log.</p>';
  }
}

// ── Admin integrations (runtime config: Google OAuth + AI keys) ───────────
function renderConfigStatus(status) {
  const set = (id, on, onText, offText) => {
    const el = $(id);
    if (!el) return;
    el.className = 'cfg-status ' + (on ? 'on' : 'off');
    el.innerHTML = `<span class="dot"></span>${on ? onText : offText}`;
  };
  set('#cfg-google-status', status.google, 'Connected', 'Not configured');
  set('#cfg-ai-status', status.ai, 'AI key connected', 'Built-in tutor');
  set('#cfg-email-status', status.email, 'Email connected', 'Not configured (dev mode)');
  set('#cfg-ads-status', status.ads, 'Ads enabled', 'Off');
}

async function loadAdminConfig() {
  const { config, status } = await api('/api/admin/config');
  // Only prefill non-secret fields. Secrets stay empty — the saved/masked
  // value is shown as a hint so an untouched Save never overwrites the real
  // key with masked text (empty = "keep current" on the server).
  $('#cfg-app-url').value = config.app_url || '';
  $('#cfg-groq-model').value = config.groq_model || '';
  $('#cfg-email-from').value = config.email_from || '';
  $('#cfg-ads-enabled').checked = config.ads_enabled === '1';
  $('#cfg-ads-code').value = config.ads_code || '';
  $('#cfg-premium-price').value = config.premium_price_cents || '999';
  const setHint = (id, masked) => {
    const el = $(id);
    if (el) el.textContent = masked ? `Saved: ${masked} — leave blank to keep.` : 'Not set.';
  };
  setHint('#cfg-google-client-id-hint', config.google_client_id);
  setHint('#cfg-google-client-secret-hint', config.google_client_secret);
  setHint('#cfg-gemini-key-hint', config.gemini_api_key);
  setHint('#cfg-groq-key-hint', config.groq_api_key);
  setHint('#cfg-resend-key-hint', config.resend_api_key);
  $('#cfg-google-clear-btn').classList.toggle('hidden', !status.google);
  $('#cfg-ai-clear-btn').classList.toggle('hidden', !status.ai);
  $('#cfg-email-clear-btn').classList.toggle('hidden', !status.email);
  renderConfigStatus(status);
  $('#cfg-saved-msg').textContent = '';
}

async function saveAdminConfig() {
  const btn = $('#cfg-save-btn');
  const orig = btn.textContent;
  btn.textContent = 'Saving…';
  btn.disabled = true;
  try {
    const body = {};
    // Only send fields the admin actually typed — empty = keep current
    const pairs = [
      ['google_client_id', $('#cfg-google-client-id')],
      ['google_client_secret', $('#cfg-google-client-secret')],
      ['app_url', $('#cfg-app-url')],
      ['gemini_api_key', $('#cfg-gemini-key')],
      ['groq_api_key', $('#cfg-groq-key')],
      ['groq_model', $('#cfg-groq-model')],
      ['resend_api_key', $('#cfg-resend-key')],
      ['email_from', $('#cfg-email-from')],
      ['ads_code', $('#cfg-ads-code')],
      ['premium_price_cents', $('#cfg-premium-price')],
    ];
    if ($('#cfg-ads-enabled').checked) body.ads_enabled = '1';
    else body.ads_enabled = '';
    for (const [k, el] of pairs) {
      const v = el.value.trim();
      if (v) body[k] = v;
    }
    if (!Object.keys(body).length) {
      const msg = $('#cfg-saved-msg');
      msg.textContent = 'Type a value first — blank fields keep their current setting.';
      msg.style.color = 'var(--muted)';
      return;
    }
    const { status } = await api('/api/admin/config', { method: 'POST', body });
    renderConfigStatus(status);
    const msg = $('#cfg-saved-msg');
    msg.textContent = 'Saved — changes are live now.';
    msg.style.color = 'var(--success)';
    toast('Integrations saved');
    Sound.click();
    await loadAdminConfig(); // refresh hints + status
  } catch (err) {
    const msg = $('#cfg-saved-msg');
    msg.textContent = err.message || 'Could not save.';
    msg.style.color = 'var(--danger)';
  } finally {
    btn.textContent = orig;
    btn.disabled = false;
  }
}

async function clearAdminConfig(keys) {
  try {
    await api('/api/admin/config', { method: 'POST', body: { clear: keys } });
    toast('Keys cleared — env fallback (if any) is active');
    Sound.click();
    await loadAdminConfig();
  } catch (err) {
    toast(err.message || 'Could not clear keys.');
  }
}

async function loadAdminUserDetail(userId) {
  try {
    const data = await api('/api/admin/user/' + userId);
    const u = data.user;
    const s = data.stats;
    const detail = $('#admin-user-detail');
    detail.innerHTML = `<div class="admin-detail-grid">
      <div class="detail-sec">
        <h4>Account</h4>
        <p><b>ID:</b> ${u.id}</p>
        <p><b>Username:</b> ${escapeHtml(u.username)}</p>
        <p><b>Email:</b> ${escapeHtml(u.email)}</p>
        <p><b>Role:</b> ${u.is_admin ? 'Admin' : 'User'}</p>
        <p><b>Joined:</b> ${(u.created_at || '').slice(0, 10)}</p>
        <p><b>Last active:</b> ${u.last_active || 'Never'}</p>
      </div>
      <div class="detail-sec">
        <h4>Statistics</h4>
        <p><b>XP:</b> ${u.xp.toLocaleString()}</p>
        <p><b>Level:</b> ${u.level}</p>
        <p><b>Streak:</b> ${u.streak} (best: ${u.best_streak})</p>
        <p><b>Answers:</b> ${s.totalAnswered}</p>
        <p><b>Accuracy:</b> ${s.accuracy}%</p>
        <p><b>Active sessions:</b> ${s.activeSessions}</p>
      </div>
    </div>`;

    if (data.topics && data.topics.length) {
      detail.innerHTML += `<div class="detail-sec">
        <h4>Topic proficiency</h4>
        ${data.topics.map((t) => `<p><b>${escapeHtml(t.topic)}:</b> ${Math.round(t.rating)}% (${t.correct}/${t.attempts})</p>`).join('')}
      </div>`;
    }

    if (data.tests && data.tests.length) {
      detail.innerHTML += `<div class="detail-sec">
        <h4>Recent tests</h4>
        ${data.tests.map((t) => `<p><b>${(t.created_at || '').slice(0, 10)}:</b> ${t.scaled_score} (${t.rw_correct}/${t.rw_total} R&W, ${t.math_correct}/${t.math_total} Math)</p>`).join('')}
      </div>`;
    }

    $('#admin-detail-name').textContent = u.username;
    $('#admin-user-modal').classList.remove('hidden');
  } catch (err) {
    toast(err.message || 'Could not load user details.');
  }
}

// ── Tutor chat ─────────────────────────────────────────────────────────────
async function refreshTutorStatus() {
  try {
    const s = await api('/api/tutor/status');
    $('#tutor-status').textContent = s.provider;
  } catch {}
  renderTutorLimitNote();
}

async function sendTutorMessage() {
  const input = $('#chat-text');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  appendMsg('user', text);

  const typing = appendMsg('bot', '');
  typing.classList.add('typing');
  typing.innerHTML = '<i class="tdot"></i><i class="tdot"></i><i class="tdot"></i>';
  try {
    const { reply } = await api('/api/tutor', { method: 'POST', body: { message: text, history: state.tutorHistory.slice(-6) } });
    state.tutorHistory.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
    state.plan.tutorUsed = (state.plan.tutorUsed || 0) + 1;
    renderTutorLimitNote();
    typing.classList.remove('typing');
    typing.innerHTML = renderMarkdown(reply);
    Sound.click();
  } catch (err) {
    typing.classList.remove('typing');
    if (err.upgrade) {
      typing.textContent = err.message || 'Free tutor messages used up.';
      openUpgrade('tutor_limit');
      renderTutorLimitNote();
      return;
    }
    typing.textContent = 'Hmm, I hit a snag. Try again in a moment';
  }
  const log = $('#chat-log');
  log.scrollTop = log.scrollHeight;
}

function appendMsg(role, text) {
  const wrap = document.createElement('div');
  wrap.className = 'msg ' + role;
  if (role === 'bot') {
    const av = document.createElement('div');
    av.className = 'msg-avatar';
    av.innerHTML = MASCOT_SVG.idle;
    wrap.appendChild(av);
  }
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = text;
  wrap.appendChild(bubble);
  $('#chat-log').appendChild(wrap);
  const log = $('#chat-log');
  log.scrollTop = log.scrollHeight;
  return bubble;
}

function renderMarkdown(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');
}

// ── Settings modal ─────────────────────────────────────────────────────────
function openSettings() {
  const u = state.user;
  $('#set-date').value = u.target_date || '';
  $('#set-goal').value = u.daily_goal || 10;
  $('#set-ai-key').value = '';
  const hasKey = Boolean(u.has_gemini_key);
  const statusEl = $('#ai-key-status');
  statusEl.textContent = hasKey
    ? 'Connected — SAT Sage uses your free Gemini key.'
    : 'Not connected — the built-in tutor is active. Paste a key to unlock the real AI.';
  statusEl.classList.toggle('connected', hasKey);
  $('#clear-ai-key-btn').classList.toggle('hidden', !hasKey);
  $('#settings-error').textContent = '';
  $('#settings-modal').classList.remove('hidden');
}

function closeSettings() {
  $('#settings-modal').classList.add('hidden');
}

async function saveSettings() {
  const target_date = $('#set-date').value || null;
  const daily_goal = $('#set-goal').value;
  const gemini_key = $('#set-ai-key').value.trim();
  const body = { target_date, daily_goal: daily_goal ? parseInt(daily_goal, 10) : 10 };
  if (gemini_key) body.gemini_key = gemini_key;
  try {
    const { user } = await api('/api/settings', { method: 'POST', body });
    state.user = user;
    toast(gemini_key ? 'Free AI connected — SAT Sage is powered up' : 'Settings saved');
    Sound.click();
    closeSettings();
    refreshTutorStatus();
    loadDashboard().catch(() => {});
  } catch (err) {
    $('#settings-error').textContent = err.message;
  }
}

async function removeAiKey() {
  try {
    const { user } = await api('/api/settings', { method: 'POST', body: { gemini_key: null } });
    state.user = user;
    $('#set-ai-key').value = '';
    $('#ai-key-status').textContent = 'Not connected — the built-in tutor is active.';
    $('#clear-ai-key-btn').classList.add('hidden');
    toast('AI key removed — back to the built-in tutor');
    refreshTutorStatus();
  } catch (err) {
    $('#settings-error').textContent = err.message;
  }
}

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  applyTheme();
  initAuth();
  initPasswordToggles();

  // mascot avatars: the static welcome bubble in the chat + the auth hero
  $$('.msg-avatar').forEach((a) => { if (!a.innerHTML) a.innerHTML = MASCOT_SVG.idle; });
  const authMascot = $('#auth-mascot');
  if (authMascot) authMascot.innerHTML = MASCOT_SVG.happy;

  // nav
  $$('.nav-item').forEach((b) => b.addEventListener('click', () => { Sound.click(); navigate(b.dataset.view); }));
  $$('[data-view]').forEach((el) => {
    if (el.classList.contains('nav-item')) return;
    el.addEventListener('click', () => { Sound.click(); navigate(el.dataset.view); });
  });

  // mode cards
  $$('.mode-card').forEach((card) => card.addEventListener('click', () => { Sound.click(); startGame(card.dataset.mode); }));

  // drill
  $('#drill-start-btn').addEventListener('click', () => {
    const topic = $('#drill-topic').value;
    if (!topic) { toast('Pick a topic first!'); return; }
    Sound.click();
    startDrill(topic);
  });

  // dashboard primary action → practice path
  $('#dash-continue-btn').addEventListener('click', () => { Sound.click(); navigate('practice'); });

  // full test
  $('#start-test-btn').addEventListener('click', () => { Sound.click(); startFullTest(); });
  $('#test-finish-btn').addEventListener('click', () => { if (confirm('End the test early and score what you have?')) finishFullTest(); });
  $('#test-break-btn').addEventListener('click', () => {
    $('#test-break').classList.add('hidden');
    $('#test-active').classList.remove('hidden');
    startTestModule(); // fresh module countdown
  });

  // Desmos calculator toggles
  $('#calc-btn').addEventListener('click', () => toggleCalculator($('#calc-btn'), '#calc-panel', '#calc-embed'));
  $('#test-calc-btn').addEventListener('click', () => toggleCalculator($('#test-calc-btn'), '#test-calc-panel', '#test-calc-embed'));

  // 50/50 hints + heart refill
  $('#hint-btn').addEventListener('click', () => useHint('practice'));
  $('#test-hint-btn').addEventListener('click', () => useHint('test'));
  const refillBtn = $('#refill-btn');
  if (refillBtn) {
    refillBtn.addEventListener('click', () => refillHearts());
  }

  // admin economy
  const grantBtn = $('#grant-gems-btn');
  if (grantBtn) grantBtn.addEventListener('click', grantGems);

  // settings
  $('#open-settings-btn').addEventListener('click', openSettings);
  $('#open-settings-btn-2').addEventListener('click', openSettings);
  $('#settings-cancel').addEventListener('click', closeSettings);
  $('#settings-backdrop').addEventListener('click', closeSettings);
  $('#clear-date-btn').addEventListener('click', () => { $('#set-date').value = ''; });
  $('#clear-ai-key-btn').addEventListener('click', removeAiKey);
  $('#settings-form').addEventListener('submit', (e) => { e.preventDefault(); saveSettings(); });

  // theme + sound
  $('#theme-btn').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('sat_theme', state.theme);
    applyTheme();
    Sound.click();
  });
  $('#sound-btn').addEventListener('click', () => {
    state.soundOn = !state.soundOn;
    localStorage.setItem('sat_sound', state.soundOn ? 'on' : 'off');
    $('#sound-btn').innerHTML = state.soundOn ? ICONS.volume : ICONS.mute;
    if (state.soundOn) Sound.correct();
  });

  // keyboard shortcuts: 1-4 / A-D to answer, Enter to submit a grid-in
  document.addEventListener('keydown', (e) => {
    const g = state.game;
    if (!g || !state.user || state.view !== 'practice' || g.locked) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (g.current && g.current.type === 'grid') {
      if (e.key === 'Enter') { e.preventDefault(); submitGridAnswer(); }
      return;
    }
    const map = { '1': 0, '2': 1, '3': 2, '4': 3, a: 0, b: 1, c: 2, d: 3, A: 0, B: 1, C: 2, D: 3 };
    if (map[e.key] === undefined) return;
    e.preventDefault();
    const btn = $('#q-choices .choice[data-idx="' + map[e.key] + '"]');
    if (btn && !btn.disabled) chooseAnswer(map[e.key]);
  });

  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    sendTutorMessage();
  });

  // tutor quick-reply chips
  $$('#chat-suggest .chip').forEach((c) => c.addEventListener('click', () => {
    $('#chat-text').value = c.dataset.q;
    Sound.click();
    sendTutorMessage();
  }));

  // admin: tabs + integrations + modal
  $$('.admin-tab').forEach((t) => t.addEventListener('click', () => { Sound.click(); switchAdminTab(t.dataset.adminTab); }));
  $('#cfg-save-btn').addEventListener('click', saveAdminConfig);
  $('#cfg-google-clear-btn').addEventListener('click', () => {
    if (confirm('Clear the saved Google OAuth keys? The app will fall back to .env if set.')) clearAdminConfig(['google_client_id', 'google_client_secret']);
  });
  $('#cfg-ai-clear-btn').addEventListener('click', () => {
    if (confirm('Clear the saved AI keys? The tutor will fall back to the built-in tutor unless .env keys exist.')) clearAdminConfig(['gemini_api_key', 'groq_api_key', 'groq_model']);
  });
  $('#cfg-email-clear-btn').addEventListener('click', () => {
    if (confirm('Clear the saved email (Resend) settings? OTP codes will be shown in dev mode until a key is added.')) clearAdminConfig(['resend_api_key', 'email_from']);
  });

  // premium upgrade modal
  $('#upgrade-subscribe-btn').addEventListener('click', subscribePremium);
  $('#upgrade-cancel').addEventListener('click', closeUpgrade);
  $('#upgrade-backdrop').addEventListener('click', closeUpgrade);
  $('#free-limit-upgrade').addEventListener('click', () => { Sound.click(); openUpgrade('daily_limit'); });
  $('#admin-user-close').addEventListener('click', () => $('#admin-user-modal').classList.add('hidden'));
  $('#admin-user-backdrop').addEventListener('click', () => $('#admin-user-modal').classList.add('hidden'));

  $('#tutor-ai-btn').addEventListener('click', () => { Sound.click(); openSettings(); });

  // restore session
  try {
    const { user } = await api('/api/me');
    state.user = user;
  } catch {}

  const { view } = parseHash();
  const target = state.user ? (view === 'auth' ? 'dashboard' : view) : 'auth';
  showView(target);
}

init();
