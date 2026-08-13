'use strict';

// ─── AI Tutor ───────────────────────────────────────────────────────────────
// Uses a free-tier LLM (Google Gemini) when a key is available, either the
// user's own key saved in Settings, or a GEMINI_API_KEY env var. Falls back to
// Groq if configured, then to the built-in rule-based tutor so the app always
// answers with zero cost.

const { getConfig } = require('./config');

// Env-var fallbacks (admin-editable keys in the DB take priority via getConfig)
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
// If the primary model is retired by Google, retry the request against these
// (Gemini rotates model names; a stale name returns a 404 and the fallback
// keeps the tutor working without an admin touching anything).
const GEMINI_FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
const GROQ_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = 'You are "SAT Sage", a friendly expert tutor inside SAT Arena, a gamified SAT prep app. ' +
  'Help students master the SAT: explain concepts clearly, give strategies, walk through problems step by step, ' +
  'and motivate them. Keep answers concise (under 180 words), encouraging, and structured with short bullets when helpful. ' +
  'You know the current digital SAT format: Reading & Writing (2 modules of 32 min each, 54 questions total) and ' +
  'Math (2 modules of 35 min each, 54 questions total, with a built-in Desmos graphing calculator). Math has no ' +
  'calculator-free section anymore. You are precise about rules and always admit uncertainty when appropriate.';

async function callGemini(messages, key, model) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + key;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { temperature: 0.6, maxOutputTokens: 500 },
    }),
  });
  if (!res.ok) throw new Error('Gemini error ' + res.status);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

async function callGroq(messages, key, model) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model: model || GROQ_MODEL,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      temperature: 0.6,
      max_tokens: 500,
    }),
  });
  if (!res.ok) throw new Error('Groq error ' + res.status);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

// ── Built-in fallback tutor ────────────────────────────────────────────────
// A rule-based SAT tutor that answers the question actually asked - no API key
// needed. Specific topics return a real explanation with a worked example;
// broader topics return targeted strategy; then a general help fallback.

