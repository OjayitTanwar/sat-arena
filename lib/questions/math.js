'use strict';

// ─── Math question templates mimicking real SAT questions ──────────────────
// Each template is a function that returns a fully-formed question object:
//   { id, section, topic, difficulty, prompt, choices[4], correctIndex, explanation }
// Difficulty scale: 1 = Easy, 2 = Medium, 3 = Hard (deliberately demanding —
// two-step work, negative numbers, and common-trap distractors).

const { randInt, pick, shuffle, hashId } = require('./util');

const T = {}; // templates keyed by name

// ── Algebra: linear equation (two-digit values) ───────────────────────────
T.linear_solve = () => {
  const a = randInt(3, 12);
  const b = randInt(4, 20);
  const x = randInt(4, 15);
  const c = a * x + b;
  const distractorMoves = [
    c - b,            // forgot to divide
    (c - b) + a,      // sign slip on division
    (c + b) / a,      // sign error on b
    c / a,            // ignored b
  ];
  return mcq(
    'algebra-solve-linear', 1,
    `If ${a}x + ${b} = ${c}, what is the value of x?`,
    x, distractorMoves,
    `Subtract ${b} from both sides: ${a}x = ${c - b}. Then divide by ${a}: x = ${c - b} ÷ ${a} = ${x}.`
  );
};

// ── Algebra: variables on both sides with subtraction ─────────────────────
T.linear_both = () => {
  // a·x − b = c·x + d  with a − c = k and b + d = k·x  →  x = (b + d)/k
  const k = randInt(1, 7);
  const x = randInt(5, 12);
  const c = randInt(2, 8);
  const a = c + k;
  const b = randInt(3, Math.max(4, k * x - 2)); // leave room for d ≥ 1
  const d = k * x - b;
  const eq = `${a}x − ${b} = ${c}x + ${d}`;
  const distractorMoves = [x + 1, x - 1, c * x + d, b + d];
  return mcq(
    'algebra-variables-both-sides', 2,
    `If ${eq}, what is the value of x?`,
    x, distractorMoves,
    `Subtract ${c}x from both sides: ${k}x − ${b} = ${d}. Add ${b}: ${k}x = ${b + d}. So x = ${b + d} ÷ ${k} = ${x}.`
  );
};

// ── Algebra: system of equations (larger coefficients) ────────────────────
T.system_sum = () => {
  const a = randInt(2, 9), b = randInt(2, 9), c = randInt(2, 9), d = randInt(2, 9);
  const x = randInt(3, 12), y = randInt(3, 12);
  const eq1 = `${a}x + ${b}y = ${a * x + b * y}`;
  const eq2 = `${c}x + ${d}y = ${c * x + d * y}`;
  const ans = x + y;
  const distract = [x + y + 2, Math.abs(x - y), x * y, x + y - 1];
  return mcq(
    'algebra-system-sum', 3,
    `If ${eq1} and ${eq2}, what is the value of x + y?`,
    ans, distract,
    `Solve by elimination or substitution. The solution is x = ${x} and y = ${y}, so x + y = ${x + y}.`
  );
};

// ── Algebra: quadratic — sum of solutions (larger roots) ──────────────────
T.quad_sum_roots = () => {
  const r1 = randInt(3, 9), r2 = randInt(3, 9);
  const a = 1, b = -(r1 + r2), c = r1 * r2;
  const sign = b >= 0 ? '+' : '−';
  const absB = Math.abs(b);
  const eq = `x² ${sign} ${absB}x + ${c} = 0`;
  const ans = r1 + r2;
  const distract = [r1 * r2, Math.abs(b), -Math.abs(b), r1 * r2 + (r1 + r2)];
  return mcq(
    'algebra-quadratic-sum-roots', 2,
    `What is the sum of the solutions to the equation ${eq}?`,
    ans, distract,
    `The equation factors as (x − ${r1})(x − ${r2}) = 0, so the solutions are ${r1} and ${r2}. Their sum is ${r1} + ${r2} = ${ans}. (Recall: for x² + bx + c = 0, the sum of roots is −b.)`
  );
};

// ── Algebra: word problem — four consecutive integers ─────────────────────
T.consecutive = () => {
  const n = randInt(5, 15); // four consecutive starting at n
  const sum = 4 * n + 6;
  const ans = n + 3; // largest integer
  const distract = [n, sum / 4, sum, n + 1];
  return mcq(
    'algebra-consecutive-integers', 1,
    `The sum of four consecutive integers is ${sum}. What is the largest of the four?`,
    ans, distract,
    `Let the integers be x, x + 1, x + 2, x + 3. Then 4x + 6 = ${sum}, so 4x = ${sum - 6} and x = ${n}. The largest is x + 3 = ${ans}.`
  );
};

// ── Algebra: function notation (negative input) ───────────────────────────
T.function_value = () => {
  const a = randInt(3, 9), b = randInt(5, 25);
  const x = pick([-5, -4, -3, -2, -1, 1, 2, 3, 4, 5]);
  const f = `${a}x + ${b}`;
  const ans = a * x + b;
  const distract = [a * x, b, a + x + b, a * x - b];
  return mcq(
    'algebra-function-value', 1,
    `If f(x) = ${f}, what is the value of f(${x})?`,
    ans, distract,
    `Substitute ${x} for x: f(${x}) = ${a}(${x}) + ${b} = ${a * x} + ${b} = ${ans}.`
  );
};

// ── Algebra: compound exponential growth (2 hours) ────────────────────────
T.exponential_growth = () => {
  const start = pick([100, 200, 300, 400]);
  const rate = pick([10, 20, 50]); // clean compound factors 1.21 / 1.44 / 2.25
  const factor = Math.pow(1 + rate / 100, 2);
  const ans = start * factor;
  const distract = [start * (1 + rate / 100), start + 2 * rate, start * (1 + (2 * rate) / 100), start * 2];
  return mcq(
    'algebra-exponential-growth', 2,
    `A population of ${start} bacteria increases by ${rate}% each hour. What is the population after 2 hours?`,
    ans, distract,
    `Each hour multiplies the population by (1 + ${rate}/100). After 2 hours: ${start} × (1.${rate})² = ${start} × ${factor} = ${ans}.`
  );
};

// ── Word problem: percent increase then discount (two-step) ───────────────
T.percent_change = () => {
  const orig = pick([100, 200]);
  const p = pick([10, 20]);
  const d = pick([10, 20]);
  const ans = orig * (1 + p / 100) * (1 - d / 100);
  const distract = [orig * (1 + p / 100), orig * (1 - d / 100), orig + p + d, orig * (1 + (p - d) / 100)];
  return mcq(
    'problem-solving-percent', 2,
    `A jacket priced at $${orig} is first increased by ${p}%, then put on sale at a discount of ${d}% off the new price. What is the final price?`,
    ans, distract,
    `After the increase: $${orig} × ${1 + p / 100} = $${orig * (1 + p / 100)}. After the ${d}% discount: $${orig * (1 + p / 100)} × ${1 - d / 100} = $${ans}.`
  );
};

// ── Word problem: average — missing sixth score ───────────────────────────
T.average_find = () => {
  const nums = Array.from({ length: 5 }, () => randInt(55, 95));
  const target = randInt(70, 90);
  const sum = nums.reduce((a, b) => a + b, 0);
  const ans = target * 6 - sum;
  const distract = [target - sum / 5, sum - target * 6, target * 6 - sum + 5, target * 5 - sum / 5];
  return mcq(
    'problem-solving-average', 3,
    `The average (arithmetic mean) of five test scores is ${(sum / 5).toFixed(1)}. What score must a sixth test have so that the average of all six tests is ${target}?`,
    ans, distract,
    `Total of five tests = ${sum}. For six tests to average ${target}, the total must be ${target} × 6 = ${target * 6}. The sixth score = ${target * 6} − ${sum} = ${ans}.`
  );
};

