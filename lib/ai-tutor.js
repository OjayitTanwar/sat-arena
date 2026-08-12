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

// ── Built-in fallback tutor (works offline, zero cost) ────────────────────
const BUILTIN_KNOWLEDGE = {
  math: [
    'Great question! Here are my top SAT math strategies:',
    '• **Plug in numbers**: for abstract algebra, pick a number and test it.', 
    '• **Know your formulas**, slope (y₂−y₁)/(x₂−x₁), quadratic formula, circle area πr², Pythagorean theorem.',
    '• **Watch units**, SAT loves unit-conversion traps (hours vs minutes, dollars vs cents).',
    '• **Process of elimination**, wrong answers are often "too big/too small" or flip a sign.',
    '• The digital SAT Math section is 2 modules of 35 min each (54 questions total, ~95 seconds each) with a built-in Desmos graphing calculator.',
  ].join('\n'),
  reading: [
    "Here's how to crush SAT Reading & Writing:",
    '• **Read the question first**, know what you are hunting for.',
    '• **For vocab-in-context**: replace the word with each answer choice and see which fits the sentence.',
    '• **For grammar**: trust your ear, then verify with a rule (subject-verb agreement, pronoun agreement, parallelism).',
    '• **For transitions**: ask "does this add (moreover), contrast (however), or show result (therefore)?"',
    '• The Reading & Writing section is 2 modules of 32 min each (54 questions).',
  ].join('\n'),
  vocabulary: [
    'Boosting SAT vocabulary:',
    '• Learn words in **context**, not memorized lists, the SAT tests how words are used, not obscure definitions.',
    '• Study common roots and prefixes: "bene-" (good), "mal-" (bad), "spec-" (look), "dict-" (say).',
    '• Read widely, articles, essays, science writing. The SAT pulls passages from these fields.',
    '• Practice active recall: for each new word, write your own sentence using it.',
  ].join('\n'),
  grammar: [
    'SAT grammar rules that appear again and again:',
    '• **Subject-verb agreement**: singular subject → singular verb ("Each of the runners is ready").',
    '• **Pronoun agreement**: match the antecedent ("Every employee must submit his or her form").',
    '• **Parallelism**: items in a list must match form ("running, swimming, and reading", not "running, swimming, and to read").',
    '• **Modifiers**: an opening phrase must clearly modify the subject right after it.',
    '• **Punctuation**: semicolons join independent clauses; colons introduce lists or explanations.',
  ].join('\n'),
  streak: [
    "You're building a streak, that's the #1 habit for score growth! 🔥",
    '• Aim for **25-30 focused minutes daily** rather than 3 hours once a week.',
    '• Review your *wrong* answers the same day; that is where the learning happens.', 
    '• Mix sections: alternate math and reading so you stay sharp in both.',
    '• The key to SAT success is consistent, spaced practice. Keep it up!',
  ].join('\n'),
  motivation: [
    "You've got this! 🚀",
    '• SAT scores are a skill, and skills improve with practice, not magic.',
    '• Celebrate small wins: each question you answer builds the score you want.',
    '• If you miss a question, that is just data: it tells you exactly what to review next.',
    '• Keep your streak alive and watch your dashboard level climb. One question at a time!',
  ].join('\n'),
};

function builtinTutorReply(message) {
  const lower = message.toLowerCase();
  const topics = [
    [/math|algebra|geometry|equation|slope|quadratic|function|percent|ratio|probability/, 'math'],
    [/vocab|word|definition/, 'vocabulary'],
    [/grammar|subject|verb|pronoun|parallel|comma|semicolon|modifier/, 'grammar'],
    [/reading|passage|comprehension|writing|transition|punctuation/, 'reading'],
    [/streak|habit|daily|consistent|keep going/, 'streak'],
    [/motivat|scared|nervous|anxious|give up|hard|stuck|tired/, 'motivation'],
  ];
  for (const [re, key] of topics) {
    if (re.test(lower)) return BUILTIN_KNOWLEDGE[key];
  }
  return BUILTIN_KNOWLEDGE.math;
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
        : 'Built-in SAT Sage. Add a free Gemini key in Settings to power it up',
  };
}

module.exports = { tutorReply, tutorStatus };