const BUILTIN_ANSWERS = [
  // ── Math: formulas with worked examples ─────────────────────────────────
  [/(quadratic|discriminant)/, [
    'The **quadratic formula** solves ax² + bx + c = 0:',
    '**x = (−b ± √(b² − 4ac)) / 2a**',
    'Example: 2x² + 4x − 6 = 0 → a = 2, b = 4, c = −6.',
    'x = (−4 ± √(16 − 4·2·(−6))) / 4 = (−4 ± √64) / 4 = (−4 ± 8) / 4 → **x = 1 or x = −3**.',
    'The **discriminant** (b² − 4ac) tells you how many solutions: positive → two, zero → one, negative → none.',
    'Quick win: on the digital SAT you can graph it in Desmos and read the x-intercepts.',
  ].join('\n')],
  [/(slope|parallel line|perpendicular line|gradient|steepness)/, [
    '**Slope** = rise over run: **m = (y₂ − y₁) / (x₂ − x₁)**.',
    'Example: line through (1, 2) and (3, 6) → m = (6 − 2) / (3 − 1) = 4 / 2 = **2**.',
    'In slope-intercept form **y = mx + b**, m is the slope and b the y-intercept.',
    '**Parallel** lines share the same slope; **perpendicular** slopes are negative reciprocals (2 → −½).',
    'Watch the traps: a horizontal line has slope 0, a vertical line has **undefined** slope (never 0), and slope is y-difference over x-difference, not the reverse.',
  ].join('\n')],
  [/(circle|radius|circumference|diameter)/, [
    'Circle facts the SAT reuses constantly:',
    '• **Area** = πr², **circumference** = 2πr (or πd).',
    '• **Equation of a circle** centered at (h, k): **(x − h)² + (y − k)² = r²**.',
    '• A radius drawn to a tangent line meets it at a right angle; a radius that bisects a chord is perpendicular to it.',
    'Example: (x − 3)² + (y + 2)² = 25 → center (3, −2), radius √25 = **5**.',
  ].join('\n')],
  [/(pythagor|right triangle|hypotenuse|triangle)/, [
    '**Pythagorean theorem**: a² + b² = c² (c = hypotenuse, the side opposite the right angle).',
    'Memorize the common triples: **3-4-5**, **5-12-13**, and multiples (6-8-10).',
    'Example: legs 9 and 12 → c² = 81 + 144 = 225 → c = **15**.',
    'SAT trap: the hypotenuse is always the *longest* side and the only side alone on the right side of the equation.',
    'Special right triangles: 45-45-90 has sides x, x, x√2; 30-60-90 has sides x, x√3, 2x.',
  ].join('\n')],
  [/(distance between|distance formula)/, [
    '**Distance** between (x₁, y₁) and (x₂, y₂): **√((x₂ − x₁)² + (y₂ − y₁)²)**.',
    'It is just the Pythagorean theorem in disguise: run = Δx, rise = Δy, distance = hypotenuse.',
    'Example: (1, 2) to (4, 6) → √(3² + 4²) = √25 = **5**.',
    'Related: the **midpoint** is the average of the coordinates: ((x₁ + x₂)/2, (y₁ + y₂)/2).',
  ].join('\n')],
  [/(percent|percentage|discount|markup|increase by|decrease by)/, [
    'Percent playbook for the SAT:',
    '• **Percent change** = (new − old) / old × 100. Example: 80 → 100 is (20/80) × 100 = **+25%**.',
    '• "What percent of A is B?" → B / A × 100.',
    '• A 20% discount means you pay **80%** of the price (multiply by 0.8), not subtract 20 from the number.',
    '• Consecutive percent changes are not additive: +10% then +10% is +21%, not +20%.',
    'When stuck, plug in a round number — the correct answer is often the only choice that matches.',
  ].join('\n')],
  [/(ratio|proportion)/, [
    'Ratios on the SAT are about **parts**, not totals:',
    '• A ratio a : b means a parts of one thing for every b parts of another.',
    '• If the ratio of boys to girls is 3 : 5 and the class has 40 students, boys = 3/(3+5) × 40 = **15**.',
    '• Set up a **proportion** with matching units on top and bottom, then cross-multiply.',
    'Watch the trap: "ratio of x to y is 3:5" means x/y = 3/5, so y is the bigger number.',
  ].join('\n')],
  [/(probab|odds|chance|likely)/, [
    '**Probability** = favorable outcomes / total outcomes.',
    'Example: rolling two dice and getting a sum of 7 → 6 favorable / 36 total = **1/6**.',
    '• For **independent** events, multiply probabilities: heads twice = ½ × ½ = ¼.',
    '• For **"at least one"** questions, use the complement: 1 − P(none). At least one head in 3 flips = 1 − (½)³ = **7/8**.',
    '• For "either A or B", add when the events are mutually exclusive.',
  ].join('\n')],
  [/(exponent|power rule|scientific notation|negative exponent)/, [
    'Exponent rules worth memorizing:',
    '• Multiply → **add** exponents: x² · x³ = x⁵',
    '• Divide → **subtract**: x⁵ / x² = x³',
    '• Power of a power → **multiply**: (x²)³ = x⁶',
    '• Negative exponent → **reciprocal**: x⁻² = 1/x²',
    '• Anything to the 0 power = 1 (x⁰ = 1, as long as x ≠ 0).',
    'Example: (2x³)² = 4x⁶. On the digital SAT, Desmos handles the arithmetic — you just need to know *which* rule applies.',
  ].join('\n')],
  [/(system of|simultaneous|elimination|substitution|how many solutions)/, [
    'Systems of linear equations: solve with **elimination** or **substitution**.',
    'Elimination example: 2x + y = 7 and x − y = 2. Add them: 3x = 9 → x = 3, then y = 1.',
    'For "how many solutions" questions, compare the slopes:',
    '• Same slope, same intercept → **infinite** solutions (same line).',
    '• Same slope, different intercept → **no** solutions (parallel lines).',
    '• Different slopes → **one** solution.',
    'The digital SAT often sneaks a system into a word problem, so write the two equations first, then solve.',
  ].join('\n')],
  [/(sequence|arithmetic|geometric|recursive|nth term)/, [
    'Sequences on the digital SAT:',
    '• **Arithmetic** (add/subtract a constant d): aₙ = a₁ + (n − 1)d.',
    '• **Geometric** (multiply by a constant r): aₙ = a₁ · r^(n−1).',
    'Example (arithmetic): 3, 7, 11, 15… → d = 4, so the 10th term = 3 + 9·4 = **39**.',
    'Example (geometric): 2, 6, 18… → r = 3, so the 5th term = 2 · 3⁴ = **162**.',
    'The SAT often gives a **recursive** definition (each term = previous + k); just compute the terms in order — there are usually only a few.',
  ].join('\n')],
  [/(function|domain|range|composition|f\(g|inverse)/, [
    'Function basics for the SAT:',
    '• **f(x)** just means "plug x into the rule f". If f(x) = 3x − 2, then f(4) = 12 − 2 = **10**.',
    '• **Composition** f(g(x)): work inside-out. If g(x) = x + 1 and f(x) = x², then f(g(2)) = f(3) = **9**.',
    '• **Domain** = allowed inputs (watch for division by zero and square roots of negatives).',
    '• **Range** = possible outputs.',
    'On the digital SAT, most function questions are really about careful substitution — write every step down.',
  ].join('\n')],
  [/(inequalit|greater than|less than|at least|no more than)/, [
    'Inequality tips:',
    '• **Flip the sign** when you multiply or divide both sides by a negative number.',
    '• "At least 5" → ≥ 5; "no more than 5" → ≤ 5; "more than 5" → > 5.',
    '• On the number line, a closed dot (≤, ≥) includes the point; an open dot (<, >) does not.',
    '• In word problems, define the variable first, write the inequality, then test a round number to sanity-check.',
  ].join('\n')],

  [/(math|algebra|geometry|equation|formula|number|calculate)/, [
    'Here are my top SAT math strategies:',
    '• **Plug in numbers**: for abstract algebra, pick a number and test it.',
    '• **Know your formulas** — slope, quadratic formula, circle area, Pythagorean theorem. Ask and I will walk through any of them.',
    '• **Watch units**: the SAT loves unit-conversion traps (hours vs minutes, dollars vs cents).',
    '• **Backsolve**: plug answer choices into the question when you are stuck.',
    '• The Math section is 2 modules of 35 min each with a built-in Desmos graphing calculator.',
  ].join('\n')],

  // ── Grammar ─────────────────────────────────────────────────────────────
  [/(subject.verb|subject verb|agreement)/, [
    "**Subject-verb agreement** is the SAT's favorite grammar rule:",
    '• Singular subject → singular verb: "Each of the runners **is** ready" (the subject is "Each", not "runners").',
    '• Plural subject → plural verb: "The runners **are** ready".',
    '• Ignore anything between the subject and the verb — prepositional phrases, "along with…", "as well as…" do NOT change the subject.',
    '• Watch "every", "each", "either", "neither", "none" (singular); "both", "several", "many" (plural).',
  ].join('\n')],
  [/(comma splice|run.on|fused sentence|comma.*join|two independent)/, [
    'A **comma splice** joins two complete sentences with only a comma — always wrong on the SAT.',
    'Fix it one of three ways:',
    '• Period: "I studied hard. I passed."',
    '• Semicolon: "I studied hard; I passed."',
    '• Comma + conjunction: "I studied hard, and I passed."',
    'Quick test: if each side of the comma could stand alone as a sentence, you need one of the three fixes above.',
  ].join('\n')],
  [/(semicolon|colon)/, [
    '**Semicolons** join two complete sentences: "I love math; I hate geometry" — both sides must be full sentences.',
    '**Colons** introduce a list, quote, or explanation: "I packed three things: books, pens, and snacks."',
    'Trap: a colon after a fragment is wrong — what comes before the colon must be a complete sentence.',
    'Also: a semicolon is never followed by a lowercase list item (that is a colon\'s job).',
  ].join('\n')],
  [/(pronoun|antecedent|its vs|who vs whom)/, [
    'Pronoun rules the SAT tests:',
    '• A pronoun must **match its antecedent** in number: "Every student must bring **his or her** calculator" (each student = singular).',
    '• "It\'s" = it is; "its" = possessive. "Who" = subject (who is coming?); "whom" = object (to whom?).',
    '• A pronoun needs a clear antecedent — if it is ambiguous, the sentence is wrong.',
    '• In a compound subject, use the subject form: "My friend and **I** went" (not "me").',
  ].join('\n')],
  [/(parallel|items in a list|list.*form)/, [
    '**Parallelism**: items in a list must match grammatical form.',
    'Correct: "She likes **running**, **swimming**, and **reading**."',
    'Wrong: "She likes **running**, **swimming**, and **to read**."',
    'The SAT loves hiding this in a list of three: find the form of the first two items and match the third.',
    'It also applies to paired constructions: "not only X but also Y" — X and Y must match.',
  ].join('\n')],
  [/(dangling|modifier|misplaced)/, [
    '**Modifier** rule: an opening phrase must clearly describe the noun right after the comma.',
    'Wrong: "Running to the bus, my backpack fell off." (The backpack isn\'t running.)',
    'Right: "Running to the bus, I dropped my backpack."',
    'On the SAT, the "right" answer almost always puts the correct subject immediately after the comma.',
  ].join('\n')],
  [/(apostroph|possessive|plural)/, [
    "Apostrophe quick guide:",
    '• **Singular possessive**: add \'s — "the student\'s book" (one student).',
    '• **Plural possessive**: add s\' — "the students\' books" (many students).',
    '• **Its** = possessive, no apostrophe; **it\'s** = "it is".',
    '• Never use an apostrophe for a plain plural: "Saturdays" not "Saturday\'s".',
    'Trap: "the Joneses\' house" (plural family), not "the Jones\' house".',
  ].join('\n')],
  [/(verb tense|past tense|present perfect|tense shift)/, [
    'Tense on the SAT is about **consistency**, not fancy forms:',
    '• Don\'t shift tense without a reason: "She **studied** all night and **passed**" (not "passes").',
    '• Time markers give it away: "yesterday" → past; "since 2020" → present perfect (has/have + past participle).',
    '• In hypothetical "if" statements, use "were": "If I **were** you" (subjunctive).',
    '• Read the sentence aloud — the SAT rarely tests tense shifts that sound fine to a native ear.',
  ].join('\n')],
  [/(grammar|punctuation|sentence structure|writing rules)/, [
    'Top grammar rules the SAT repeats:',
    '• **Subject-verb agreement**: "Each of the runners **is** ready" (the subject is "Each").',
    '• **Comma splices** are always wrong — join two sentences with a period, semicolon, or comma + conjunction.',
    '• **Parallelism**: items in a list must match form ("running, swimming, and reading").',
    '• **Pronouns** match their antecedent; **modifiers** attach to the noun right after the comma.',
    'Ask me about any of these and I will explain the rule with examples.',
  ].join('\n')],
  [/(transition|however|moreover|therefore|contrast|addition)/, [
    'Transition words work by **relationship**:',
    '• **Addition**: moreover, furthermore, in addition.',
    '• **Contrast**: however, nevertheless, on the other hand.',
    '• **Result**: therefore, consequently, as a result.',
    '• **Example**: for instance, for example, specifically.',
    'Ask: "does this sentence add an idea, flip it, or follow from it?" That tells you the word. A comma usually follows "however" and "therefore" when they start a sentence.',
  ].join('\n')],

  // ── Reading & Writing ───────────────────────────────────────────────────
  [/(vocab.*context|word.*mean|definition|vocabulary)/, [
    '**Words in context** strategy:',
    '• Cover the answer choices and read the sentence with a blank — decide what the word should *mean* in your own words.',
    '• The SAT tests the word\'s **meaning in context**, often a secondary meaning you wouldn\'t expect.',
    '• Plug each choice back in and pick the one that fits the sentence\'s tone and logic — not the most familiar definition.',
    '• Build vocab by reading, not memorizing lists; roots help (bene- = good, mal- = bad, spec- = look, dict- = say).',
  ].join('\n')],
  [/(main idea|central idea|purpose|theme)/, [
    '**Main idea** questions:',
    '• The answer is broad enough to cover the whole passage but not so broad it would fit any passage.',
    '• Read the first and last sentences of each paragraph; the thesis usually lives in the intro and conclusion.',
    '• Eliminate answers that are too specific (a detail) or too general (a topic, not a claim).',
    '• The correct answer is almost always the most boring, accurate summary.',
  ].join('\n')],
  [/(evidence|support|cite|which line)/, [
    '**Command of evidence** pairs:',
    '• The evidence choice must *directly* support the claim — not just mention the same topic.',
    '• Find the claim first, then look for the line that contains a concrete fact, number, or example tied to it.',
    '• For data questions, read the actual numbers on the chart — don\'t eyeball the trend.',
    '• If two choices sound close, pick the one whose detail most precisely matches the claim\'s wording.',
  ].join('\n')],
  [/(data|chart|graph|table|figure|graphical)/, [
    'Reading graphs and charts on the SAT:',
    '• Read the **axes labels and units** before anything else — the trap is usually a unit mismatch (percent vs fraction, thousands vs millions).',
    '• Compare actual values, not visual heights; two bars can look equal but differ on the scale.',
    '• "Based on the data" answers must be supported by the numbers, not common sense.',
    '• For "which conclusion is best supported" — the right answer is the narrowest claim the data actually proves.',
  ].join('\n')],
  [/(reading|passage|comprehension|writing|literature|science passage)/, [
    'Reading section strategy:',
    '• Read the **question stem** before the passage for paired questions (command of evidence) so you know what to hunt for.',
    '• Annotate lightly: underline the main idea of each paragraph.',
    '• Answer choices: eliminate the two obviously wrong, then pick the one *fully* supported by the text.',
    '• Pace: about 13 minutes per passage on the digital SAT. If a passage is brutal, skip it and come back.',
  ].join('\n')],

  // ── Strategy, pacing, planning ──────────────────────────────────────────
  [/(pace|timing|time management|how long|minutes|seconds)/, [
    'Pacing for the digital SAT:',
    '• Reading & Writing: **2 modules of 32 min**, 54 questions total ≈ **71 seconds per question**.',
    '• Math: **2 modules of 35 min**, 54 questions total ≈ **78 seconds per question**, with Desmos built in.',
    '• Don\'t get stuck: if you are past 60-90 seconds, guess, flag, and move on — the next question is worth the same.',
    '• Save the last 2 minutes of each module to double-check flagged questions.',
    '• The clock is per-module; once you submit Module 1, you can\'t go back.',
  ].join('\n')],
  [/(study plan|two.week|2.week|schedule|how do i prepare|preparation|plan)/, [
    'A solid 2-week plan (roughly 60-90 min a day):',
    '• **Week 1**: take one full practice test to find your baseline, then drill your 2-3 weakest topics (30 min math + 30 min reading daily).',
    '• **Week 2**: alternate full timed sections (one R&W module + one Math module), then review **every** wrong answer and write down the rule or formula you missed.',
    '• Days 12-14: one full timed test every other day, review on the off days. Get sleep — it beats last-minute cramming.',
    '• Track your accuracy per topic on your dashboard and let the weak spots guide what you drill.',
  ].join('\n')],
  [/(guess|eliminat|process of elimination|strategy|tips|tricks)/, [
    'Answer-choice strategy that always helps:',
    '• **Process of elimination**: wrong answers are usually too big/too small, flip a sign, or use the wrong unit.',
    '• For math, plug answer choices back into the question when stuck — the SAT rewards backsolving.',
    '• For reading, eliminate the two clearly wrong answers first; the last two are decided by "fully supported by the text".',
    '• No penalty for wrong answers on the digital SAT — **never leave a question blank**; guess if you have to.',
    '• Flag and move on; come back if time remains.',
  ].join('\n')],
  [/(score|1600|1400|1500|target score|improve my score)/, [
    'Raising your score is about **missed questions, not new questions**:',
    '• Your biggest gains come from reviewing wrong answers, writing down the rule or formula you missed, then drilling that topic.',
    '• 300+ point jumps usually come from fixing careless errors and pacing, not from learning new content.',
    '• Take full timed tests to build stamina; score dips in the last module mean fatigue, so practice at your real test time.',
    '• Use the Stats page to see accuracy by topic and attack the bottom ones.',
  ].join('\n')],
  [/(streak|motivat|nervous|anxious|scared|give up|tired|burnout|confidence|stress)/, [
    'You\'ve got this! 🚀',
    '• SAT scores are a skill, and skills improve with practice — every question you answer is data on exactly what to review next.',
    '• Consistency beats intensity: **25-30 focused minutes a day** beats a 3-hour cram session.',
    '• Review wrong answers the same day you make them; that is where the learning happens.',
    '• Test-day anxiety fades with repetition — do a few full timed tests so the real thing feels familiar.',
    '• Keep your streak alive and watch the level climb. One question at a time!',
  ].join('\n')],
];

function builtinTutorReply(message) {
  const q = message.toLowerCase().replace(/\s+/g, ' ').trim();
  for (const [re, reply] of BUILTIN_ANSWERS) {
    if (re.test(q)) return reply;
  }
  return [
    'Happy to help! I\'m the free built-in tutor, so I work best on specific questions. Try:',
    '• "Explain the quadratic formula step by step"',
    '• "What are the top grammar rules on the SAT?"',
    '• "How should I pace myself?"',
    '• "Make me a 2-week study plan"',
    '• "What is the slope of the line through (1,2) and (3,6)?"',
    'Or connect a free Gemini key in Settings and I can answer anything with real AI.',
  ].join('\n');
}

/**
 * Tutor reply. Key resolution: per-user key (from Settings) → GEMINI_API_KEY
 * env → GROQ_API_KEY env → built-in tutor.
 */
async function tutorReply(message, history = [], { geminiKey } = {}) {
  const cfg = await getConfig();
  const messages = [...history.slice(-8), { role: 'user', content: message }];
  const key = geminiKey || cfg.geminiKey || GEMINI_KEY;
  if (key) {
    const model = cfg.geminiModel || GEMINI_MODEL;
    const attempts = [model, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== model)];
    for (const m of attempts) {
      try {
        const r = await callGemini(messages, key, m);
        if (r) return { reply: r, provider: 'gemini' };
      } catch (e) {
        console.log('tutor: Gemini call failed (' + m + '): ' + e.message);
      }
    }
  }
  const groqKey = cfg.groqKey || GROQ_KEY;
  if (groqKey) {
    try {
      const r = await callGroq(messages, groqKey, cfg.groqModel);
      if (r) return { reply: r, provider: 'groq' };
    } catch (e) {
      console.log('tutor: Groq call failed: ' + e.message);
    }
  }
  return { reply: builtinTutorReply(message), provider: 'builtin' };
}

async function tutorStatus({ geminiKey } = {}) {
  const cfg = await getConfig();
  const gem = Boolean(geminiKey || cfg.geminiKey || GEMINI_KEY);
  const groq = Boolean(cfg.groqKey || GROQ_KEY);
  const connected = gem || groq;
  const model = cfg.geminiModel || GEMINI_MODEL;
  return {
    mode: gem ? 'gemini' : groq ? 'groq' : 'builtin',
    connected,
    provider: gem
      ? 'Gemini ' + model + ' (free tier), connected'
      : groq
        ? 'Groq ' + (cfg.groqModel || GROQ_MODEL) + ' (free tier)'
        : 'Built-in SAT Sage',
  };
}

module.exports = { tutorReply, tutorStatus };