// ── Word problem: three-part ratio ────────────────────────────────────────
T.ratio_split = () => {
  const r1 = randInt(2, 6), r2 = randInt(2, 6), r3 = randInt(2, 6);
  const unit = randInt(3, 8);
  const total = (r1 + r2 + r3) * unit;
  const ans = Math.max(r1, r2, r3) * unit;
  const distract = [r1 * unit, r2 * unit, unit, total / 2];
  return mcq(
    'problem-solving-ratio', 2,
    `Three numbers are in the ratio ${r1}:${r2}:${r3}. If their sum is ${total}, what is the largest number?`,
    ans, distract,
    `Let the numbers be ${r1}k, ${r2}k, and ${r3}k. Then (${r1 + r2 + r3})k = ${total}, so k = ${unit}. The largest is ${Math.max(r1, r2, r3)} × ${unit} = ${ans}.`
  );
};

// ── Geometry: isosceles triangle base angle ───────────────────────────────
T.triangle_angles = () => {
  const vertex = pick([40, 50, 60, 70, 80]); // even so base angle is an integer
  const ans = (180 - vertex) / 2;
  const distract = [180 - vertex, vertex, 90 - vertex, 180 - 2 * vertex];
  return mcq(
    'geometry-triangle-angles', 1,
    `In isosceles triangle ABC, AB = AC and the measure of angle A is ${vertex}°. What is the measure of angle B?`,
    ans, distract,
    `The base angles of an isosceles triangle are equal, and the angles sum to 180°. So angle B = (180° − ${vertex}°) ÷ 2 = ${ans}°.`
  );
};

// ── Geometry: parallel lines with algebra (solve for x) ───────────────────
T.parallel_angles = () => {
  // consecutive interior angles (3x + b)° and (2x + d)° sum to 180°
  let a, c, x, b, d;
  let guard = 0;
  do {
    a = randInt(2, 5);
    c = randInt(2, 5);
    x = randInt(10, 34);
    b = randInt(10, 40);
    d = 180 - b - (a + c) * x;
    guard++;
  } while (d < 10 && guard < 60);
  const ans = x;
  const distract = [x + 1, x - 1, b + d, (a + c) * x];
  return mcq(
    'geometry-parallel-lines', 2,
    `Two parallel lines are cut by a transversal. One consecutive interior angle measures (${a}x + ${b})° and the other measures (${c}x + ${d})°. What is the value of x?`,
    ans, distract,
    `Consecutive interior angles are supplementary: (${a}x + ${b}) + (${c}x + ${d}) = 180. So ${a + c}x = 180 − ${b + d} = ${180 - b - d}, and x = ${ans}.`
  );
};

// ── Geometry: circumference → diameter ────────────────────────────────────
T.circle_radius = () => {
  const r = randInt(4, 10);
  const circ = 2 * Math.PI * r;
  const ans = 2 * r;
  const distract = [r, r * r, Math.round(circ), r + 2];
  return mcq(
    'geometry-circle', 1,
    `A circle has a circumference of approximately ${circ.toFixed(1)} units. What is its diameter? (Use π ≈ 3.14.)`,
    ans, distract,
    `Circumference = πd, so d = C ÷ π ≈ ${circ.toFixed(1)} ÷ 3.14 ≈ ${ans}.`
  );
};

// ── Geometry: rectangle — area from perimeter (two-step) ──────────────────
T.rectangle_area = () => {
  const l = randInt(10, 20), w = randInt(4, 9);
  const P = 2 * (l + w);
  const ans = l * w;
  const distract = [l + w, P, l + w - 2, (l + w) * 2 - 2];
  return mcq(
    'geometry-rectangle-area', 2,
    `A rectangle has perimeter ${P} and width ${w}. What is its area?`,
    ans, distract,
    `Perimeter = 2(l + w), so l = ${P} ÷ 2 − ${w} = ${l}. Area = l × w = ${l} × ${w} = ${ans}.`
  );
};

// ── Data: median of 7 values (including negatives) ────────────────────────
T.data_median = () => {
  const nums = Array.from({ length: 7 }, () => randInt(-20, 40)).sort((a, b) => a - b);
  const ans = nums[3];
  const distract = [nums[0], nums[6], Math.round(nums.reduce((a, b) => a + b, 0) / 7), nums[2]];
  return mcq(
    'data-median', 1,
    `What is the median of the data set {${nums.join(', ')}}?`,
    ans, distract,
    `Sorted: ${nums.join(', ')}. The median is the middle value (4th of 7), which is ${ans}.`
  );
};

// ── Data: probability without replacement ─────────────────────────────────
function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
function frac(n, d) { const g = gcd(n, d); return `${n / g}/${d / g}`; }

T.probability = () => {
  const red = randInt(4, 12);
  const blue = randInt(4, 12);
  const total = red + blue;
  const ans = frac(red * (red - 1), total * (total - 1));
  const distract = [frac(red, total), frac(red - 1, total - 1), frac(red * blue, total * (total - 1)), frac(red + red, total + total)];
  return mcq(
    'data-probability', 2,
    `A bag contains ${red} red marbles and ${blue} blue marbles. Two marbles are drawn at random WITHOUT replacement. What is the probability that BOTH are red? (Answer as a fraction in simplest form.)`,
    ans, distract,
    `P(first red) = ${red}/${total}. With one red removed, P(second red) = ${red - 1}/${total - 1}. So P(both) = ${red}/${total} × ${red - 1}/${total - 1} = ${ans}.`
  );
};

// ── Algebra: inequality with sign flip ────────────────────────────────────
T.inequality = () => {
  // −a·x + b > c  →  x < (b − c)/a  →  largest integer = x0 − 1
  const a = randInt(2, 6);
  const x0 = randInt(2, 8);
  const b = randInt(2 * a * x0 + 10, 60);
  const c = b - a * x0;
  const ans = x0 - 1;
  const distract = [x0, x0 + 1, c, b - a];
  return mcq(
    'algebra-inequality', 2,
    `If −${a}x + ${b} > ${c}, what is the LARGEST integer value of x?`,
    ans, distract,
    `Subtract ${b}: −${a}x > ${c - b} = −${b - c}. Divide by −${a} and FLIP the sign: x < ${(b - c) / a} = ${x0}. The largest integer less than ${x0} is ${ans}.`
  );
};

// ── Algebra: slope between two points (negatives, fractions) ──────────────
T.slope_points = () => {
  const x1 = randInt(-4, -1), y1 = randInt(-8, 8), dx = randInt(3, 7);
  const dy = pick([-9, -7, -5, -4, -3, 3, 4, 5, 7, 9]);
  const x2 = x1 + dx, y2 = y1 + dy;
  const ans = dy / dx;
  const distract = [dx / dy, dy - dx, y2 - y1, Math.abs(dy) / dx];
  return mcq(
    'algebra-slope', 2,
    `What is the slope of the line that passes through the points (${x1}, ${y1}) and (${x2}, ${y2})?`,
    ans, distract,
    `Slope = (y₂ − y₁)/(x₂ − x₁) = (${y2} − ${y1}) / (${x2} − ${x1}) = ${dy} / ${dx} = ${ans}.`
  );
};

