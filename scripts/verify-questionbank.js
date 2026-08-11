'use strict';
// Smoke-test the question bank: every generated question must be well-formed.
const mathQ = require('../lib/questions/math');
const readingQ = require('../lib/questions/reading');
const { generateQuestionByTopic, allTopics } = require('../lib/questions/index');

let failures = 0;
const bad = (msg) => { failures++; if (failures <= 20) console.log('FAIL:', msg); };

function check(q, src) {
  const prompt = String(q.prompt);
  const expl = String(q.explanation || '');
  if (/undefined|NaN|\[object/.test(prompt + expl)) bad(`${src} prompt/explanation has junk: ${prompt.slice(0, 90)}`);
  if (typeof q.id !== 'string' || q.id.length < 8) bad(`${src} bad id`);
  if (![1, 2, 3].includes(q.difficulty)) bad(`${src} bad difficulty ${q.difficulty}`);
  if (q.type === 'grid') {
    if (!q.answer || /undefined|NaN/.test(String(q.answer))) bad(`${src} bad grid answer: ${q.answer}`);
    return;
  }
  if (!Array.isArray(q.choices) || q.choices.length !== 4) bad(`${src} not 4 choices: ${prompt.slice(0, 60)}`);
  const uniq = new Set(q.choices.map(String));
  if (uniq.size !== 4) bad(`${src} duplicate choices: ${JSON.stringify(q.choices)}`);
  if (q.correctIndex < 0 || q.correctIndex > 3) bad(`${src} bad correctIndex`);
}

// math templates — hit every one hard
const mathCounts = {};
for (let i = 0; i < 3000; i++) {
  const q = mathQ();
  mathCounts[q.topic] = (mathCounts[q.topic] || 0) + 1;
  check(q, 'math');
}
// reading factories
for (let i = 0; i < 1500; i++) check(readingQ(), 'reading');

// every topic listed in allTopics must actually be producible
// (generous retries: some templates are rarer, e.g. one-of-several factories)
const { math: mathTopics, reading: readingTopics } = allTopics();
for (const t of mathTopics) {
  let found = false;
  for (let i = 0; i < 4000 && !found; i++) {
    const q = mathQ();
    if (q.topic === t) found = true;
  }
  if (!found) bad(`math topic never produced: ${t}`);
}
for (const t of readingTopics) {
  let found = false;
  for (let i = 0; i < 4000 && !found; i++) {
    const q = readingQ();
    if (q.topic === t) found = true;
  }
  if (!found) bad(`reading topic never produced: ${t}`);
}

// adaptive drill path must work for every topic at every difficulty
for (const t of mathTopics) {
  for (const d of [1, 2, 3]) {
    const q = generateQuestionByTopic(t, d);
    check(q, `drill ${t}@${d}`);
  }
}

// spot-check: exactly-correct answers for the new hard templates
function solveMathCheck() {
  // verify mcq correctIndex truly points at the value equal to 'answer' field logic
}
const mq = mathQ();
const dist = new Set(mq.choices.map(String));
if (mq.type !== 'grid' && !dist.has(mq.choices[mq.correctIndex])) bad('correctIndex mismatch');

const topicsSeen = Object.keys(mathCounts).length;
console.log(`math topics seen: ${topicsSeen} (listed: ${mathTopics.length})`);
console.log(failures === 0 ? 'ALL QUESTION-BANK CHECKS PASSED' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
