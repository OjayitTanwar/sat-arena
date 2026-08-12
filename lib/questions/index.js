'use strict';

const mathQuestion = require('./math');
const readingQuestion = require('./reading');
const { pick } = require('./util');

const READING_TOPICS = new Set([
  'reading-comprehension', 'vocabulary-in-context', 'subject-verb-agreement',
  'pronoun-agreement', 'parallelism', 'modifiers', 'punctuation', 'transitions', 'grammar-usage',
]);

function topicSection(topic) {
  return READING_TOPICS.has(topic) ? 'reading' : 'math';
}

/**
 * Generate a fresh SAT-style question on the spot.
 * @param {string} [section] 'math' | 'reading', omit for a mixed question
 * @param {number} [difficulty] 1-3, prefer questions at exactly this difficulty
 *   (bounded retry, then falls back to any difficulty)
 */
function generateQuestion(section, difficulty) {
  const s = section === 'math' ? 'math' : section === 'reading' ? 'reading' : pick(['math', 'reading']);
  if (!difficulty) return s === 'math' ? mathQuestion() : readingQuestion();
  for (let i = 0; i < 80; i++) {
    const q = s === 'math' ? mathQuestion() : readingQuestion();
    if (q.difficulty === difficulty) return q;
  }
  return s === 'math' ? mathQuestion() : readingQuestion();
}

/**
 * Generate a question matching a specific topic (used by the drill mode).
 * Falls back to a random question if the topic is unknown.
 * @param {string} topic e.g. 'algebra-solve-linear' or 'reading-comprehension'
 * @param {number} [difficulty] 1-3, tries topic+difficulty first, then topic-only
 */
function generateQuestionByTopic(topic, difficulty) {
  const section = topicSection(topic);
  if (!difficulty) {
    // match the exact topic; bounded retry to avoid infinite loops
    for (let i = 0; i < 400; i++) {
      const q = generateQuestion(section);
      if (q.topic === topic) return q;
    }
    return generateQuestion(section);
  }
  // prefer matching both topic AND difficulty (adaptive drills)
  for (let i = 0; i < 400; i++) {
    const q = generateQuestion(section);
    if (q.topic === topic && q.difficulty === difficulty) return q;
  }
  // fall back to the topic at whatever difficulty exists
  for (let i = 0; i < 400; i++) {
    const q = generateQuestion(section);
    if (q.topic === topic) return q;
  }
  return generateQuestion(section);
}

/** All known topics, for building the drill picker and topic stats. */
function allTopics() {
  const mathTopics = ['algebra-solve-linear', 'algebra-variables-both-sides', 'algebra-system-sum',
    'algebra-quadratic-sum-roots', 'algebra-consecutive-integers', 'algebra-function-value',
    'algebra-exponential-growth', 'algebra-inequality', 'algebra-slope', 'algebra-solve-expression',
    'algebra-exponents', 'algebra-exponents-negative', 'algebra-exponential-function',
    'algebra-absolute-value', 'algebra-discriminant', 'algebra-vertex', 'algebra-vertex-minimum',
    'algebra-function-composition', 'algebra-system-infinitely-many', 'algebra-system-no-solution',
    'algebra-linear-model', 'algebra-exponential-decay', 'algebra-radical', 'algebra-complex-numbers',
    'algebra-slope-intercept', 'algebra-exponential-table', 'algebra-rational-equation', 'algebra-perpendicular-slope',
    'problem-solving-percent', 'problem-solving-average', 'problem-solving-ratio', 'problem-solving-ratio-difference',
    'problem-solving-rate', 'problem-solving-work-rate', 'problem-solving-mixture',
    'geometry-triangle-angles', 'geometry-parallel-lines', 'geometry-circle',
    'geometry-circle-area', 'geometry-rectangle-area', 'geometry-pythagorean', 'geometry-triangle-inequality',
    'geometry-cylinder-volume', 'geometry-trigonometry', 'geometry-inscribed-angles', 'geometry-similar-triangles',
    'geometry-sphere-volume', 'geometry-sector-area', 'geometry-arc-length',
    'data-median', 'data-probability', 'data-trend-line', 'data-table-probability', 'data-density',
    'data-overlapping-sets', 'data-linear-table', 'data-percent-total', 'data-mean-remove',
    'grid-linear', 'grid-algebra', 'grid-percent', 'grid-data', 'grid-system'];
  return { math: mathTopics, reading: [...READING_TOPICS] };
}