// ── Algebra: solve for expression with a square ───────────────────────────
T.solve_expression = () => {
  const a = randInt(2, 7), b = randInt(3, 15), x = randInt(3, 8);
  const c = a * x + b;
  const target = 3 * x * x + 2;
  const distract = [3 * x + 2, x * x + 2, 3 * x * x - 2, a * x + b];
  return mcq(
    'algebra-solve-expression', 3,
    `If ${a}x + ${b} = ${c}, what is the value of 3x² + 2?`,
    target, distract,
    `${a}x = ${c} − ${b} = ${c - b}, so x = ${x}. Then 3x² + 2 = 3(${x}²) + 2 = ${3 * x * x} + 2 = ${target}.`
  );
};

// ── Problem: average speed — two equal legs at different speeds ───────────
T.rate = () => {
  const d = pick([60, 120, 180]);
  const s1 = pick([20, 30, 40]);
  const s2 = 3 * s1;
  const ans = (2 * d) / (d / s1 + d / s2); // = 3·s1 / 2
  const distract = [(s1 + s2) / 2, s2, s1, (2 * s1 + s2) / 3];
  return mcq(
    'problem-solving-rate', 1,
    `A car travels ${d} miles at ${s1} mph, then another ${d} miles at ${s2} mph. What is its average speed for the entire trip?`,
    ans, distract,
    `Total distance = ${2 * d} miles. Total time = ${d}/${s1} + ${d}/${s2} = ${(d / s1).toFixed(1)} + ${(d / s2).toFixed(1)} = ${(d / s1 + d / s2).toFixed(1)} hours. Average speed = ${2 * d} ÷ ${(d / s1 + d / s2).toFixed(1)} = ${ans} mph.`
  );
};

// ── Geometry: Pythagorean theorem (larger triples) ────────────────────────
T.pythagorean = () => {
  const triples = [
    [5, 12, 13], [7, 24, 25], [8, 15, 17], [9, 40, 41], [12, 35, 37],
    [20, 21, 29], [9, 12, 15], [15, 20, 25],
  ];
  const [a, b, c] = pick(triples);
  const distract = [a + b, c - 1, a * b / 2, c + 1];
  return mcq(
    'geometry-pythagorean', 2,
    `In a right triangle, the legs have lengths ${a} and ${b}. What is the length of the hypotenuse?`,
    c, distract,
    `By the Pythagorean theorem: c² = ${a}² + ${b}² = ${a * a} + ${b * b} = ${c * c}, so c = ${c}.`
  );
};

// ── Algebra: exponents — product of two powers ────────────────────────────
T.exponents_simplify = () => {
  const a = randInt(2, 4), b = randInt(2, 4), c = randInt(2, 4), d = randInt(2, 4);
  const ans = a * b + c * d;
  const distract = [a * b, c * d, a * b * c * d, a + b + c + d];
  return mcq(
    'algebra-exponents', 2,
    `If (x^${a})^${b} · (x^${c})^${d} = x^n, what is the value of n?`,
    ans, distract,
    `(x^${a})^${b} = x^(${a}×${b}) = x^${a * b} and (x^${c})^${d} = x^${c * d}. Adding the exponents: n = ${a * b} + ${c * d} = ${ans}.`
  );
};

// ── Algebra: fractional negative exponent (classic SAT hard) ──────────────
T.exponents_negative = () => {
  // table of { base, exponent, result (r = the positive power), rootVal }
  const table = [
    { b: '8', e: '−2/3', r: 4, root: 2 },
    { b: '27', e: '−2/3', r: 9, root: 3 },
    { b: '16', e: '−3/4', r: 8, root: 2 },
    { b: '125', e: '−2/3', r: 25, root: 5 },
  ];
  const t = pick(table);
  const ans = `1/${t.r}`;
  const distract = [String(t.r), String(t.root), String(t.root * t.r), String(t.r * t.r)];
  return mcq(
    'algebra-exponents-negative', 3,
    `Which of the following is equivalent to ${t.b}^(${t.e})?`,
    ans, distract,
    `${t.b}^(${t.e}) = 1 / ${t.b}^(${t.e.replace('-', '')}) = 1 / (${t.root}^${t.e.includes('3') ? '2' : t.e.includes('4') ? '3' : '2'}) = 1/${t.r}.`
  );
};

// ── Algebra: exponential function — sum of two values ─────────────────────
T.exponential_function = () => {
  const a = pick([2, 3]);
  const b = pick([2, 3]);
  const x = randInt(1, 3);
  const ans = a * Math.pow(b, x) + a;
  const distract = [a * Math.pow(b, x), a * Math.pow(b, x + 1), a * (Math.pow(b, x) + 1) * 2, a * Math.pow(b, x - 1)];
  return mcq(
    'algebra-exponential-function', 2,
    `If f(x) = ${a} · ${b}^x, what is the value of f(${x}) + f(0)?`,
    ans, distract,
    `f(${x}) = ${a} · ${b}^${x} = ${a * Math.pow(b, x)} and f(0) = ${a} · ${b}^0 = ${a}. Sum = ${a * Math.pow(b, x)} + ${a} = ${ans}.`
  );
};

// ── Geometry: circle — area from circumference (larger radii) ─────────────
T.circle_area_from_circ = () => {
  // Compute everything from the DISPLAYED circumference using π ≈ 3.14 so a
  // student's work with the numbers on screen lands exactly on the answer.
  const r = randInt(4, 12);
  const shownCirc = (2 * Math.PI * r).toFixed(1);
  const studentR = parseFloat(shownCirc) / 6.28;      // π ≈ 3.14 → 2π ≈ 6.28
  const ans = 3.14 * studentR * studentR;
  const distract = [parseFloat(shownCirc), ans / 2, parseFloat(shownCirc) / 2, ans * 2];
  return mcq(
    'geometry-circle-area', 3,
    `A circle has circumference ${shownCirc}. What is its area? (Use π ≈ 3.14 and round to one decimal place.)`,
    ans.toFixed(1), distract,
    `Circumference = 2πr = ${shownCirc}, so r ≈ ${shownCirc} ÷ 6.28 ≈ ${studentR.toFixed(2)}. Area = πr² ≈ 3.14 × ${studentR.toFixed(2)}² ≈ ${ans.toFixed(1)}.`
  );
};

// ── Geometry: triangle inequality — count integer possibilities ───────────
T.triangle_inequality = () => {
  const a = randInt(3, 9), b = randInt(4, 10);
  const ans = 2 * Math.min(a, b) - 1; // integer lengths for the third side
  const distract = [a + b, Math.abs(a - b), a + b - 1, Math.min(a, b)];
  return mcq(
    'geometry-triangle-inequality', 3,
    `A triangle has two sides of length ${a} and ${b}. If the third side must be an integer, how many possible integer lengths can it have?`,
    ans, distract,
    `The third side x must satisfy |${a} − ${b}| < x < ${a} + ${b}, i.e. ${Math.abs(a - b) + 1} ≤ x ≤ ${a + b - 1}. That is ${a + b - 1} − ${Math.abs(a - b) + 1} + 1 = ${ans} integers.`
  );
};

// ── Geometry: cylinder volume scaling (conceptual) ────────────────────────
T.cylinder_volume = () => {
  const ans = 2;
  const distract = [4, 8, 1, '1/2'];
  return mcq(
    'geometry-cylinder-volume', 2,
    `A cylinder has radius r and height h, with volume V = πr²h. If the radius is doubled and the height is halved, the new volume is how many times the original?`,
    ans, distract,
    `New volume = π(2r)²(h/2) = π · 4r² · h/2 = 2πr²h = 2V. So the volume is multiplied by ${ans}.`
  );
};

