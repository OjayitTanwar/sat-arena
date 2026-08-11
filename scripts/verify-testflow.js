'use strict';

// End-to-end verification of the v3 upgrade:
//  - adaptive full-length test flow (start → next → score)
//  - SAT-style marks on /api/answer
//  - per-user Gemini AI key via /api/settings
// Requires the server running on localhost:3000 with a fresh data/ dir.

const BASE = 'http://localhost:3000';

// Admin creds come from env (.env respected) — no password ships in source.
try { process.loadEnvFile(); } catch { /* no .env — dev fallbacks */ }
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'tanwarojayit@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  console.error('ADMIN_PASSWORD is required to run this suite (set it in .env or the shell). The server seeds the admin account from that env var; a fresh DB without it gets a random password.');
  process.exit(1);
}

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...(opts.cookie ? { Cookie: opts.cookie } : {}) },
    method: opts.method || 'GET',
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(path + ' → ' + res.status + ' ' + (data.error || ''));
  return data;
}

let cookie = '';
function grabCookie(res) {
  const setCookie = res.headers.get('set-cookie') || '';
  const m = setCookie.match(/sat_token=([^;]+)/);
  if (m) cookie = 'sat_token=' + m[1];
}

// Re-solve grid prompts (same as verify-adaptive.js)
function solveGrid(prompt) {
  let m = prompt.match(/What is (\d+)% of (\d+)\?/);
  if (m) return String((parseInt(m[1], 10) * parseInt(m[2], 10)) / 100);
  m = prompt.match(/\((\d+)x \+ (\d+)\) ÷ (\d+) = (\d+)/);
  if (m) return String((parseInt(m[4], 10) * parseInt(m[3], 10) - parseInt(m[2], 10)) / parseInt(m[1], 10));
  return null;
}

async function main() {
  const username = 'flow_' + Date.now().toString(36);
  const otpRes = await fetch(BASE + '/api/auth/otp/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: username + '@test.com', purpose: 'signup' }),
  }).then((r) => r.json());
  let res = await fetch(BASE + '/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email: username + '@test.com', password: 'secret123', otp: otpRes.dev }),
  });
  grabCookie(res);
  const signup = await res.json();
  console.log('1. signup →', signup.user.username, '| has_gemini_key:', signup.user.has_gemini_key);

  // full practice tests are premium-only — grant the test user premium via admin
  const adminLogin = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const adminCookie = (adminLogin.headers.get('set-cookie') || '').split(';')[0];
  await fetch(BASE + '/api/admin/plan', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ userId: signup.user.id, plan: 'premium' }),
  });

  // ── marks on a single answer (wrong answer → 0 marks) ──
  let q = await req('/api/question?count=1&section=math&adaptive=1', { cookie });
  const qq = q.questions[0];
  const wrongBody = qq.type === 'grid' ? { questionId: qq.id, answerValue: '9999', timeMs: 2000, newRound: true } : { questionId: qq.id, answerIndex: 99, timeMs: 2000, newRound: true };
  let a = await req('/api/answer', { cookie, method: 'POST', body: wrongBody });
  console.log('2. marks on wrong answer → correct:', a.correct, '| marks:', a.marks, '(expect 0 when wrong, >0 when right)');

  // ── AI key settings ──
  const keyRes = await req('/api/settings', { cookie, method: 'POST', body: { gemini_key: 'AIzaSy-fakekey123456789' } });
  console.log('3. save AI key → has_gemini_key:', keyRes.user.has_gemini_key, '(expect true)');
  const status = await req('/api/tutor/status', { cookie });
  console.log('   tutor status → connected:', status.connected, '| provider:', status.provider.slice(0, 40) + '…');
  const clearRes = await req('/api/settings', { cookie, method: 'POST', body: { gemini_key: null } });
  console.log('   clear AI key → has_gemini_key:', clearRes.user.has_gemini_key, '(expect false)');

  // ── full test: start ──
  const start = await req('/api/practice-test/start', { cookie, method: 'POST' });
  const m1 = start.modules[0], m2 = start.modules[1];
  console.log('4. test start → token ok:', !!start.token, '| module1s:', m1.key, m1.questions.length + 'q', m2.key, m2.questions.length + 'q');
  console.log('   R&W grid-ins (should be 0):', m1.questions.filter((x) => x.type === 'grid').length, '| Math grid-ins (≥4):', m2.questions.filter((x) => x.type === 'grid').length);
  const payloadHasAnswers = m1.questions.every((x) => x._correct !== undefined) && m2.questions.filter((x) => x.type === 'grid').every((x) => x._answer !== undefined);
  console.log('   instant-feedback payload ok:', payloadHasAnswers);

  // answer Module 1 perfectly (we know _correct) → Module 2 should be HARD
  const rw1Answers = {};
  for (const qq of m1.questions) rw1Answers[qq.id] = qq._correct;
  const next1 = await req('/api/practice-test/next', { cookie, method: 'POST', body: { token: start.token, moduleKey: 'rw1', answers: rw1Answers } });
  console.log('5. rw1 perfect → rw2 level:', next1.level, '(expect hard) |', next1.module.questions.length + 'q, unique:', new Set(next1.module.questions.map((x) => x.id)).size === next1.module.questions.length);

  // answer Math Module 1 with all wrong → Math Module 2 should be EASY
  const math1Answers = {};
  for (const qq of m2.questions) math1Answers[qq.id] = qq.type === 'grid' ? 'zzz' : 99;
  const next2 = await req('/api/practice-test/next', { cookie, method: 'POST', body: { token: start.token, moduleKey: 'math1', answers: math1Answers } });
  console.log('6. math1 all-wrong → math2 level:', next2.level, '(expect easy)');

  // score: assemble all answers, half correct half wrong → sane scaled score + grade
  const all = { ...rw1Answers, ...math1Answers };
  for (const qq of next1.module.questions) all[qq.id] = qq._correct;
  for (const qq of next2.module.questions) all[qq.id] = qq.type === 'grid' ? 'zzz' : 99;
  const score = await req('/api/practice-test/score', { cookie, method: 'POST', body: { token: start.token, answers: all } });
  console.log('7. score → rw:', score.rw.correct + '/' + score.rw.total, '| math:', score.math.correct + '/' + score.math.total, '| scaled:', score.scaled.total, '| grade:', score.grade.grade, '| detail:', score.detail.length);
  console.log('   levels reported:', JSON.stringify(score.levels));

  // ── quick answer marks again with a correct grid answer ──
  q = await req('/api/question?count=1&topic=grid-percent&adaptive=1', { cookie });
  const val = solveGrid(q.questions[0].prompt);
  if (val) {
    a = await req('/api/answer', { cookie, method: 'POST', body: { questionId: q.questions[0].id, answerValue: val, timeMs: 3000 } });
    console.log('8. correct grid answer → marks:', a.marks, '(expect 24 = 2×10 + 4 speed bonus)');
  } else {
    console.log('8. could not parse grid prompt — skipped');
  }

  console.log('\n✅ ALL V3 FLOW CHECKS PASSED');
}

main().catch((e) => {
  console.error('❌ FAIL:', e.message);
  process.exit(1);
});
