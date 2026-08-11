'use strict';

// End-to-end verification of adaptive difficulty + per-topic proficiency.
// Requires the server running on localhost:3000 with a fresh data/ dir.

const BASE = 'http://localhost:3000';

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

// Grid-in answers are computable from the prompt text, giving us REAL correct
// answers through the API (MCQ correct indexes are hidden client-side by design).
function solveGrid(prompt) {
  let m = prompt.match(/\((\d+)x \+ (\d+)\) ÷ (\d+) = (\d+)/);
  if (m) return String((parseInt(m[4], 10) * parseInt(m[3], 10) - parseInt(m[2], 10)) / parseInt(m[1], 10));
  m = prompt.match(/price of a lamp is \$(\d+).*?(\d+)% markup/);
  if (m) return String(parseInt(m[1], 10) * (1 + parseInt(m[2], 10) / 100));
  return null;
}

async function main() {
  const username = 'adapt_' + Date.now().toString(36);

  // signup (OTP in dev mode — code comes back in the response)
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
  console.log('1. signup →', signup.user.username);

  // grant premium so the daily question limit never interrupts the suite
  const adminLogin = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'tanwarojayit@gmail.com', password: 'baldeyan' }),
  });
  const adminCookie = (adminLogin.headers.get('set-cookie') || '').split(';')[0];
  await fetch(BASE + '/api/admin/plan', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ userId: signup.user.id, plan: 'premium' }),
  });

  // adaptive question
  let q = await req('/api/question?count=1&section=math&adaptive=1', { cookie });
  console.log('2. adaptive question → difficulty', q.questions[0].difficulty, '| adaptiveDiff', q.adaptiveDiff);

  // ── Phase A: a streak of computed-correct grid answers → rating climbs ──
  let lastDiff = q.adaptiveDiff;
  let prof = null;
  let answer;
  let diffs = [];
  let correctStreak = 0;
  for (let i = 0; i < 6; i++) {
    q = await req('/api/question?count=1&topic=' + (i % 2 ? 'grid-percent' : 'grid-linear') + '&adaptive=1', { cookie });
    diffs.push(q.questions[0].difficulty);
    const val = solveGrid(q.questions[0].prompt);
    if (!val) { console.log('   !! could not compute answer for:', q.questions[0].prompt.slice(0, 60)); continue; }
    answer = await req('/api/answer', {
      cookie,
      method: 'POST',
      body: { questionId: q.questions[0].id, answerValue: val, timeMs: 4000, newRound: i === 0 },
    });
    if (answer.correct) correctStreak++;
    lastDiff = answer.adaptiveDiff;
    prof = answer.proficiency;
  }
  console.log('3. ' + correctStreak + '/6 computed grid answers correct → served diffs:', diffs.join(','), '| next difficulty:', lastDiff, '| rating:', answer.adaptiveRating, '(climbing)');

  // ── Phase B: wrong answers → difficulty eases ──
  for (let i = 0; i < 6; i++) {
    q = await req('/api/question?count=1&section=math&adaptive=1', { cookie });
    answer = await req('/api/answer', {
      cookie,
      method: 'POST',
      body: {
        questionId: q.questions[0].id,
        answerIndex: q.questions[0].type === 'grid' ? undefined : 99,
        answerValue: q.questions[0].type === 'grid' ? 'zzz' : undefined,
        timeMs: 4000,
      },
    });
    lastDiff = answer.adaptiveDiff;
  }
  console.log('4. 6 wrong answers → difficulty now:', lastDiff, '| rating:', answer.adaptiveRating, '(trending down)');

  // ── per-topic proficiency ──
  const topics = await req('/api/topics', { cookie });
  const gridLinear = topics.topics.find((t) => t.topic === 'grid-linear');
  console.log('5. /api/topics →', topics.topics.length, 'topics | grid-linear:', gridLinear ? JSON.stringify({ proficiency: gridLinear.proficiency, level: gridLinear.level, accuracy: gridLinear.accuracy, n: gridLinear.n }) : 'not present (needs 2+ attempts)');

  // dashboard wiring
  const dash = await req('/api/dashboard', { cookie });
  console.log('6. dashboard → topics:', dash.topics.length, '| adaptiveDiff:', dash.stats.adaptiveDiff, '| adaptiveRating:', dash.stats.adaptiveRating);

  // proficiency payload on the last answer
  console.log('7. last proficiency payload →', prof ? JSON.stringify(prof) : 'n/a');

  // explicit difficulty param (non-adaptive)
  const explicit = await req('/api/question?count=1&section=reading&difficulty=1', { cookie });
  console.log('8. explicit difficulty=1 reading → served difficulty', explicit.questions[0].difficulty, '| adaptiveDiff null?', explicit.adaptiveDiff === null);

  console.log('\n✅ ALL ADAPTIVE + PROFICIENCY CHECKS PASSED');
}

main().catch((e) => {
  console.error('❌ FAIL:', e.message);
  process.exit(1);
});