// ── Data: trend line — inverse (score → study hours) ──────────────────────
T.data_trend = () => {
  const slope = pick([2, 3, 5]);
  const x = randInt(3, 9);
  const intercept = randInt(10, 30);
  const y = slope * x + intercept;
  const ans = x;
  const distract = [x + 1, x - 1, y - slope, y / slope];
  return mcq(
    'data-trend-line', 2,
    `A scatterplot of study time (x, in hours) versus test score is modeled by y = ${slope}x + ${intercept}. According to the model, a student who scored ${y} studied for how many hours?`,
    ans, distract,
    `Set ${slope}x + ${intercept} = ${y}. Then ${slope}x = ${y} − ${intercept} = ${y - intercept}, so x = ${y - intercept} ÷ ${slope} = ${x} hours.`
  );
};

// ── Data: two-way table conditional probability ───────────────────────────
T.data_table_prob = () => {
  const a = randInt(8, 25), b = randInt(5, 15), c = randInt(10, 25), d = randInt(5, 18);
  const morning = a + c; // prefer morning
  const ans = frac(a, morning); // P(plays sport | prefers morning)
  const distract = [frac(a + b, a + b + c + d), frac(a, a + b + c + d), frac(b, a + b), frac(c, morning)];
  return mcq(
    'data-table-probability', 3,
    `A survey of ${a + b + c + d} students asked whether they prefer morning or evening classes and whether they play a sport. ${a} play a sport and prefer morning, ${b} play a sport and prefer evening, ${c} don't play a sport and prefer morning, and ${d} don't play a sport and prefer evening. If a student prefers morning classes, what is the probability that they play a sport?`,
    ans, distract,
    `Given that the student prefers morning, there are ${morning} such students (${a} + ${c}). Of those, ${a} play a sport. So P(play sport | morning) = ${a}/${morning} = ${ans}.`
  );
};

// ── Algebra: absolute value — factor out the coefficient ──────────────────
T.absolute_value = () => {
  const a = randInt(2, 4);
  const q = randInt(2, 5);
  const m = randInt(2, 4);
  const b = a * q, k = a * m;
  const ans = q + m; // largest solution
  const distract = [q - m, m, q, q + m + 1];
  return mcq(
    'algebra-absolute-value', 3,
    `If |${a}x − ${b}| = ${k}, what is the LARGEST possible value of x?`,
    ans, distract,
    `Divide both sides by ${a}: |x − ${q}| = ${m}. So x − ${q} = ±${m}, giving x = ${q} + ${m} = ${q + m} or x = ${q} − ${m} = ${q - m}. The largest is ${ans}.`
  );
};

// ── GRID-IN: student-produced response ────────────────────────────────────
T.grid_linear = () => {
  // (a·x + b) ÷ c = d
  let a = randInt(2, 6), b = randInt(2, 10), c = 1, x = randInt(4, 12);
  let guard = 0;
  do {
    a = randInt(2, 6);
    b = randInt(2, 10);
    x = randInt(4, 12);
    c = pick([2, 3, 4]);
    guard++;
  } while ((a * x + b) % c !== 0 && guard < 80);
  const d = (a * x + b) / c;
  return grid(
    'grid-linear', 1,
    `If (${a}x + ${b}) ÷ ${c} = ${d}, what is the value of x?`,
    x,
    `Multiply both sides by ${c}: ${a}x + ${b} = ${d * c}. Subtract ${b}: ${a}x = ${a * x}. Divide by ${a}: x = ${x}.`
  );
};

T.grid_two_step = () => {
  const a = randInt(2, 5), b = randInt(2, 10), x = randInt(4, 10);
  const c = a * x + b;
  const k = randInt(2, 5), m = randInt(1, 6);
  const ans = k * x * x + m;
  return grid(
    'grid-algebra', 2,
    `If ${a}x + ${b} = ${c}, what is the value of ${k}x² + ${m}?`,
    ans,
    `Solve: ${a}x = ${a * x}, so x = ${x}. Then ${k}x² + ${m} = ${k}(${x}²) + ${m} = ${k * x * x} + ${m} = ${ans}.`
  );
};

T.grid_percent = () => {
  const pairs = [
    [80, 25, 100], [120, 25, 150], [160, 25, 200], [200, 15, 230],
    [240, 25, 300], [250, 20, 300], [80, 40, 112], [150, 20, 180],
  ];
  const [price, pct, ans] = pick(pairs);
  return grid(
    'grid-percent', 2,
    `The price of a lamp is $${price}. A store adds a ${pct}% markup. What is the new price in dollars?`,
    ans,
    `Markup = ${pct}% of $${price} = $${price * pct / 100}. New price = $${price} + $${price * pct / 100} = $${ans}.`
  );
};

T.grid_mean = () => {
  const nums = Array.from({ length: 5 }, () => randInt(10, 60));
  const total = nums.reduce((a, b) => a + b, 0);
  const target = randInt(20, 50);
  const ans = target * 6 - total;
  return grid(
    'grid-data', 3,
    `The average of five numbers is ${(total / 5).toFixed(1)}. If a sixth number is added and the new average is ${target}, what is the sixth number?`,
    ans,
    `Five numbers sum to ${total}. Six numbers must sum to ${target} × 6 = ${target * 6}. The sixth = ${target * 6} − ${total} = ${ans}.`
  );
};

// ── NEW HARD TIER: quadratics, functions, systems, trig, circles, data ─────

T.quad_discriminant = () => {
  const Ds = [-36, -16, 0, 16, 36, 64, 100];
  let a, b, c, D;
  let guard = 0;
  do {
    a = randInt(1, 4);
    b = randInt(6, 16);
    D = pick(Ds);
    c = (b * b - D) / (4 * a);
    guard++;
  } while ((!Number.isInteger(c) || c < 1) && guard < 120);
  const count = D > 0 ? '2' : D === 0 ? '1' : '0';
  const others = ['0', '1', '2', '3'].filter((v) => v !== count);
  const verdict = D > 0 ? 'positive, so there are 2 distinct real solutions' : D === 0 ? 'zero, so there is exactly 1 real solution' : 'negative, so there are no real solutions';
  return mcq(
    'algebra-discriminant', 3,
    `How many distinct real solutions does the equation ${a}x² + ${b}x + ${c} = 0 have?`,
    count, others,
    `The discriminant is b² − 4ac = ${b}² − 4(${a})(${c}) = ${b * b} − ${4 * a * c} = ${b * b - 4 * a * c}, which is ${verdict}.`
  );
};

T.quad_vertex = () => {
  const a = randInt(1, 4);
  const k = pick([-5, -4, -3, -2, -1, 1, 2, 3, 4, 5]);
  const b = 2 * a * k;
  const c = randInt(1, 9);
  const ans = -k;
  const distract = [k, c, -k + 1, b];
  return mcq(
    'algebra-vertex', 2,
    `The graph of y = ${a}x² ${b >= 0 ? '+' : '−'} ${Math.abs(b)}x + ${c} is a parabola. What is the x-coordinate of its vertex?`,
    ans, distract,
    `For y = ax² + bx + c, the vertex lies at x = −b/(2a). Here x = −(${b})/(2·${a}) = −(${k}) = ${ans}.`
  );
};

