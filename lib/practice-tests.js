'use strict';

// ─── Focused practice tests ────────────────────────────────────────────────
// Twelve themed tests with instant answer checking. Each test pulls from the
// live question-template engine, so every run gets fresh questions while
// staying true to its focus area. Scores are graded server-side and saved to
// the practice_test_scores table (viewable in the Stats page).

const { generateSet, generateQuestionByTopic } = require('./questions');

const PRACTICE_TESTS = [
  { id: 'algebra-foundations', title: 'Algebra Foundations', tagline: 'Linear equations, slopes, and systems', section: 'math', count: 10, icon: 'calculator',
    topics: ['algebra-solve-linear', 'algebra-variables-both-sides', 'algebra-slope', 'algebra-slope-intercept', 'algebra-system-sum'] },
  { id: 'advanced-algebra', title: 'Advanced Algebra', tagline: 'Quadratics, exponents, and functions', section: 'math', count: 10, icon: 'calculator',
    topics: ['algebra-quadratic-sum-roots', 'algebra-discriminant', 'algebra-vertex', 'algebra-vertex-minimum', 'algebra-exponents', 'algebra-exponential-function', 'algebra-function-composition'] },
  { id: 'geometry-arena', title: 'Geometry Arena', tagline: 'Circles, triangles, and 3D shapes', section: 'math', count: 10, icon: 'calculator',
    topics: ['geometry-triangle-angles', 'geometry-pythagorean', 'geometry-circle', 'geometry-circle-area', 'geometry-rectangle-area', 'geometry-cylinder-volume', 'geometry-trigonometry'] },
  { id: 'data-and-stats', title: 'Data and Statistics', tagline: 'Averages, probability, and tables', section: 'math', count: 10, icon: 'calculator',
    topics: ['data-median', 'data-probability', 'data-trend-line', 'data-table-probability', 'data-density', 'data-mean-remove', 'data-overlapping-sets'] },
  { id: 'problem-solving', title: 'Problem Solving', tagline: 'Percentages, ratios, and rates', section: 'math', count: 10, icon: 'calculator',
    topics: ['problem-solving-percent', 'problem-solving-average', 'problem-solving-ratio', 'problem-solving-rate', 'problem-solving-work-rate', 'problem-solving-mixture'] },
  { id: 'grid-in-practice', title: 'Grid-in Practice', tagline: 'Typed answers, student-produced responses', section: 'math', count: 8, icon: 'calculator',
    topics: ['grid-linear', 'grid-algebra', 'grid-percent', 'grid-data', 'grid-system'] },
  { id: 'reading-comprehension', title: 'Reading Comprehension', tagline: 'Passages, main ideas, and details', section: 'reading', count: 10, icon: 'book',
    topics: ['reading-comprehension'] },
  { id: 'vocabulary-in-context', title: 'Vocabulary in Context', tagline: 'Hard words, used the SAT way', section: 'reading', count: 8, icon: 'book',
    topics: ['vocabulary-in-context'] },
  { id: 'grammar-rules', title: 'Grammar Rules', tagline: 'Agreement, pronouns, and punctuation', section: 'reading', count: 10, icon: 'book',
    topics: ['subject-verb-agreement', 'pronoun-agreement', 'parallelism', 'modifiers', 'punctuation', 'grammar-usage'] },
  { id: 'transitions-and-usage', title: 'Transitions and Usage', tagline: 'Connect ideas and tighten sentences', section: 'reading', count: 8, icon: 'book',
    topics: ['transitions', 'grammar-usage'] },
  { id: 'mixed-math', title: 'Mixed Math', tagline: 'A little of everything', section: 'math', count: 12, icon: 'calculator' },
  { id: 'the-gauntlet', title: 'The Gauntlet', tagline: 'Hard questions from both sections', section: null, count: 12, icon: 'star' },
];

// Generate a fresh set of unique questions for a test definition.
function generatePracticeTestQuestions(def) {
  const seen = new Set();
  const out = [];
  let guard = 0;
  const max = def.count * 80;
  while (out.length < def.count && guard++ < max) {
    let q;
    if (def.topics && def.topics.length) {
      const topic = def.topics[Math.floor(Math.random() * def.topics.length)];
      q = generateQuestionByTopic(topic);
      // generateQuestionByTopic falls back to an off-topic question when the
      // bank runs dry; skip anything that strays so the test stays on-theme.
      if (!q || !def.topics.includes(q.topic)) continue;
    } else {
      q = generateSet(1, def.section)[0];
    }
    if (!q || seen.has(q.id)) continue;
    seen.add(q.id);
    out.push(q);
  }
  return out;
}

module.exports = { PRACTICE_TESTS, generatePracticeTestQuestions };