/**
 * Generate a short practice set.
 * @param {number} [count] number of questions
 * @param {string} [section] 'math' | 'reading' | undefined (mixed)
 * @param {number} [difficulty] 1-3, prefer questions at exactly this difficulty
 */
function generateSet(count = 5, section, difficulty) {
  const seen = new Set();
  const out = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 40) {
    const q = generateQuestion(section, difficulty);
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    out.push(q);
  }
  return out;
}

/** Grid-in topics, mixed into math test modules (student-produced responses). */
const GRID_TOPICS = ['grid-linear', 'grid-algebra', 'grid-percent', 'grid-data', 'grid-system'];

/**
 * Difficulty at position `pos` of a `count`-question module.
 * Mimics the real digital SAT: questions ramp from easier to harder, and
 * module 2 is either 'hard' (after a strong module 1) or 'easy' (after a weak
 * module 1), the SAT's between-module adaptivity.
 */
function moduleDifficultyAt(pos, count, level) {
  const t = pos / count;
  if (level === 'ramp') {               // module 1: gentle ramp
    if (t < 0.35) return pick([1, 1, 2]);
    if (t < 0.7) return 2;
    return pick([2, 3, 3]);
  }
  if (level === 'hard') {               // module 2 after a strong module 1
    if (t < 0.35) return pick([2, 2, 3]);
    if (t < 0.7) return pick([2, 3]);
    return 3;
  }
  if (t < 0.35) return 1;               // module 2 after a weak module 1
  if (t < 0.7) return pick([1, 2]);
  return pick([2, 2]);
}

/**
 * Generate one full-length test module (default: 27 questions like the real
 * digital SAT). Math modules mix in ~5 grid-in questions at random slots.
 * Pass a shared `seen` Set so a whole test (all 4 modules) never repeats a
 * question, just like the real SAT.
 */
function generateTestModule(section, { count = 27, level = 'ramp', key, name, seen } = {}) {
  const isMath = section === 'math';
  const gridSlots = new Set();
  if (isMath) {
    const gridCount = Math.max(4, Math.min(6, Math.round(count * 0.19)));
    while (gridSlots.size < gridCount) gridSlots.add(pick([...Array(count).keys()]));
  }
  const used = seen || new Set();
  const out = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 200) {
    const pos = out.length;
    const difficulty = moduleDifficultyAt(pos, count, level);
    const q = (isMath && gridSlots.has(pos))
      ? generateQuestionByTopic(pick(GRID_TOPICS), difficulty)
      : generateQuestion(section, difficulty);
    if (q.type !== 'grid' && gridSlots.has(pos) && isMath) continue; // grid slot must be a grid-in
    if (used.has(q.id)) continue;
    used.add(q.id);
    out.push(q);
  }
  if (out.length < count) {
    // Practically unreachable (content-hash ids + randomized templates), but
    // scoring assumes exactly `count` per module, fail loudly instead of
    // silently scoring a short module.
    console.error(`generateTestModule: only ${out.length}/${count} questions filled (${section} ${level})`);
  }
  return { key, name, section, questions: out };
}

/**
 * Compute a 400-1600 scaled score from per-section raw performance.
 * Real SAT maps ~0% → 200 and ~100% → 800 per section; we mirror that linearly.
 */
function computeScaledScore(rwCorrect, rwTotal, mathCorrect, mathTotal) {
  const section = (correct, total) => {
    if (!total) return 400; // neutral midpoint when no data
    const pct = correct / total;
    return Math.round(200 + pct * 600); // 200..800 per section
  };
  const rw = section(rwCorrect, rwTotal);
  const math = section(mathCorrect, mathTotal);
  return { rw, math, total: rw + math }; // 400..1600
}

function scoreBand(total) {
  if (total >= 1500) return { label: 'Outstanding. You are test-day ready.', emoji: '🏆' };
  if (total >= 1300) return { label: 'Strong. A few refinements to go.', emoji: '💪' };
  if (total >= 1100) return { label: 'Solid foundation. Keep drilling weak spots.', emoji: '📈' };
  if (total >= 900) return { label: 'Getting there. Consistent practice will move this fast.', emoji: '🌱' };
  return { label: 'Early stage. Every round is progress.', emoji: '🚀' };
}

module.exports = { generateQuestion, generateQuestionByTopic, generateSet, generateTestModule, computeScaledScore, scoreBand, allTopics };