T.vertex_min = () => {
  const h = randInt(2, 6);
  const k = randInt(1, 8);
  const b = 2 * h;
  const c = h * h + k;
  return mcq(
    'algebra-vertex-minimum', 3,
    `What is the minimum value of the function f(x) = x² + ${b}x + ${c}?`,
    k, [h, -h, c, b],
    `Complete the square: f(x) = (x + ${h})² + ${k}. Since the squared term is never negative, the minimum value of f is ${k}.`
  );
};

T.function_compose = () => {
  const a = randInt(2, 5);
  const b = pick([-9, -8, -7, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const c = randInt(2, 5);
  const d = pick([-8, -7, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8]);
  const x = randInt(1, 4);
  const gx = c * x + d;
  const ans = a * gx + b;
  const distract = [a * c * x + b, a * gx, a * (c * x) + d, a * c * x + b + d];
  return mcq(
    'algebra-function-composition', 3,
    `If f(x) = ${a}x ${b >= 0 ? '+' : '−'} ${Math.abs(b)} and g(x) = ${c}x ${d >= 0 ? '+' : '−'} ${Math.abs(d)}, what is the value of f(g(${x}))?`,
    ans, distract,
    `First g(${x}) = ${c}(${x}) ${d >= 0 ? '+' : '−'} ${Math.abs(d)} = ${gx}. Then f(${gx}) = ${a}(${gx}) ${b >= 0 ? '+' : '−'} ${Math.abs(b)} = ${ans}.`
  );
};

function systemParallel(askNoSolution) {
  const a1 = randInt(2, 5);
  const b1 = randInt(3, 8);
  const c1 = randInt(6, 20);
  const c2 = askNoSolution ? 2 * c1 + 1 : 2 * c1;
  const ans = 2 * b1;
  const distract = [b1, 2 * a1, c1, ans + 1];
  const eqs = `${a1}x + ${b1}y = ${c1}\n${2 * a1}x + ky = ${c2}`;
  if (askNoSolution) {
    return mcq(
      'algebra-system-no-solution', 3,
      `Consider the system of equations:\n\n${eqs}\n\nFor which value of k does the system have NO solution?`,
      ans, distract,
      `The lines are parallel (same slope) but distinct when the coefficients are proportional but the constants are not: ${2 * a1}/${a1} = k/${b1}, so k = ${ans}. Since ${2 * c1} ≠ ${c2}, the lines never intersect.`
    );
  }
  return mcq(
    'algebra-system-infinitely-many', 3,
      `Consider the system of equations:\n\n${a1}x + ${b1}y = ${c1}\n${2 * a1}x + ky = ${2 * c1}\n\nFor which value of k does the system have infinitely many solutions?`,
    ans, distract,
    `For infinitely many solutions, the second equation must be a multiple of the first: ${2 * a1}x + ${ans}y = ${2 * c1} is exactly 2 × (${a1}x + ${b1}y = ${c1}). So k = ${ans}.`
  );
}
T.system_infinitely = () => systemParallel(false);
T.system_no_solution = () => systemParallel(true);

T.linear_model = () => {
  const m = pick([20, 25, 30, 35]);
  const t = Math.round(randInt(50, 500) / 10) * 10;
  const bill = m + t / 10;
  return mcq(
    'algebra-linear-model', 2,
    `A cell phone plan costs $${m} per month plus $0.10 per minute of use. A customer's bill for one month was $${bill % 1 === 0 ? bill : bill.toFixed(1)}. How many minutes did the customer use?`,
    t, [bill - m, bill, (bill - m) * 10 + 10, m * 10],
    `The bill is the fixed fee plus $0.10 per minute: $${bill} = $${m} + 0.10m. So 0.10m = $${(bill - m).toFixed(1)} and m = ${(bill - m) * 10} minutes.`
  );
};

T.half_life = () => {
  const S = pick([400, 480, 640, 800, 960]);
  const h = pick([2, 3, 4, 6]);
  const k = pick([2, 3, 4]);
  const t = h * k;
  const ans = S / Math.pow(2, k);
  const distract = [S / k, S / 2, S - t, S / Math.pow(2, k - 1)];
  return mcq(
    'algebra-exponential-decay', 2,
    `A radioactive substance decays so that half of it remains after ${h} hours. If a sample initially contains ${S} grams, how many grams remain after ${t} hours?`,
    ans, distract,
    `${t} hours is ${t / h} half-lives, so the amount is ${S} × (1/2)^${k} = ${S}/${Math.pow(2, k)} = ${ans} grams.`
  );
};

T.radical_solve = () => {
  let a, c, x, b;
  let guard = 0;
  do {
    a = randInt(2, 4);
    c = randInt(4, 9);
    x = randInt(4, 12);
    b = c * c - a * x;
    guard++;
  } while (b < 1 && guard < 120);
  const ans = x;
  const distract = [c * c - b, x + 1, x - 1, a * x + b];
  return mcq(
    'algebra-radical', 2,
    `If √(${a}x + ${b}) = ${c}, what is the value of x?`,
    ans, distract,
    `Square both sides: ${a}x + ${b} = ${c}² = ${c * c}. Then ${a}x = ${c * c} − ${b} = ${a * x}, so x = ${a * x} ÷ ${a} = ${ans}.`
  );
};

T.complex_multiply = () => {
  const a = randInt(2, 6);
  const b = randInt(1, 5);
  const ans = a * a + b * b;
  const distract = [a * a - b * b, a + b, a * a + b, (a + b) * (a + b)];
  return mcq(
    'algebra-complex-numbers', 3,
    `Which of the following is equivalent to (${a} + ${b}i)(${a} − ${b}i)?`,
    ans, distract,
    `This is a difference of squares: (a + bi)(a − bi) = a² − (bi)² = a² + b² because i² = −1. So ${a}² + ${b}² = ${a * a} + ${b * b} = ${ans}.`
  );
};

T.trig_sine = () => {
  const triples = [[3, 4, 5], [5, 12, 13], [6, 8, 10], [8, 15, 17], [9, 12, 15], [12, 16, 20]];
  const [s1, s2, hyp] = pick(triples);
  const opp = pick([s1, s2]);
  const adj = opp === s1 ? s2 : s1;
  return mcq(
    'geometry-trigonometry', 2,
    `In right triangle XYZ, angle Y is the right angle, XZ = ${hyp}, YZ = ${adj}, and XY = ${opp}. What is sin Z?`,
    frac(opp, hyp), [frac(adj, hyp), frac(opp, adj), frac(adj, opp), frac(hyp, opp)],
    `Angle Z is opposite side XY = ${opp}, and the hypotenuse is XZ = ${hyp}. So sin Z = opposite ÷ hypotenuse = ${opp}/${hyp} = ${frac(opp, hyp)}.`
  );
};

T.inscribed_angle = () => {
  const arc = pick([80, 100, 120, 140, 160, 200, 220]);
  const ans = arc / 2;
  return mcq(
    'geometry-inscribed-angles', 2,
    `In the circle below, points A, B, and C lie on the circle, and the measure of arc AB (the arc that does not contain C) is ${arc}°. What is the measure of inscribed angle ACB?`,
    ans, [arc, 360 - arc, arc / 4, 180 - arc / 2],
    `An inscribed angle is half the measure of its intercepted arc: angle ACB = ${arc}° ÷ 2 = ${ans}°.`
  );
};

T.similar_triangles = () => {
  const base = pick([[3, 4, 5], [6, 8, 10]]);
  const k = pick([2, 3, 4]);
  const [a, b, c] = base;
  const ans = k * a;
  return mcq(
    'geometry-similar-triangles', 2,
    `Triangles ABC and DEF are similar. The sides of triangle ABC are ${a}, ${b}, and ${c}. The longest side of triangle DEF is ${k * c}. What is the length of the shortest side of triangle DEF?`,
    ans, [k * b, k * c, k, a + b],
    `The scale factor from ABC to DEF is ${k * c} ÷ ${c} = ${k}. So the shortest side of DEF is ${k} × ${a} = ${ans}.`
  );
};

T.sphere_volume = () => {
  const r = 6;
  const ans = (4 / 3) * 3.14 * r * r * r;
  const distract = [4 * 3.14 * r * r, 3.14 * r * r * r, 3.14 * r * r, ans + 50];
  return mcq(
    'geometry-sphere-volume', 3,
    `A sphere has a radius of ${r} inches. What is its volume in cubic inches? (Use π ≈ 3.14.)`,
    ans.toFixed(2), distract.map((v) => v.toFixed(2)),
    `Volume = (4/3)πr³ = (4/3)(3.14)(${r})³ = (4/3)(3.14)(${r * r * r}) = ${ans.toFixed(2)} cubic inches.`
  );
};

T.sector_area = () => {
  const theta = pick([45, 60, 90, 120, 135, 180]);
  const r = pick([4, 6, 8, 10, 12]);
  const ans = (theta / 360) * 3.14 * r * r;
  const distract = [3.14 * r * r, (theta / 360) * r * r, ans * 2, ans / 2];
  return mcq(
    'geometry-sector-area', 3,
    `A circle of radius ${r} has a sector with a central angle of ${theta}°. What is the area of the sector? (Use π ≈ 3.14 and round to the nearest hundredth.)`,
    ans.toFixed(2), distract.map((v) => v.toFixed(2)),
    `Area of sector = (θ/360)·πr² = (${theta}/360)(3.14)(${r})² = ${ans.toFixed(2)} square units.`
  );
};

T.arc_length = () => {
  const theta = pick([45, 60, 90, 120, 180]);
  const r = pick([4, 6, 8, 10, 12]);
  const ans = (theta / 180) * 3.14 * r;
  const distract = [2 * 3.14 * r, ans * 2, ans / 2, (theta / 360) * 3.14 * r * r];
  return mcq(
    'geometry-arc-length', 3,
    `A circle has a radius of ${r} and a central angle of ${theta}°. What is the length of the arc intercepted by the angle? (Use π ≈ 3.14 and round to the nearest hundredth.)`,
    ans.toFixed(2), distract.map((v) => v.toFixed(2)),
    `Arc length = (θ/360)·2πr = (${theta}/360)(2)(3.14)(${r}) = ${ans.toFixed(2)} units.`
  );
};

T.density = () => {
  const s = pick([2, 3, 4]);
  const k = pick([2, 3, 4, 5]);
  const m = k * s * s * s;
  return mcq(
    'data-density', 1,
    `A cube with a side length of ${s} cm has a mass of ${m} grams. What is the density of the material in grams per cubic centimeter?`,
    k, [m / s, m / (s * s), s * s * s, m],
    `Density = mass ÷ volume = ${m} ÷ (${s} × ${s} × ${s}) = ${m} ÷ ${s * s * s} = ${k} g/cm³.`
  );
};

T.work_rate = () => {
  const pairs = [[3, 6], [6, 12], [4, 12], [2, 6], [4, 4], [6, 6], [10, 10], [8, 8]];
  const [a, b] = pick(pairs);
  const ans = (a * b) / (a + b);
  return mcq(
    'problem-solving-work-rate', 3,
    `Pipe A can fill a tank in ${a} hours. Pipe B can fill the same tank in ${b} hours. If both pipes are opened at the same time, how many hours will it take to fill the tank?`,
    ans, [a + b, (a + b) / 2, a * b, Math.abs(a - b)],
    `Pipe A fills 1/${a} of the tank per hour and pipe B fills 1/${b} per hour. Together they fill 1/${a} + 1/${b} = ${(a + b) / (a * b)} per hour, so the time is ${(a * b) / (a + b)} hours.`
  );
};

T.mixture = () => {
  return mcq(
    'problem-solving-mixture', 3,
    `A chemist has 10 liters of a 20% saline solution. How many liters of a 50% saline solution must be added to obtain a 30% saline solution?`,
    5, [4, 6, 10, 2],
    `Let x be the liters added. Salt in the mixture: 0.2(10) + 0.5x = 0.3(x + 10). So 2 + 0.5x = 0.3x + 3, giving 0.2x = 1 and x = 5 liters.`
  );
};

T.overlap_sets = () => {
  let total, A, B, both, ans;
  let guard = 0;
  do {
    total = pick([50, 60, 80, 100]);
    A = pick([30, 35, 40, 45]);
    B = pick([20, 25, 28, 32]);
    both = pick([10, 12, 15]);
    ans = total - A - B + both;
    guard++;
  } while (ans < 0 && guard < 80);
  return mcq(
    'data-overlapping-sets', 2,
    `In a survey of ${total} students, ${A} play soccer, ${B} play tennis, and ${both} play both sports. How many students play NEITHER sport?`,
    ans, [A + B - both, total - A - B, both, Math.abs(A - B)],
    `Students who play at least one sport = ${A} + ${B} − ${both} = ${A + B - both}. So neither = ${total} − ${A + B - both} = ${ans}.`
  );
};

T.linear_table = () => {
  const m = pick([2, 3, 4, 5]);
  const b = randInt(1, 10);
  const x = pick([-1, 4, 5]);
  const y0 = b, y1 = m + b, y2 = 2 * m + b;
  const ans = m * x + b;
  return mcq(
    'data-linear-table', 2,
    `The table above shows some values of the linear function f:\n\nx:   0    1    2\nf(x): ${y0}   ${y1}   ${y2}\n\nWhat is the value of f(${x})?`,
    ans, [m * x, ans + 1, b, m * x - b],
    `The slope is (${y1} − ${y0}) ÷ (1 − 0) = ${m} and f(0) = ${b}. So f(x) = ${m}x + ${b}, and f(${x}) = ${m}(${x}) + ${b} = ${ans}.`
  );
};

T.percent_undecided = () => {
  const total = pick([200, 300, 400]);
  const p1 = pick([25, 30, 35]);
  const p2 = pick([20, 25, 30, 40]);
  const pct = 100 - p1 - p2;
  const ans = (total * pct) / 100;
  return mcq(
    'data-percent-total', 1,
    `In a survey of ${total} voters, ${p1}% supported candidate A and ${p2}% supported candidate B. The rest were undecided. How many voters were undecided?`,
    ans, [(total * p1) / 100, (total * p2) / 100, total / 2, total],
    `${p1}% + ${p2}% = ${p1 + p2}%, so ${pct}% were undecided: ${pct}% of ${total} = ${total} × ${pct}/100 = ${ans} voters.`
  );
};

T.grid_fraction = () => {
  const variants = [
    { b: 1, c: 3, p: 2, q: 5 },  // x = 1/5
    { b: 1, c: 3, p: 4, q: 5 },  // x = 7/5
    { b: 2, c: 4, p: 5, q: 8 },  // x = 1/2
    { b: 1, c: 5, p: 3, q: 8 },  // x = 7/8
    { b: 3, c: 6, p: 5, q: 8 },  // x = 3/4
    { b: 2, c: 5, p: 7, q: 10 }, // x = 3/2
  ];
  const v = pick(variants);
  const ans = frac(v.c * v.p - v.b * v.q, v.q);
  return grid(
    'grid-algebra', 3,
    `If (x + ${v.b})/${v.c} = ${v.p}/${v.q}, what is the value of x?`,
    ans,
    `Multiply both sides by ${v.c}: x + ${v.b} = ${v.c}·${v.p}/${v.q} = ${v.c * v.p}/${v.q}. So x = ${v.c * v.p}/${v.q} − ${v.b} = ${v.c * v.p - v.b * v.q}/${v.q} = ${ans}.`
  );
};

T.grid_system = () => {
  const x = randInt(4, 10);
  const y = randInt(3, x - 1);
  const S = x + y;
  const D = x - y;
  return grid(
    'grid-system', 3,
    `If x + y = ${S} and x − y = ${D}, what is the value of x?`,
    x,
    `Add the two equations: (x + y) + (x − y) = ${S} + ${D} = ${S + D}, so 2x = ${S + D} and x = ${S + D} ÷ 2 = ${x}.`
  );
};

T.slope_intercept = () => {
  const m = pick([-3, -2, -1, 2, 3]);
  const b = randInt(4, 12);
  const x0 = randInt(2, 6);
  const y0 = m * x0 + b;
  return mcq(
    'algebra-slope-intercept', 2,
    `A line has a slope of ${m} and passes through the point (${x0}, ${y0}). What is the y-intercept of the line?`,
    b, [y0 - m, x0, y0, m * x0],
    `Using y = mx + b: ${y0} = ${m}(${x0}) + b, so b = ${y0} − (${m * x0}) = ${b}. The y-intercept is ${b}.`
  );
};

T.mean_remove = () => {
  const mu = randInt(12, 20);
  const nu = randInt(9, mu - 1);
  const ans = 5 * mu - 4 * nu;
  return mcq(
    'data-mean-remove', 2,
    `The average (arithmetic mean) of five numbers is ${mu}. When the largest number is removed, the average of the remaining four numbers is ${nu}. What is the value of the number that was removed?`,
    ans, [mu + nu, 5 * mu - nu, 4 * nu - mu, mu * nu],
    `Total of the five numbers = ${5 * mu}. Total of the remaining four = ${4 * nu}. The removed number = ${5 * mu} − ${4 * nu} = ${ans}.`
  );
};

T.ratio_boys_girls = () => {
  const pairs = [[5, 3], [7, 4], [4, 3], [8, 5]];
  const [bg, gg] = pick(pairs);
  const k = pick([5, 8, 12]);
  const diff = (bg - gg) * k;
  const ans = (bg + gg) * k;
  return mcq(
    'problem-solving-ratio-difference', 2,
    `At a school, the ratio of boys to girls is ${bg}:${gg}. If there are ${diff} more boys than girls, how many students are at the school?`,
    ans, [bg * k, gg * k, diff, bg + gg],
    `Let the number of boys be ${bg}k and the number of girls be ${gg}k. Then ${bg}k − ${gg}k = ${diff}, so ${bg - gg}k = ${diff} and k = ${k}. Total students = (${bg} + ${gg})k = ${ans}.`
  );
};

T.exp_function_table = () => {
  const r = pick([2, 3]);
  const a = pick([2, 3, 4, 5]);
  const ans = a * Math.pow(r, 3);
  return mcq(
    'algebra-exponential-table', 3,
    `The table above shows some values of the exponential function f:\n\nx:   0     1      2\nf(x): ${a}   ${a * r}   ${a * r * r}\n\nWhat is the value of f(3)?`,
    ans, [a * r * r + a, a * r * 3, a * r * r, a * Math.pow(r, 4)],
    `An exponential function grows by a constant factor: f(1) ÷ f(0) = ${a * r} ÷ ${a} = ${r}. So f(3) = f(2) × ${r} = ${a * r * r} × ${r} = ${ans}.`
  );
};

// ── HARDER TIER 2: rational eqs, circles, weighted data, trig, interest ────

// Quadratic with a leading coefficient ≠ 1 — sum of solutions via Vieta.
T.quad_leading = () => {
  // entries: [a, b, c, bigRoot, smallRoot, sum] for a·x² − b·x + c = 0
  const table = [
    [2, 7, 3, 3, '1/2', '7/2'],
    [3, 10, 3, 3, '1/3', '10/3'],
    [2, 9, 4, 4, '1/2', '9/2'],
    [3, 14, 8, 4, '2/3', '14/3'],
    [2, 11, 5, 5, '1/2', '11/2'],
    [3, 11, 6, 3, '2/3', '11/3'],
  ];
  const [a, b, c, big, small, sum] = pick(table);
  return mcq(
    'algebra-quadratic-sum-roots', 3,
    `What is the sum of the solutions of the equation ${a}x² − ${b}x + ${c} = 0?`,
    sum, [String(big), small, String(b), String(c)],
    `The solutions of the equation are x = ${big} and x = ${small}, so their sum is ${big} + ${small} = ${sum}. (By Vieta's formulas, the sum of the roots of ax² + bx + c = 0 is −b/a = ${b}/${a}.)`
  );
};

// Reverse percent — find the original price before a discount.
T.reverse_percent = () => {
  const orig = pick([20, 40, 60, 80, 100]);
  const pct = pick([10, 20, 25]);
  const sale = orig * (1 - pct / 100);
  const distract = [
    sale,                                        // the discounted price itself
    Math.round(sale * (1 - pct / 100)),           // wrongly discounting again
    orig - pct,                                  // subtracting the percent as a number
    Math.round(sale + pct),
  ];
  return mcq(
    'problem-solving-percent', 2,
    `After a ${pct}% discount, a jacket costs $${sale % 1 === 0 ? sale : sale.toFixed(2)}. What was the original price of the jacket?`,
    orig, distract,
    `The sale price is ${100 - pct}% of the original, so original × ${(100 - pct) / 100} = $${sale}. Original = $${sale} ÷ ${(100 - pct) / 100} = $${orig}.`
  );
};

// Rational equation with the variable in the denominator.
T.rational_equation = () => {
  const c = pick([2, 3, 4, 6]);
  const k = pick([2, 3, 4]);
  const a = c * k;      // numerator divisible by c so x is an integer
  const b = pick([1, 2, 3, 4, 5]);
  const x = b + k;
  return mcq(
    'algebra-rational-equation', 3,
    `If ${a}/(x − ${b}) = ${c}, what is the value of x?`,
    x, [k, b, a / c - b, x + 1],
    `Multiply both sides by (x − ${b}): ${a} = ${c}(x − ${b}). Divide by ${c}: ${k} = x − ${b}. So x = ${b} + ${k} = ${x}. (Note x cannot equal ${b}, or the fraction would have no value.)`
  );
};

// Radical equation that produces an extraneous root — the SAT classic.
T.radical_extraneous = () => {
  // variants: [a, b, r1 (extraneous), r2 (valid)] for √(x + a) = x − b
  const table = [
    [3, 3, 1, 6],
    [2, 4, 2, 7],
    [4, 2, 0, 5],
    [0, 2, 1, 4],
  ];
  const [a, b, r1, r2] = pick(table);
  return mcq(
    'algebra-radical', 3,
    `What is the solution to the equation √(x ${a >= 0 ? '+ ' + a : '− ' + Math.abs(a)}) = x − ${b}?`,
    r2, [r1, b, r1 + r2, Math.abs(a - b)],
    `Squaring both sides gives x ${a >= 0 ? '+ ' + a : '− ' + Math.abs(a)} = (x − ${b})², which yields x = ${r1} or x = ${r2}. Substituting x = ${r1} makes the right side negative (${r1} − ${b} < 0), so ${r1} is extraneous. The only valid solution is x = ${r2}.`
  );
};

// 30-60-90 triangle ratios — conceptual, integer-friendly.
T.trig_30_60 = () => {
  const s = pick([3, 4, 5, 6]);
  const short = s, hyp = 2 * s, longLeg = `${s}√3`;
  const distract = ['2√3', String(hyp), String(s), String(s * 3)];
  return mcq(
    'geometry-trigonometry', 2,
    `In a 30°-60°-90° triangle, the side opposite the 30° angle has length ${s}. What is the length of the side opposite the 60° angle?`,
    longLeg, distract,
    `In a 30-60-90 triangle the sides are in the ratio 1 : √3 : 2. With the short leg ${s}, the longer leg is ${s} × √3 = ${longLeg} and the hypotenuse is ${hyp}.`
  );
};

// Circle in general form → radius by completing the square.
function circleGeneral() {
  const h = pick([-4, -3, -2, 2, 3, 4]);
  const k = pick([-3, -2, 2, 3, 4]);
  const r = pick([3, 4, 5, 6]);
  const coefX = -2 * h, coefY = -2 * k;
  const constTerm = h * h + k * k - r * r;
  const sx = (v) => (v >= 0 ? `+ ${v}` : `− ${Math.abs(v)}`);
  return mcq(
    'geometry-circle', 3,
    `The equation of a circle is x² + y² ${sx(coefX)}x ${sx(coefY)}y ${sx(constTerm)} = 0. What is the radius of the circle?`,
    r, [Math.abs(h), Math.abs(k), Math.abs(h) + Math.abs(k), r + 1],
    `Complete the square: (x ${sx(-h).replace('+ ', '+ ')} )² + (y ${sx(-k)})² = ${r}². The right side is r², so r = ${r}.`
  );
}
T.circle_general = () => circleGeneral();

// Weighted average — two groups with different sizes.
T.weighted_mean = () => {
  let n1, n2, a1, ans;
  let guard = 0;
  do {
    n1 = pick([10, 12, 15, 20]);
    n2 = pick([5, 8, 10]);
    a1 = pick([70, 75, 80, 85]);
    const a2 = a1 + 10;
    ans = (n1 * a1 + n2 * a2) / (n1 + n2);
    guard++;
  } while (!Number.isInteger(ans) && guard < 60);
  return mcq(
    'problem-solving-average', 2,
    `In a class, ${n1} students averaged ${a1} on a test, and ${n2} students averaged ${a1 + 10} on the same test. What is the average score of the entire class?`,
    ans, [(a1 + a1 + 10) / 2, a1, a1 + 10, ans + 2],
    `Total points = ${n1} × ${a1} + ${n2} × ${a1 + 10} = ${n1 * a1} + ${n2 * (a1 + 10)} = ${n1 * a1 + n2 * (a1 + 10)}. Class size = ${n1 + n2}. Average = ${n1 * a1 + n2 * (a1 + 10)} ÷ ${n1 + n2} = ${ans}.`
  );
};

// Compound interest over two years.
T.compound_interest = () => {
  const P = pick([100, 200, 400, 500]);
  const r = pick([10, 20]);
  const ans = P * Math.pow(1 + r / 100, 2);
  const distract = [
    P * (1 + r / 100),                    // only one year
    P + 2 * r,                            // adding percentage points
    P * (1 + (2 * r) / 100),              // simple interest over 2 years
    Math.round(ans / 2),
  ];
  return mcq(
    'algebra-exponential-growth', 2,
    `An amount of $${P} is invested at an annual interest rate of ${r}%, compounded annually. What is the total amount after 2 years?`,
    ans, distract,
    `After year 1: $${P} × ${1 + r / 100} = $${P * (1 + r / 100)}. After year 2: $${P * (1 + r / 100)} × ${1 + r / 100} = $${ans}.`
  );
};

// Perpendicular slope is the negative reciprocal.
T.perpendicular_slope = () => {
  const table = [
    ['2/3', '-3/2'], ['3/4', '-4/3'], ['4/3', '-3/4'], ['2/5', '-5/2'], ['5/3', '-3/5'], ['1/2', '-2'],
  ];
  const [m, ans] = pick(table);
  return mcq(
    'algebra-perpendicular-slope', 2,
    `Line l has a slope of ${m}. Line m is perpendicular to line l. What is the slope of line m?`,
    ans, [m, ans.replace('-', ''), m === '1/2' ? '2' : '-1', '0'],
    `Perpendicular lines have slopes that are negative reciprocals. The negative reciprocal of ${m} is ${ans}.`
  );
};

// Similar figures: area scales by the square of the side ratio.
T.similar_area = () => {
  const k = pick([2, 3]);
  const area1 = pick([10, 12, 15, 18, 20]);
  const ans = area1 * k * k;
  const distract = [area1 * k, area1 + k * k, area1 * 2, ans + k];
  return mcq(
    'geometry-similar-triangles', 3,
    `Triangle DEF is similar to triangle ABC, and each side of DEF is ${k} times as long as the corresponding side of ABC. If the area of triangle ABC is ${area1}, what is the area of triangle DEF?`,
    ans, distract,
    `For similar figures, the area ratio equals the square of the side ratio. So area(DEF) = ${area1} × ${k}² = ${area1} × ${k * k} = ${ans}.`
  );
};

// GRID-IN: given one root, find the other.
T.grid_quad_root = () => {
  const r1 = 3;
  const r2 = pick([2, 4, 5, 6, 7]);
  const b = r1 + r2, c = r1 * r2;
  return grid(
    'grid-algebra', 3,
    `If x = ${r1} is one solution of the equation x² − ${b}x + ${c} = 0, what is the other solution?`,
    r2,
    `The equation factors as (x − ${r1})(x − ${r2}) = 0, so the other solution is x = ${r2}. (Sum of roots = ${b} = ${r1} + ${r2}.)`
  );
};

// ── helpers ────────────────────────────────────────────────────────────────
function grid(topic, difficulty, prompt, answer, explanation) {
  return {
    id: hashId('grid' + topic + prompt + String(answer)),
    section: 'math',
    topic,
    difficulty,
    prompt,
    type: 'grid',
    choices: [],
    correctIndex: -1,
    answer: String(answer),
    explanation,
  };
}

function mcq(topic, difficulty, prompt, correctValue, distractors, explanation) {
  const correct = String(correctValue);
  const wrong = distractors.map(String);
  // keep choices unique — a choice must never equal the answer or another choice
  const unique = [...new Set([correct, ...wrong])];
  let guard = 0;
  while (unique.length < 4 && guard++ < 200) {
    // pad with numeric neighbors of the answer so a padded choice always looks plausible
    const n = Number(correct);
    if (Number.isFinite(n)) {
      const cands = [String(n + guard), String(n - guard), String(n + guard + 1)];
      const pad = cands.find((c) => !unique.includes(c));
      if (pad !== undefined) unique.push(pad);
    } else {
      const pad = `${correct} ${guard + 1}`;
      if (!unique.includes(pad)) unique.push(pad);
    }
  }
  const pool = shuffle(unique.slice(0, 4));
  const correctIndex = pool.indexOf(correct);
  return {
    id: hashId(topic + prompt + correct),
    section: 'math',
    topic,
    difficulty,
    prompt,
    choices: pool,
    correctIndex,
    explanation,
  };
}

module.exports = function mathQuestion() {
  const keys = Object.keys(T);
  return T[pick(keys)]();
};
