'use strict';

// ─── Gamification engine: XP, levels, streaks, badges ──────────────────────

const LEVEL_XP = 100; // XP required to advance from level N to N+1 is LEVEL_XP * N

function xpForLevel(level) {
  // cumulative XP needed to REACH `level`
  return LEVEL_XP * (level * (level - 1)) / 2;
}

function levelFromXp(xp) {
  // inverse: find highest level whose cumulative threshold <= xp
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

function levelProgress(xp) {
  const level = levelFromXp(xp);
  const current = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return {
    level,
    xp,
    current,
    next,
    intoLevel: xp - current,
    needed: next - current,
    pct: Math.floor(((xp - current) / (next - current)) * 100),
  };
}

function xpAward({ correct, difficulty = 1, combo = 0, timeMs = 0, base = 10 }) {
  if (!correct) return 0;
  let xp = base + (difficulty - 1) * 5;            // harder questions pay more
  xp += Math.min(combo, 10) * 2;                   // streak bonus, capped
  if (timeMs > 0 && timeMs < 15000) xp += 5;       // speed bonus
  return Math.round(xp);
}

// Server-authoritative combo: increments on correct, resets on wrong, and can
// be force-reset when a new round begins (newRound can only lower a combo).
function nextCombo({ userCombo, correct, newRound = false }) {
  const base = newRound ? 0 : userCombo;
  return correct ? Math.min(base + 1, 10) : 0;
}

// ─── Adaptive difficulty & per-topic proficiency ───────────────────────────
// Ratings live on a 0-100 scale and are updated as a difficulty-weighted
// exponential moving average: harder questions move the needle more, and
// recent answers matter more than old ones.
function updateRating({ rating = 50, correct, difficulty = 2 }) {
  const k = 0.15 + (difficulty - 1) * 0.05; // 0.15 / 0.20 / 0.25
  const next = correct
    ? rating + k * (100 - rating)   // pull toward 100
    : rating - k * rating;          // pull toward 0
  return Math.round(next * 10) / 10;
}

function difficultyForRating(rating) {
  if (rating < 40) return 1;
  if (rating < 70) return 2;
  return 3;
}

// Smooth adaptation: difficulty moves at most one step per answer so the
// experience never jumps wildly between questions.
function nextDifficulty({ prev, rating }) {
  const target = difficultyForRating(rating);
  if (target === prev) return prev;
  return target > prev ? Math.min(prev + 1, 3) : Math.max(prev - 1, 1);
}

// Human-readable band for a proficiency rating (0-100).
function proficiencyLevel(rating) {
  if (rating >= 90) return 'Mastered';
  if (rating >= 70) return 'Advanced';
  if (rating >= 40) return 'Proficient';
  return 'Developing';
}

// ─── Marking system (SAT-style: no penalty for wrong answers) ───────────────
// Marks are earned per correct answer: harder questions pay more, and fast
// answers earn a small speed bonus. Wrong answers score 0 (like the real SAT,
// which has no guessing penalty).
function marksForAnswer({ correct, difficulty = 1, timeMs = 0 }) {
  if (!correct) return 0;
  let marks = difficulty * 10;             // 10 / 20 / 30 per difficulty level
  if (timeMs > 0 && timeMs < 15000) marks += 4; // speed bonus
  return marks;
}

// Letter grade + label from a percentage of maximum marks.
function gradeForPct(pct) {
  if (pct >= 95) return { grade: 'S', label: 'Elite', emoji: '👑' };
  if (pct >= 85) return { grade: 'A', label: 'Excellent', emoji: '🏆' };
  if (pct >= 70) return { grade: 'B', label: 'Strong', emoji: '💪' };
  if (pct >= 55) return { grade: 'C', label: 'Solid', emoji: '📈' };
  if (pct >= 40) return { grade: 'D', label: 'Getting there', emoji: '🌱' };
  return { grade: 'F', label: 'Keep drilling', emoji: '🔥' };
}

// Grade for a 400-1600 scaled test score.
function testGrade(scaled) {
  if (scaled >= 1500) return { grade: 'S', label: 'Elite — test-day ready', emoji: '👑' };
  if (scaled >= 1350) return { grade: 'A', label: 'Excellent', emoji: '🏆' };
  if (scaled >= 1200) return { grade: 'B', label: 'Strong', emoji: '💪' };
  if (scaled >= 1050) return { grade: 'C', label: 'Solid', emoji: '📈' };
  if (scaled >= 950) return { grade: 'D', label: 'Getting there', emoji: '🌱' };
  return { grade: 'F', label: 'Early stage', emoji: '🚀' };
}

const BADGES = {
  first_question:    { name: 'First Steps',      desc: 'Answer your first question', icon: '🌱' },
  five_questions:    { name: 'Warming Up',       desc: 'Answer 5 questions',         icon: '🔥' },
  twenty_five:       { name: 'Getting Serious',  desc: 'Answer 25 questions',        icon: '⚡' },
  hundred:           { name: 'Century Club',     desc: 'Answer 100 questions',       icon: '💯' },
  combo_5:           { name: 'On Fire',          desc: '5 in a row correct',         icon: '🔥' },
  combo_10:          { name: 'Unstoppable',      desc: '10 in a row correct',        icon: '🚀' },
  level_5:           { name: 'Rising Star',      desc: 'Reach level 5',              icon: '⭐' },
  level_10:          { name: 'Scholarly',        desc: 'Reach level 10',             icon: '🏅' },
  streak_3:          { name: 'Habit Builder',    desc: '3-day practice streak',      icon: '📅' },
  streak_7:          { name: 'Week Warrior',     desc: '7-day practice streak',      icon: '🗓️' },
  perfect_round:     { name: 'Flawless',         desc: 'Perfect score on a round',   icon: '💎' },
  math_whiz:         { name: 'Math Whiz',        desc: 'Answer 20 math questions',   icon: '🧮' },
  reading_star:      { name: 'Reading Star',     desc: 'Answer 20 reading questions',icon: '📖' },
};

// check which badges a user unlocks given their current totals; returns badge ids newly earned
function checkBadges({ totalAnswered, totalCorrect, bestStreak, level, streak, mathCount, readingCount, perfectRound }) {
  const earned = [];
  const add = (id) => {
    if (totalAnswered >= 1 && id === 'first_question') earned.push(id);
    if (totalAnswered >= 5 && id === 'five_questions') earned.push(id);
    if (totalAnswered >= 25 && id === 'twenty_five') earned.push(id);
    if (totalAnswered >= 100 && id === 'hundred') earned.push(id);
    if (bestStreak >= 5 && id === 'combo_5') earned.push(id);
    if (bestStreak >= 10 && id === 'combo_10') earned.push(id);
    if (level >= 5 && id === 'level_5') earned.push(id);
    if (level >= 10 && id === 'level_10') earned.push(id);
    if (streak >= 3 && id === 'streak_3') earned.push(id);
    if (streak >= 7 && id === 'streak_7') earned.push(id);
    if (perfectRound && id === 'perfect_round') earned.push(id);
    if (mathCount >= 20 && id === 'math_whiz') earned.push(id);
    if (readingCount >= 20 && id === 'reading_star') earned.push(id);
  };
  Object.keys(BADGES).forEach(add);
  return earned;
}

module.exports = { LEVEL_XP, xpForLevel, levelFromXp, levelProgress, xpAward, nextCombo, updateRating, difficultyForRating, nextDifficulty, proficiencyLevel, marksForAnswer, gradeForPct, testGrade, BADGES, checkBadges };
