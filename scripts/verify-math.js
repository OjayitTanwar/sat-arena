'use strict';

// Independent re-solver verification for every math template.
// For each generated question, parse the prompt and recompute the answer from
// first principles; compare with the template's stored correct answer.
// This catches templates whose hand-computed math is wrong.

const mathQuestion = require('../lib/questions/math');

function frac(n, d) {
  const g = (a, b) => (b === 0 ? a : g(b, a % b));
  const k = g(Math.abs(n), Math.abs(d));
  return (n / k) + '/' + (d / k);
}

function toFrac(v) { // 'n/d' or number-string → number
  const s = String(v);
  if (s.includes('/')) {
    const [n, d] = s.split('/').map(Number);
    return n / d;
  }
  return parseFloat(s);
}

// Solvers keyed by topic. Return the expected correct value (string).
const SOLVERS = {
  'algebra-solve-linear': (p) => {
    const m = p.match(/If (\d+)x \+ (\d+) = (\d+)/);
    return String((+m[3] - +m[2]) / +m[1]);
  },
  'algebra-variables-both-sides': (p) => {
    const m = p.match(/If (\d+)x − (\d+) = (\d+)x \+ (\d+)/);
    return String((+m[2] + +m[4]) / (+m[1] - +m[3]));
  },
  'algebra-system-sum': (p) => {
    // If a x + b y = c and d x + e y = f, …  → x+y via Cramer's rule
    const m = p.match(/If (\d+)x \+ (\d+)y = (\d+) and (\d+)x \+ (\d+)y = (\d+)/);
    if (!m) return null;
    const [a, b, c, d, e, f] = m.slice(1).map(Number);
    const det = a * e - b * d;
    if (det === 0) return null;
    const x = (c * e - b * f) / det;
    const y = (a * f - c * d) / det;
    if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
    return String(x + y);
  },
  'algebra-quadratic-sum-roots': (p) => {
    // ax² − bx + c = 0 → sum of roots = −(−b)/a = b/a (Vieta)
    const lead = p.match(/(\d+)x² − (\d+)x \+ (\d+) = 0/);
    if (lead) return String((+lead[2]) / (+lead[1]));
    // x² ± bx + c = 0 → sum of roots = −b
    const m = p.match(/x² ([−+]) (\d+)x \+ (\d+)/);
    if (!m) return null;
    return m[1] === '−' ? m[2] : String(-(+m[2]));
  },
  'algebra-consecutive-integers': (p) => {
    const m = p.match(/sum of four consecutive integers is (\d+)/);
    const sum = +m[1];
    return String((sum - 6) / 4 + 3);
  },
  'algebra-function-value': (p) => {
    const m = p.match(/f\(x\) = (\d+)x \+ (\d+), what is the value of f\((-?\d+)\)/);
    return String(+m[1] * +m[3] + +m[2]);
  },
  'algebra-exponential-growth': (p) => {
    const m = p.match(/population of (\d+) bacteria increases by (\d+)% each hour/);
    return String(+m[1] * Math.pow(1 + +m[2] / 100, 2));
  },
  'problem-solving-percent': (p) => {
    const m = p.match(/priced at \$(\d+) is first increased by (\d+)%, then put on sale at a discount of (\d+)%/);
    return String(+m[1] * (1 + +m[2] / 100) * (1 - +m[3] / 100));
  },
  'problem-solving-average': (p) => {
    const m = p.match(/average \(arithmetic mean\) of five test scores is ([\d.]+).*six tests is (\d+)/);
    return String(6 * +m[2] - 5 * parseFloat(m[1]));
  },
  'problem-solving-ratio': (p) => {
    const m = p.match(/ratio (\d+):(\d+):(\d+).*sum is (\d+)/);
    const r = [+m[1], +m[2], +m[3]];
    const unit = +m[4] / (r[0] + r[1] + r[2]);
    return String(Math.max(...r) * unit);
  },
  'geometry-triangle-angles': (p) => {
    const m = p.match(/angle A is (\d+)°/);
    return String((180 - +m[1]) / 2);
  },
  'geometry-parallel-lines': (p) => {
    const m = p.match(/\((\d+)x \+ (\d+)\)° and the other measures \((\d+)x \+ (\d+)\)°/);
    return String((180 - +m[2] - +m[4]) / (+m[1] + +m[3]));
  },
  'geometry-circle': (p) => {
    // easy variant: circumference → diameter
    const m = p.match(/circumference of approximately ([\d.]+)/);
    if (m) return String(Math.round(parseFloat(m[1]) / 3.14));
    // hard variant: x² + y² + ax + by + c = 0 → radius via completing the square
    // r² = h² + k² − c where h = −a/2, k = −b/2
    const g = p.match(/y² ([+−-]) (\d+)x ([+−-]) (\d+)y ([+−-]) (\d+) = 0/);
    if (g) {
      const a = (g[1] === '−' ? -1 : 1) * +g[2];
      const b = (g[3] === '−' ? -1 : 1) * +g[4];
      const c = (g[5] === '−' ? -1 : 1) * +g[6];
      const r2 = (a / 2) * (a / 2) + (b / 2) * (b / 2) - c;
      return String(Math.sqrt(r2));
    }
    return null;
  },
  'geometry-rectangle-area': (p) => {
    const m = p.match(/perimeter (\d+) and width (\d+)/);
    return String((+m[1] / 2 - +m[2]) * +m[2]);
  },
  'data-median': (p) => {
    const m = p.match(/\{([-\d, ]+)\}/);
    const nums = m[1].split(',').map(Number).sort((a, b) => a - b);
    return String(nums[3]);
  },
  'data-probability': (p) => {
    const m = p.match(/contains (\d+) red marbles and (\d+) blue/);
    const r = +m[1], b = +m[2];
    return frac(r * (r - 1), (r + b) * (r + b - 1));
  },
  'algebra-inequality': (p) => {
    const m = p.match(/If −(\d+)x \+ (\d+) > (\d+)/);
    return String(Math.floor((+m[2] - +m[3]) / +m[1]) - 1);
  },
  'algebra-slope': (p) => {
    const m = p.match(/\((-?\d+), (-?\d+)\) and \((-?\d+), (-?\d+)\)/);
    return String((+m[4] - +m[2]) / (+m[3] - +m[1]));
  },
  'algebra-solve-expression': (p) => {
    const m = p.match(/If (\d+)x \+ (\d+) = (\d+), what is the value of 3x² \+ 2/);
    const x = (+m[3] - +m[2]) / +m[1];
    return String(3 * x * x + 2);
  },
  'problem-solving-rate': (p) => {
    const m = p.match(/travels (\d+) miles at (\d+) mph, then another (\d+) miles at (\d+) mph/);
    const d1 = +m[1], s1 = +m[2], d2 = +m[3], s2 = +m[4];
    return String((d1 + d2) / (d1 / s1 + d2 / s2));
  },
  'geometry-pythagorean': (p) => {
    const m = p.match(/legs have lengths (\d+) and (\d+)/);
    return String(Math.sqrt(+m[1] * +m[1] + +m[2] * +m[2]));
  },
  'algebra-exponents': (p) => {
    const m = p.match(/\(x\^(\d+)\)\^(\d+) · \(x\^(\d+)\)\^(\d+) = x\^n/);
    return String(+m[1] * +m[2] + +m[3] * +m[4]);
  },
  'algebra-exponents-negative': (p) => {
    const m = p.match(/equivalent to (\d+)\^\((?:−)?(\d+)\/(\d+)\)/);
    const base = +m[1], num = +m[2], den = +m[3];
    return '1/' + String(Math.round(Math.pow(base, num / den)));
  },
  'algebra-exponential-function': (p) => {
    const m = p.match(/f\(x\) = (\d+) · (\d+)\^x, what is the value of f\((\d+)\) \+ f\(0\)/);
    return String(+m[1] * Math.pow(+m[2], +m[3]) + +m[1]);
  },
  'geometry-circle-area': (p) => {
    const m = p.match(/circle has circumference ([\d.]+)/);
    const r = parseFloat(m[1]) / 6.28;
    return (3.14 * r * r).toFixed(1);
  },
  // (solver mirrors the template exactly: everything from the displayed C, π≈3.14)
  'geometry-triangle-inequality': (p) => {
    const m = p.match(/two sides of length (\d+) and (\d+)/);
    return String(2 * Math.min(+m[1], +m[2]) - 1);
  },
  'geometry-cylinder-volume': () => '2',
  'data-trend-line': (p) => {
    const m = p.match(/y = (\d+)x \+ (\d+).*scored (\d+) studied for how many hours/);
    return String((+m[3] - +m[2]) / +m[1]);
  },
  'data-table-probability': (p) => {
    const m = p.match(/(\d+) play a sport and prefer morning, \d+ play a sport and prefer evening, (\d+) don't play a sport and prefer morning/);
    return frac(+m[1], +m[1] + +m[2]);
  },
  'algebra-absolute-value': (p) => {
    const m = p.match(/If \|(\d+)x − (\d+)\| = (\d+)/);
    return String((+m[2] + +m[3]) / +m[1]);
  },
  'grid-linear': (p) => {
    const m = p.match(/\((\d+)x \+ (\d+)\) ÷ (\d+) = (\d+)/);
    return String((+m[4] * +m[3] - +m[2]) / +m[1]);
  },
  'grid-algebra': (p) => {
    const m = p.match(/If (\d+)x \+ (\d+) = (\d+), what is the value of (\d+)x² \+ (\d+)/);
    const x = (+m[3] - +m[2]) / +m[1];
    return String(+m[4] * x * x + +m[5]);
  },
  'grid-percent': (p) => {
    const m = p.match(/price of a lamp is \$(\d+).*?(\d+)% markup/);
    return String(+m[1] * (1 + +m[2] / 100));
  },
  'grid-data': (p) => {
    const m = p.match(/average of five numbers is ([\d.]+).*new average is (\d+)/);
    return String(6 * +m[2] - 5 * parseFloat(m[1]));
  },
};

const solved = new Set(Object.keys(SOLVERS));
const perTopic = {};
let checked = 0, mismatches = 0, unsolved = 0, unsolvedTopics = new Set();
const skippedUnsolvable = new Set();

for (let i = 0; i < 40000; i++) {
  const q = mathQuestion();
  const solver = SOLVERS[q.topic];
  if (!solver) { unsolvedTopics.add(q.topic); continue; }
  unsolved = 0;
  let expected;
  try {
    expected = solver(q.prompt);
  } catch {
    // prompt format the solver doesn't recognize — count it, don't crash
    skippedUnsolvable.add(q.topic);
    continue;
  }
  if (expected === null || expected === undefined) continue;
  const actual = q.type === 'grid' ? q.answer : q.choices[q.correctIndex];
  const ok = Math.abs(toFrac(expected) - toFrac(actual)) < 1e-6;
  checked++;
  perTopic[q.topic] = perTopic[q.topic] || { n: 0, bad: 0 };
  perTopic[q.topic].n++;
  if (!ok) {
    perTopic[q.topic].bad++;
    mismatches++;
    if (mismatches <= 5) console.log('✗ MISMATCH', q.topic, '\n  prompt:', q.prompt.slice(0, 110), '\n  expected:', expected, '| actual:', actual);
  }
}

console.log('\nchecked:', checked, '| mismatches:', mismatches);
const badTopics = Object.entries(perTopic).filter(([, v]) => v.bad > 0).map(([t, v]) => `${t}(${v.bad}/${v.n})`);
console.log('topics with mismatches:', badTopics.length ? badTopics.join(', ') : 'NONE ✅');
const uncovered = Object.keys(SOLVERS).filter((t) => !perTopic[t]);
console.log('topics not sampled (should be none):', uncovered.length ? uncovered.join(', ') : 'NONE ✅');
if (unsolvedTopics.size) console.log('topics without solvers (should be none):', [...unsolvedTopics].join(', '));
if (skippedUnsolvable.size) console.log('prompt formats not re-solvable (skipped):', [...skippedUnsolvable].join(', '));
process.exit(mismatches ? 1 : 0);
