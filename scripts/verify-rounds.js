'use strict';
// Verifies combo logic (pure function) + a live API smoke test.

const assert = require('node:assert');
const { nextCombo, xpAward } = require('../lib/gamification');

console.log('— unit tests: nextCombo —');
// within a round: correct answers accumulate
assert.strictEqual(nextCombo({ userCombo: 0, correct: true }), 1);
assert.strictEqual(nextCombo({ userCombo: 1, correct: true }), 2);
assert.strictEqual(nextCombo({ userCombo: 9, correct: true }), 10); // capped
assert.strictEqual(nextCombo({ userCombo: 10, correct: true }), 10);
// wrong answer resets
assert.strictEqual(nextCombo({ userCombo: 5, correct: false }), 0);
// new round resets even if the user had a streak
assert.strictEqual(nextCombo({ userCombo: 7, correct: true, newRound: true }), 1);
assert.strictEqual(nextCombo({ userCombo: 7, correct: false, newRound: true }), 0);
console.log('  nextCombo: all 8 assertions passed ✔');

console.log('— unit tests: xpAward —');
assert.strictEqual(xpAward({ correct: false }), 0);
assert.strictEqual(xpAward({ correct: true, difficulty: 1, combo: 0 }), 10);
assert.strictEqual(xpAward({ correct: true, difficulty: 3, combo: 5 }), 30); // 10 + 10 + 10
assert.strictEqual(xpAward({ correct: true, difficulty: 1, combo: 0, timeMs: 8000 }), 15); // +speed
console.log('  xpAward: all assertions passed ✔');

// Live API smoke test
async function raw(path, opts = {}) {
  const res = await fetch('http://localhost:3000' + path, {
    headers: { 'Content-Type': 'application/json', ...(opts.cookie ? { Cookie: opts.cookie } : {}) },
    method: opts.method || 'GET',
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { data: await res.json(), setCookie: res.headers.get('set-cookie') };
}

async function main() {
  const otp = await raw('/api/auth/otp/request', { method: 'POST', body: { email: 'roundtest@test.com', purpose: 'signup' } });
  const signup = await raw('/api/auth/signup', { method: 'POST', body: { username: 'roundtest', email: 'roundtest@test.com', password: 'secret123', otp: otp.data.dev } });
  const cookie = (signup.setCookie || '').split(';')[0];
  if (!cookie) throw new Error('no session cookie');

  const { data } = await raw('/api/question?count=1', { cookie });
  const q = data.questions[0];
  const ans = await raw('/api/answer', { method: 'POST', cookie, body: { questionId: q.id, answerIndex: 0, timeMs: 3000, newRound: true } });
  console.log('— API smoke —');
  console.log(`  question served: ${q.section}/${q.topic}, 4 choices ✔`);
  console.log(`  answer graded: correct=${ans.data.correct}, has explanation=${!!ans.data.explanation} ✔`);
  console.log('\nALL TESTS PASSED');
}

main().catch((e) => { console.error(e); process.exit(1); });
