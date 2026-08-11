'use strict';

// ─── Reading & Writing question bank mimicking real SAT questions ──────────
// Vocabulary-in-context, grammar/usage, transitions, and passage-based reading.

const { pick, shuffle, randInt, hashId } = require('./util');

// Build 4 unique choices that always include the correct one. If a template
// ever runs short of distinct candidates, pad with a plausible wrong variant
// of the correct answer (never a placeholder like "(Choice 4)").
function wrongVariant(text) {
  const mutations = [
    (t) => t.replace(/ and /, ' but '),
    (t) => t.replace(/,/g, '; '),
    (t) => t.replace(/; /g, ', '),
    (t) => t.replace(/\.$/, ', which is notable.'),
    (t) => t.replace(/^(\w)/, (m) => m.toLowerCase()),
    (t) => t + ' in most cases.',
  ];
  for (const fn of mutations) {
    const v = fn(text);
    if (v !== text) return v;
  }
  return text + ' however';
}

function uniqueChoices(correct, candidates) {
  const pool = [...new Set([correct, ...candidates])];
  let guard = 0;
  while (pool.length < 4 && guard++ < 50) {
    const pad = wrongVariant(correct);
    if (!pool.includes(pad)) pool.push(pad);
    else correct += ' '; // nudge so a different mutation is produced next loop
  }
  return shuffle(pool.slice(0, 4));
}

const VOCAB = [
  { word: 'ubiquitous', def: 'present everywhere', sentence: 'Smartphones have become so ______ in modern life that many people cannot imagine a day without them.' },
  { word: 'meticulous', def: 'showing great attention to detail', sentence: 'The editor was ______ in her review of the manuscript, checking every footnote and comma.' },
  { word: 'ephemeral', def: 'lasting a very short time', sentence: 'The beauty of the cherry blossoms is ______, lasting only a week each spring.' },
  { word: 'tenacious', def: 'holding firmly to something', sentence: 'Despite repeated setbacks, her ______ commitment to the cause never wavered.' },
  { word: 'mitigate', def: 'make less severe', sentence: 'Planting trees along the coast can help ______ the effects of erosion.' },
  { word: 'prolific', def: 'producing many works or results', sentence: 'The ______ author published three novels in a single year.' },
  { word: 'candid', def: 'truthful and straightforward', sentence: 'Her ______ remarks about the project\'s flaws surprised the team, but they appreciated her honesty.' },
  { word: 'ambiguous', def: 'open to more than one interpretation', sentence: 'The instructions were so ______ that two workers completed the task in completely different ways.' },
  { word: 'vindicate', def: 'clear of blame or suspicion', sentence: 'The new evidence served to ______ the scientist whose theory had once been dismissed.' },
  { word: 'alleviate', def: 'relieve or make easier', sentence: 'The new policy was designed to ______ the financial burden on low-income families.' },
  { word: 'audacious', def: 'showing a willingness to take bold risks', sentence: 'The startup\'s ______ plan to colonize the ocean floor drew both praise and skepticism.' },
  { word: 'complacent', def: 'smug and uncritical satisfaction with oneself', sentence: 'After years of dominance, the company grew ______ and failed to notice its rivals gaining ground.' },
  { word: 'discord', def: 'lack of harmony or agreement', sentence: 'The committee meeting was marked by ______, as members could not agree on a single proposal.' },
  { word: 'eloquent', def: 'fluent and persuasive in speaking or writing', sentence: 'Her ______ speech moved the entire audience to tears.' },
  { word: 'fortuitous', def: 'happening by chance in a happy or beneficial way', sentence: 'A ______ encounter at the conference led to a decade-long partnership.' },
  { word: 'impartial', def: 'treating all rivals or disputants equally', sentence: 'A judge must remain ______, weighing the evidence without favor toward either side.' },
  { word: 'novel', def: 'interestingly new or unusual', sentence: 'The engineer proposed a ______ solution that no one in the industry had considered.' },
  { word: 'obsolete', def: 'no longer produced or used', sentence: 'The invention of the smartphone quickly made many handheld devices ______.' },
  { word: 'pragmatic', def: 'dealing with things sensibly and realistically', sentence: 'Her ______ approach to budgeting kept the nonprofit solvent during the economic downturn.' },
  { word: 'reticent', def: 'not revealing one\'s thoughts readily', sentence: 'The usually ______ student surprised everyone by delivering a passionate speech.' },
];

// distractors for vocab: other real words from the bank with plausible-but-wrong meanings
const VOCAB_DISTRACTOR_MEANINGS = [
  'rare and difficult to find',
  'careless and hasty',
  'permanent and unchanging',
  'weak and easily discouraged',
  'make more severe',
  'producing very little',
  'secretive and dishonest',
  'clear and unambiguous',
  'blame for a crime',
  'worsen a burden',
  'cautious and hesitant',
  'eagerly ambitious for success',
  'harmony and agreement',
  'clumsy in speech or writing',
  'occurring at a fixed, predictable time',
  'strongly favoring one side',
  'old and outdated',
  'brand new and untested',
  'theoretical and impractical',
  'open and forthcoming',
];

function vocabInContext() {
  const entry = pick(VOCAB);
  const distractorPool = shuffle(VOCAB_DISTRACTOR_MEANINGS);
  const choices = uniqueChoices(entry.def, distractorPool.slice(0, 3));
  const correctIndex = choices.indexOf(entry.def);
  return {
    id: hashId('vocab' + entry.word),
    section: 'reading',
    topic: 'vocabulary-in-context',
    difficulty: 2,
    prompt: `As used in the sentence, which choice best defines the meaning of the word in bold?\n\n“${entry.sentence}”`,
    choices,
    correctIndex,
    explanation: `The word “${entry.word}” means “${entry.def}.” In this sentence, only that meaning fits the context: ${entry.sentence.split('______')[0].trim()}…`,
  };
}

// ── Easy vocabulary bank (difficulty 1, for adaptive floors) ───────────────
const EASY_VOCAB = [
  { word: 'benevolent', def: 'kind and generous', sentence: 'The ______ neighbor donated groceries to every family on the street.' },
  { word: 'fragile', def: 'easily broken or damaged', sentence: 'Handle the antique vase with care — it is quite ______.' },
  { word: 'reluctant', def: 'unwilling or hesitant', sentence: 'She was ______ to speak in front of the crowd, but she did it anyway.' },
  { word: 'cautious', def: 'careful to avoid danger or mistakes', sentence: 'Drivers should be ______ when the roads are icy.' },
  { word: 'eager', def: 'very excited and interested', sentence: 'The students were ______ to hear their exam results.' },
  { word: 'scarce', def: 'not enough; in short supply', sentence: 'Clean drinking water is ______ in the arid region.' },
  { word: 'durable', def: 'able to last a long time', sentence: 'These hiking boots are ______ enough for years of trails.' },
  { word: 'prompt', def: 'done quickly and without delay', sentence: 'Her ______ response to the emergency impressed the supervisor.' },
];

function easyVocabQuestion() {
  const entry = pick(EASY_VOCAB);
  const distractorPool = shuffle(VOCAB_DISTRACTOR_MEANINGS);
  const choices = uniqueChoices(entry.def, distractorPool.slice(0, 3));
  const correctIndex = choices.indexOf(entry.def);
  return {
    id: hashId('easyvocab' + entry.word),
    section: 'reading',
    topic: 'vocabulary-in-context',
    difficulty: 1,
    prompt: `As used in the sentence, which choice best defines the meaning of the word in bold?\n\n“${entry.sentence}”`,
    choices,
    correctIndex,
    explanation: `The word “${entry.word}” means “${entry.def}.” In this sentence, only that meaning fits the context: ${entry.sentence.split('______')[0].trim()}…`,
  };
}

// ── Advanced vocabulary bank (difficulty 3, for the hard tier) ─────────────
const HARD_VOCAB = [
  { word: 'obfuscate', def: 'deliberately make something unclear or hard to understand', sentence: 'The spokesperson seemed intent on ______ the details rather than clarifying them for the reporters.' },
  { word: 'intransigent', def: 'unwilling to change one\'s views or compromise', sentence: 'The union remained ______ in its demands, rejecting every offer the company proposed.' },
  { word: 'laconic', def: 'using very few words; terse', sentence: 'Known for his ______ replies, the general answered the hour-long briefing with a single sentence.' },
  { word: 'magnanimous', def: 'generous and forgiving, especially toward a rival', sentence: 'In a ______ gesture, the defeated candidate congratulated her opponent and offered full support.' },
  { word: 'anachronism', def: 'something belonging to an earlier time, out of place in the present', sentence: 'In an age of streaming, the fax machine in the corner office seemed a charming ______.' },
  { word: 'pedantic', def: 'overly concerned with minor details or formal rules', sentence: 'His ______ corrections about comma placement often distracted from the substance of the discussion.' },
  { word: 'sycophantic', def: 'excessively flattering to gain favor', sentence: 'The ______ reviews in the magazine praised the director so lavishly that readers suspected a conflict of interest.' },
  { word: 'quintessential', def: 'the most perfect or typical example of a quality or class', sentence: 'The narrow, fog-bound streets made the city the ______ setting for a detective novel.' },
  { word: 'sanguine', def: 'optimistic, especially in a difficult situation', sentence: 'Despite the budget cuts, the department head remained ______ about meeting the year\'s research goals.' },
  { word: 'bombastic', def: 'pompous and inflated in language', sentence: 'The speech was more ______ than substantive, heavy on grand phrases and light on proposals.' },
  { word: 'enervate', def: 'to weaken or drain of energy', sentence: 'The relentless heat and humidity seemed to ______ even the most energetic volunteers.' },
  { word: 'taciturn', def: 'habitually reserved in speech', sentence: 'The fisherman was famously ______, answering questions with nods and occasional grunts.' },
  { word: 'inchoate', def: 'just begun and not yet fully formed', sentence: 'The plan was still ______, little more than a sketch on a napkin, when the partners agreed to pursue it.' },
  { word: 'surreptitious', def: 'kept secret because it would not be approved', sentence: 'The interns exchanged ______ glances as the manager left the room.' },
  { word: 'capricious', def: 'given to sudden changes of mood or behavior', sentence: 'The weather here is famously ______, shifting from sunshine to sleet within an hour.' },
  { word: 'disparate', def: 'fundamentally different in kind', sentence: 'The anthology brings together ______ voices, from rural poets to urban novelists.' },
  { word: 'equivocate', def: 'to use ambiguous language to conceal the truth', sentence: 'Pressed for a clear answer, the candidate chose to ______ rather than take a stand.' },
  { word: 'garrulous', def: 'excessively talkative', sentence: 'The ______ tour guide delayed the group for an hour with stories about every doorway.' },
  { word: 'lugubrious', def: 'looking or sounding sad and dismal', sentence: 'The ______ soundtrack made even the wedding scene feel like a funeral.' },
  { word: 'perfunctory', def: 'carried out with little effort or interest', sentence: 'His ______ apology, delivered without meeting anyone\'s eyes, satisfied no one.' },
  { word: 'recalcitrant', def: 'stubbornly resistant to authority', sentence: 'The ______ engine refused to start no matter how the mechanics coaxed it.' },
  { word: 'specious', def: 'superficially plausible but actually wrong', sentence: 'The argument sounded convincing, but its ______ logic collapsed under scrutiny.' },
  { word: 'vacillate', def: 'to waver between different opinions or actions', sentence: 'Unable to decide between the two offers, she continued to ______ for weeks.' },
  { word: 'voluble', def: 'speaking fluently and at length', sentence: 'The ______ auctioneer barely paused for breath as bids flew across the room.' },
  { word: 'palpable', def: 'able to be touched or felt; tangible', sentence: 'The tension in the courtroom was ______; even the journalists stopped typing.' },
  { word: 'ostensible', def: 'stated or appearing to be true, but not necessarily so', sentence: 'The ______ purpose of the meeting was planning, but the real agenda was personnel cuts.' },
  { word: 'zenith', def: 'the highest point or peak', sentence: 'The empire reached its ______ in the sixteenth century, then declined for two hundred years.' },
  { word: 'mendacious', def: 'not telling the truth; lying', sentence: 'The memoir was revealed to be ______, with fabricated events presented as fact.' },
  { word: 'intractable', def: 'hard to control or deal with', sentence: 'The ______ dispute between the two nations had defied every peace proposal for decades.' },
  { word: 'fecund', def: 'producing abundant growth or offspring', sentence: 'The valley\'s ______ soil yielded three harvests a year.' },
];

function hardVocabQuestion() {
  const entry = pick(HARD_VOCAB);
  const distractorPool = shuffle([
    ...VOCAB_DISTRACTOR_MEANINGS,
    'make something clearer and more precise',
    'flexible and willing to negotiate',
    'long-winded and verbose',
    'petty and spiteful',
    'a timeless classic that never goes out of style',
    'careless about rules and details',
    'honest and direct criticism',
    'a rare and unique exception',
    'pessimistic in the face of difficulty',
    'modest and understated in style',
    'to invigorate or energize',
    'talkative and sociable',
  ]);
  const choices = uniqueChoices(entry.def, distractorPool.slice(0, 3));
  const correctIndex = choices.indexOf(entry.def);
  return {
    id: hashId('hardvocab' + entry.word),
    section: 'reading',
    topic: 'vocabulary-in-context',
    difficulty: 3,
    prompt: `As used in the sentence, which choice best defines the meaning of the word in bold?\n\n“${entry.sentence}”`,
    choices,
    correctIndex,
    explanation: `In this context, “${entry.word}” means “${entry.def}.” The surrounding details — ${entry.sentence.split('______')[0].trim()} — point to that meaning.`,
  };
}

// ── Grammar / usage templates ──────────────────────────────────────────────
const GRAMMAR_TEMPLATES = [
  {
    topic: 'subject-verb-agreement',
    difficulty: 1,
    build: () => {
      const cases = [
        { subject: 'The dog', verb: 'barks', wrong: 'bark' },
        { subject: 'The children', verb: 'play', wrong: 'plays' },
        { subject: 'My sister', verb: 'drives', wrong: 'drive' },
        { subject: 'The birds', verb: 'fly', wrong: 'flies' },
      ];
      const c = pick(cases);
      const tails = pick([
        ['in the yard every morning.', 'at the park after school.'],
        ['outside after school.', 'in the gym on weekends.'],
        ['to work each day.', 'to the store on Fridays.'],
        ['south for the winter.', 'to warmer regions each fall.'],
      ]);
      const right = `${c.subject} ${c.verb} ${tails[0]}`;
      const wrongA = `${c.subject} ${c.wrong} ${tails[0]}`;
      const wrongB = `${c.subject} ${c.wrong} ${tails[1]}`;
      return {
        stem: `Which version of the sentence is correct?`,
        choices: shuffle([right, wrongA, wrongB]),
        correct: right,
        explanation: `The subject “${c.subject}” is ${c.verb.endsWith('s') ? 'singular' : 'plural'}, so it takes the ${c.verb.endsWith('s') ? 'singular' : 'plural'} verb “${c.verb},” not “${c.wrong}.”`,
      };
    },
  },
  {
    topic: 'subject-verb-agreement',
    difficulty: 2,
    build: () => {
      const subjects = [
        { noun: 'The group of students', verb: 'is', wrong: 'are' },
        { noun: 'Each of the runners', verb: 'was', wrong: 'were' },
        { noun: 'The collection of paintings', verb: 'hangs', wrong: 'hang' },
        { noun: 'Neither of the answers', verb: 'is', wrong: 'are' },
        { noun: 'One of the chefs', verb: 'prepares', wrong: 'prepare' },
      ];
      const s = pick(subjects);
      const tail = pick([
        'on the school team',
        'ready for the competition',
        'in the museum gallery',
        'considered correct',
        'the signature dish each evening',
      ]);
      // four distinct versions: correct, plural-verb error, fragment, auxiliary-mismatch error
      const right = `${s.noun} ${s.verb} ${tail}`;
      const wrong = `${s.noun} ${s.wrong} ${tail}`;
      const fragment = `${s.noun} being ${tail}`; // participial fragment — plausible wrong answer
      const auxMismatch = s.verb === 'was'
        ? `${s.noun} were ${tail.replace(/^ready/, 'preparing')}`
        : `${s.noun} ${s.verb} ${tail} and continues to`; // dangling "and continues to" — incomplete
      const pool = [...new Set([right, wrong, fragment, auxMismatch])];
      // guarantee 4 unique choices (pad with a deliberately wrong variant if needed)
      while (pool.length < 4) pool.push(`${s.noun} ${s.verb} ${tail} now`);
      return {
        stem: `The underlined portion of the following sentence may need revision. Choose the best version.\n\n“${wrong}.”`,
        choices: pool.slice(0, 4),
        correct: right,
        explanation: `The subject “${s.noun}” is singular, so it requires the singular verb “${s.verb},” not “${s.wrong}.”`,
      };
    },
  },
  {
    topic: 'pronoun-agreement',
    difficulty: 2,
    build: () => {
      const cases = [
        { subject: 'Every employee', their: 'his or her', wrong: 'their' },
        { subject: 'Each participant', their: 'his or her', wrong: 'their' },
        { subject: 'A student', their: 'his or her', wrong: 'their' },
        { subject: 'Anyone who wishes to apply', their: 'his or her', wrong: 'their' },
      ];
      const c = pick(cases);
      const verb = pick(['must submit', 'should complete', 'needs to finish']);
      const tail = pick(['the application by Friday.', 'the registration form online.', 'the assignment before noon.']);
      const wrong = `${c.subject} ${verb} ${c.wrong} ${tail}`;
      const right = `${c.subject} ${verb} ${c.their} ${tail}`;
      const extras = [
        `${c.subject} ${verb} ${c.their} ${tail}`.replace(/\bhis or her\b/, 'their own'),
        `${c.subject} ${verb} ${tail}`,
      ];
      return {
        stem: `Choose the best revision of the underlined portion of the sentence:\n\n“${wrong}”`,
        choices: [right, wrong, extras[0], extras[1]],
        correct: right,
        explanation: `The singular antecedent “${c.subject}” must be matched by a singular pronoun — “${c.their}” — not the plural “their.”`,
      };
    },
  },
  {
    topic: 'parallelism',
    difficulty: 3,
    build: () => {
      const templates = [
        {
          good: 'The intern was praised for her diligence, creativity, and reliability.',
          bad: 'The intern was praised for her diligence, creativity, and being reliable.',
        },
        {
          good: 'She enjoys hiking, swimming, and reading in her free time.',
          bad: 'She enjoys hiking, swimming, and to read in her free time.',
        },
        {
          good: 'The report was both thorough and accurate.',
          bad: 'The report was both thorough and with accuracy.',
        },
        {
          good: 'To succeed, one must plan carefully and work consistently.',
          bad: 'To succeed, one must plan carefully and with consistent work.',
        },
      ];
      const t = pick(templates);
      const extras = [
        t.good.replace(/and/, ', and'),
        t.bad.replace(/, and/, ' and'),
      ];
      return {
        stem: `Which version of the sentence is grammatically correct?`,
        choices: shuffle([t.good, t.bad, ...extras]),
        correct: t.good,
        explanation: `Items in a list must be parallel in form. “${t.good.split(', ')[2] || t.good}” keeps all elements in the same grammatical structure.`,
      };
    },
  },
  {
    topic: 'modifiers',
    difficulty: 3,
    build: () => {
      const templates = [
        {
          good: 'Having finished the exam, the students relaxed in the hallway.',
          bad: 'Having finished the exam, the hallway was filled with relaxed students.',
        },
        {
          good: 'Covered in snow, the mountains looked majestic at dawn.',
          bad: 'Covered in snow, we saw the mountains look majestic at dawn.',
        },
        {
          good: 'Exhausted after the long hike, the hikers collapsed by the campfire.',
          bad: 'Exhausted after the long hike, the campfire was a welcome sight for the hikers.',
        },
      ];
      const t = pick(templates);
      const extras = [
        t.good.replace(/^[A-Z]/, (c) => c.toLowerCase()).replace(/\.$/, ', and they were pleased.'),
        t.bad.replace(/\.$/, ', which was expected.'),
      ];
      return {
        stem: `Which choice most effectively revises the sentence so that it is clear and correct?`,
        choices: shuffle([t.good, t.bad, ...extras]),
        correct: t.good,
        explanation: `A dangling modifier occurs when the opening phrase does not clearly modify the subject. In the correct version, “the students” perform the action of the opening phrase.`,
      };
    },
  },
  {
    topic: 'punctuation',
    difficulty: 3,
    build: () => {
      const templates = [
        {
          // semicolon vs comma splice
          correct: 'The committee approved the budget; however, the vote was not unanimous.',
          wrongs: [
            'The committee approved the budget, however, the vote was not unanimous.',
            'The committee approved the budget, the vote was not unanimous.',
            'The committee approved the budget. However the vote was not unanimous.',
          ],
          why: 'A semicolon (not a comma) correctly joins two independent clauses when a conjunctive adverb such as “however” is used.',
        },
        {
          // colon introducing a list
          correct: 'The library has three new study rooms: one for quiet work, one for group projects, and one for tutoring.',
          wrongs: [
            'The library has three new study rooms, one for quiet work, one for group projects, and one for tutoring.',
            'The library has three new study rooms; one for quiet work, one for group projects, and one for tutoring.',
            'The library has three new study rooms; there are rooms for quiet work, group projects, and tutoring.',
          ],
          why: 'A colon appropriately introduces the list that explains “three new study rooms.”',
        },
        {
          // commas around a nonessential clause
          correct: 'Dr. Okonkwo, who won the prize last year, will judge the competition.',
          wrongs: [
            'Dr. Okonkwo who won the prize last year will judge the competition.',
            'Dr. Okonkwo, who won the prize last year will judge the competition.',
            'Dr. Okonkwo who won the prize last year, will judge the competition.',
          ],
          why: 'Commas set off the nonessential clause “who won the prize last year.”',
        },
      ];
      const t = pick(templates);
      return {
        stem: `Choose the best version of the sentence.`,
        choices: [t.correct, ...t.wrongs],
        correct: t.correct,
        explanation: t.why,
      };
    },
  },
  {
    topic: 'pronoun-agreement',
    difficulty: 2,
    build: () => {
      const cases = [
        { good: 'The prize was divided between my sister and me.', bad: 'The prize was divided between my sister and I.' },
        { good: 'The manager gave the report to Carlos and me.', bad: 'The manager gave the report to Carlos and I.' },
        { good: 'Between you and me, the proposal is flawed.', bad: 'Between you and I, the proposal is flawed.' },
        { good: 'The invitation was addressed to my parents and me.', bad: 'The invitation was addressed to my parents and I.' },
      ];
      const c = pick(cases);
      const extras = [
        c.good.replace(/ and me/, ' and myself'),
        c.bad.replace(/ and I/, ' and myself'),
      ];
      return {
        stem: `Which choice most effectively corrects the pronoun error in the sentence?\n\n“${c.bad}”`,
        choices: [c.good, c.bad, ...extras],
        correct: c.good,
        explanation: `The pronoun here is the object of the preposition (or verb), so it must be the object form “me,” not the subject form “I.”`,
      };
    },
  },
  {
    topic: 'punctuation',
    difficulty: 2,
    build: () => {
      const cases = [
        { subject: 'The committee', verb: 'announced', tail: 'decision after a brief recess.' },
        { subject: 'The software', verb: 'updated', tail: 'settings automatically at midnight.' },
        { subject: 'The company', verb: 'revised', tail: 'policy in response to the complaint.' },
        { subject: 'The orchestra', verb: 'began', tail: 'final piece of the evening.' },
      ];
      const s = pick(cases);
      const right = `${s.subject} ${s.verb} its ${s.tail}`;
      const wrongIt = `${s.subject} ${s.verb} it's ${s.tail}`;
      const wrongIts = `${s.subject} ${s.verb} its' ${s.tail}`;
      const wrongTheir = `${s.subject} ${s.verb} their ${s.tail}`;
      return {
        stem: `Which choice completes the sentence so that it is grammatically correct?\n\n“${s.subject} ${s.verb} ______ ${s.tail}”`,
        choices: [right, wrongIt, wrongIts, wrongTheir],
        correct: right,
        explanation: `The possessive form of “it” is “its,” written without an apostrophe. “It's” means “it is,” and “its'” is not a word. Because the subject is singular, “their” would also be incorrect.`,
      };
    },
  },
  {
    topic: 'grammar-usage',
    difficulty: 3,
    build: () => {
      const cases = [
        { good: 'Of the two proposals, the first is the more practical.', bad: 'Of the two proposals, the first is the most practical.' },
        { good: 'Between the twins, Maya is the taller.', bad: 'Between the twins, Maya is the tallest.' },
        { good: 'Which of the two routes is the shorter?', bad: 'Which of the two routes is the shortest?' },
        { good: 'Of the two candidates, she is the more qualified.', bad: 'Of the two candidates, she is the most qualified.' },
      ];
      const c = pick(cases);
      const extras = [
        c.good.replace(/ the more/, ' the more of'),
        c.bad.replace(/ the most/, ' most'),
      ];
      return {
        stem: `Choose the version of the sentence that is most correct.`,
        choices: [c.good, c.bad, ...extras],
        correct: c.good,
        explanation: `When comparing exactly two things, use the comparative form (“more” / “-er”), not the superlative (“most” / “-est”).`,
      };
    },
  },
  {
    topic: 'subject-verb-agreement',
    difficulty: 3,
    build: () => {
      const cases = [
        { subject: 'The basket of apples', verb: 'was', wrong: 'were' },
        { subject: 'The bowl of oranges', verb: 'sits', wrong: 'sit' },
        { subject: 'The stack of papers', verb: 'remains', wrong: 'remain' },
        { subject: 'The series of lectures', verb: 'begins', wrong: 'begin' },
      ];
      const s = pick(cases);
      const tail = pick(['on the kitchen counter.', 'unmoved all morning.', 'unread on the desk.', 'at nine each Tuesday.']);
      const right = `${s.subject} ${s.verb} ${tail}`;
      const wrong = `${s.subject} ${s.wrong} ${tail}`;
      const pool = [...new Set([right, wrong, `${s.subject} ${s.verb} being ${tail}`, `${s.subject} ${s.wrong} to ${tail.replace(/\.$/, '')}.`])];
      return {
        stem: `The underlined portion may need revision. Choose the best version.\n\n“${wrong}”`,
        choices: pool,
        correct: right,
        explanation: `The subject is “${s.subject.split(' of ')[0]},” which is singular, so it takes the singular verb “${s.verb}.” The intervening phrase “of apples” does not change the subject.`,
      };
    },
  },
];

// ── Grammar template: tense consistency ────────────────────────────────────
const TENSE_TEMPLATES = [
  {
    good: 'After she completed her training, she worked at the clinic for five years.',
    bad: 'After she completed her training, she works at the clinic for five years.',
    why: 'The time frame is set in the past (“completed,” “for five years”), so “worked” (past tense) is required — not the present-tense “works.”',
  },
  {
    good: 'Each spring, the committee reviews the proposals and selects the strongest one.',
    bad: 'Each spring, the committee reviews the proposals and selected the strongest one.',
    why: 'The habitual time marker “each spring” requires present tense in both verbs: “reviews … and selects.”',
  },
  {
    good: 'The team will finish the project before the deadline arrives.',
    bad: 'The team will finish the project before the deadline arrived.',
    why: 'Future time (“will finish”) pairs with present-tense “arrives,” not the past-tense “arrived.”',
  },
  {
    good: 'By the time the play began, the audience had already taken their seats.',
    bad: 'By the time the play began, the audience has already taken their seats.',
    why: 'The earlier action (“had taken”) must be past perfect to precede the past action (“began”).',
  },
];

// ── Grammar template: wordiness / redundancy ───────────────────────────────
const WORDINESS_TEMPLATES = [
  {
    good: 'The results clearly demonstrate that the method works.',
    bad: 'The results clearly demonstrate and show the fact that the method is effective in its workings.',
    why: 'The best version is concise: “demonstrate” alone says what the wordy version takes two phrases to say.',
  },
  {
    good: 'Because funding was cut, the program ended.',
    bad: 'Due to the fact that funding was cut, the program came to an end.',
    why: '“Because” is shorter and clearer than “due to the fact that”; “ended” beats “came to an end.”',
  },
  {
    good: 'The mayor announced a plan to reduce traffic.',
    bad: 'The mayor made an announcement about a plan that would reduce the amount of traffic on the roads.',
    why: 'The concise version keeps the core idea without piling up empty phrases.',
  },
  {
    good: 'Students who study regularly tend to score higher.',
    bad: 'Students who study on a regular basis have a tendency to score at higher levels.',
    why: '“Regularly” and “tend to” are tighter, more direct alternatives to the padded phrasing.',
  },
];

// ── Grammar template: sentence combining ───────────────────────────────────
const COMBINING_TEMPLATES = [
  {
    good: 'The museum opened in 1998; it has since welcomed millions of visitors.',
    bad: 'The museum opened in 1998. It has since welcomed millions of visitors and more.',
    why: 'A semicolon joins the two closely related clauses cleanly; the extra “and more” in the other version adds nothing.',
  },
  {
    good: 'Although the hike was steep, the view from the summit was worth it.',
    bad: 'The hike was steep. But the view from the summit was worth it, however.',
    why: '“Although” subordinates one clause and removes the redundant “But … however” doubling.',
  },
  {
    good: 'The director, who had worked in theater for decades, brought fresh energy to the company.',
    bad: 'The director had worked in theater for decades. He brought fresh energy to the company, and he had experience.',
    why: 'The appositive clause (“who had worked …”) folds the background information into one fluid sentence.',
  },
];

// ── Transitions ────────────────────────────────────────────────────────────
const TRANSITIONS = [
  {
    prefix: 'The company’s revenue fell sharply in the first quarter; ______, profits rebounded strongly by year’s end.',
    good: 'however',
    wrongs: ['moreover', 'consequently', 'likewise'],
    why: '“However” signals contrast: the second clause runs counter to the first.',
  },
  {
    prefix: 'The results of the experiment were repeated several times; ______, the researchers had confidence in their conclusions.',
    good: 'consequently',
    wrongs: ['however', 'for example', 'nevertheless'],
    why: '“Consequently” shows cause and effect — the repetitions led to confidence.',
  },
  {
    prefix: 'The new policy reduced paperwork for applicants; ______, it also shortened the average review time.',
    good: 'in addition',
    wrongs: ['on the contrary', 'as a result', 'by contrast'],
    why: 'The second clause adds a complementary benefit, so an additive transition such as “in addition” is best.',
  },
  {
    prefix: 'The city plans to build more bike lanes; ______, it will expand the bus network.',
    good: 'similarly',
    wrongs: ['however', 'therefore', 'instead'],
    why: '“Similarly” connects two supporting actions that advance the same goal.',
  },
  {
    prefix: 'The museum tour was scheduled for three hours; ______, most visitors stayed well past five.',
    good: 'however',
    wrongs: ['similarly', 'therefore', 'for instance'],
    why: '“However” introduces a contrast: the visitors\' behavior ran counter to the schedule.',
  },
  {
    prefix: 'Many sea creatures rely on camouflage; the leafy sea dragon, ______, is nearly indistinguishable from the seaweed it hides among.',
    good: 'for instance',
    wrongs: ['however', 'consequently', 'in other words'],
    why: '“For instance” introduces a concrete example of the general claim about camouflage.',
  },
  {
    prefix: 'The proposal was rejected by the committee; ______, the funding will not be renewed.',
    good: 'therefore',
    wrongs: ['meanwhile', 'for example', 'likewise'],
    why: '“Therefore” signals a consequence: the rejection leads directly to the funding decision.',
  },
  {
    prefix: 'The city council approved the zoning change; ______, construction crews arrived within the week.',
    good: 'consequently',
    wrongs: ['however', 'for example', 'nevertheless'],
    why: '“Consequently” links the approval to its immediate result — the arrival of the crews.',
  },
  {
    prefix: 'The theory was once considered fringe; ______, most researchers now accept it as standard.',
    good: 'now',
    wrongs: ['for instance', 'similarly', 'moreover'],
    why: '“Now” marks a shift in time, contrasting the past treatment of the theory with the present.',
  },
  {
    prefix: 'The author does not celebrate the industrial age; ______, she laments the skills it erased.',
    good: 'rather',
    wrongs: ['furthermore', 'indeed', 'for example'],
    why: '“Rather” signals that the second clause corrects or replaces the idea introduced by the first.',
  },
  {
    prefix: 'The concert was moved indoors; ______, the performers adjusted their set for the smaller hall.',
    good: 'accordingly',
    wrongs: ['however', 'for instance', 'otherwise'],
    why: '“Accordingly” shows that the adjustment followed directly from the change of venue.',
  },
];

// ── Reading passages (short, SAT-style) ────────────────────────────────────
const PASSAGES = [
  {
    title: 'The Migration of Monarch Butterflies',
    passage: `Each autumn, millions of monarch butterflies undertake one of the most extraordinary journeys in the animal kingdom, traveling up to three thousand miles from Canada and the northern United States to the forests of central Mexico. Remarkably, the butterflies that make the return trip north in spring are not the same individuals that flew south; they are their great-grandchildren, guided by instincts they never learned. Scientists have shown that the monarchs use a combination of the sun's position and an internal circadian clock to navigate. The migration is so fragile that a single severe storm during the journey can kill a large share of the season's butterflies — a reminder of how precisely tuned these creatures are to their environment.`,
    questions: [
      {
        q: `The author's primary purpose is to`,
        choices: [`argue that monarchs should be protected by law`, `describe the monarch butterfly's migration and the factors that guide it`, `explain why monarchs travel in the opposite direction in spring`, `criticize researchers for their theories about monarch navigation`],
        correct: 1,
        why: `The passage describes the migration's distance, the generational relay, the navigational cues, and its fragility — a descriptive overview.`,
      },
      {
        q: `According to the passage, monarchs navigate primarily by using`,
        choices: [`the stars and ocean currents`, `the sun's position and an internal clock`, `magnetic fields and landmarks`, `wind patterns and temperature changes`],
        correct: 1,
        why: `The passage states that monarchs “use a combination of the sun's position and an internal circadian clock to navigate.”`,
      },
    ],
  },
  {
    title: 'The Rise of the Public Library',
    passage: `The public library, now a fixture of nearly every American town, was once a radical idea. In the late nineteenth century, when books were expensive and education was a luxury, reformers argued that free access to reading material would lift entire communities. The first public libraries were more than book warehouses: they hosted lectures, job-training classes, and citizenship courses for immigrants. Critics at the time worried that free libraries would be overrun by readers of "trashy" fiction, but librarians responded by guiding readers toward what they considered more worthy works. Over time, the institution survived these debates and evolved, proving that its founders' bet on collective access to knowledge had been a sound one.`,
    questions: [
      {
        q: `The passage primarily emphasizes that early public libraries were`,
        choices: [`primarily places for reading popular fiction`, `institutions with ambitions beyond lending books`, `an idea that was quickly accepted everywhere`, `financially supported by wealthy patrons`],
        correct: 1,
        why: `The passage highlights lectures, job-training, and citizenship courses — evidence that libraries served broader community purposes than lending alone.`,
      },
      {
        q: `The author's attitude toward the founding of public libraries is best described as`,
        choices: [`approving`, `skeptical`, `indifferent`, `regretful`],
        correct: 0,
        why: `Words like “radical idea,” “lift entire communities,” and “sound one” convey the author's clear approval of the library movement.`,
      },
    ],
  },
  {
    title: 'Why Yawning Is Contagious',
    passage: `Almost everyone has experienced the strange urge to yawn after seeing someone else do it. Scientists have linked contagious yawning to mirror neurons — brain cells that fire both when we perform an action and when we observe another performing it. Interestingly, studies suggest that contagious yawning is related to empathy: people who score higher on empathy tests are more likely to catch a yawn from others, and children do not begin to show the behavior until around age four, when social awareness develops. Some researchers even use contagious yawning as a window into how the brain builds social connections. Far from being a sign of boredom, the behavior appears to be a subtle form of social bonding.`,
    questions: [
      {
        q: `The main idea of the passage is that contagious yawning`,
        choices: [`is a sign that a person is tired or bored`, `is linked to empathy and social awareness in the brain`, `occurs only in humans`, `is caused by mirror neurons that no one can fully explain`],
        correct: 1,
        why: `The passage ties contagious yawning to mirror neurons, empathy, and social bonding — its central claim.`,
      },
      {
        q: `Which choice provides the best evidence for the answer to the previous question?`,
        choices: [`“Almost everyone has experienced the strange urge”`, `“children do not begin to show the behavior until around age four”`, `“people who score higher on empathy tests are more likely to catch a yawn”`, `“Far from being a sign of boredom”`],
        correct: 2,
        why: `The empathy-test finding directly supports the claim that contagious yawning is linked to empathy.`,
      },
    ],
  },
  {
    title: 'The Art of the Haiku',
    passage: `The haiku, a Japanese verse form of just seventeen syllables, is often misunderstood as a simple snapshot of nature. In the hands of masters such as Bashō, however, the form is a study in compression: every syllable is chosen to hold weight, and the traditional seasonal word does quiet work, anchoring a fleeting image to a specific moment of the year. The form's brevity is not a limitation but a discipline. By stripping away explanation, the haiku leaves space for the reader's own response — which is precisely why a poem of seventeen syllables can still, after four centuries, feel startlingly modern.`,
    questions: [
      {
        q: `The author's main point about the haiku is that its brevity`,
        choices: [`makes it easy for anyone to write`, `limits what the form can express`, `is a deliberate technique that creates meaning`, `was a constraint imposed by Japanese editors`],
        correct: 2,
        why: `The passage argues the haiku's brevity “is not a limitation but a discipline,” leaving space for the reader's response.`,
      },
      {
        q: `As used in the passage, “compression” most nearly means`,
        choices: [`squeezing much meaning into little space`, `pressing down physically`, `reducing quality`, `a sudden decrease in size`],
        correct: 0,
        why: `In context, “a study in compression” refers to packing significant meaning into very few syllables.`,
      },
    ],
  },
  {
    title: 'The Problem of Plastic in the Ocean',
    passage: `Each year, an estimated eight million tons of plastic enter the world's oceans, where they break into ever-smaller fragments. These microplastics are now found from the deepest trenches to Arctic ice, and they are consumed by marine life at every level of the food chain. The scale of the problem can feel overwhelming, but scientists point to encouraging signs: some countries have adopted bans on single-use plastics, cleanup technologies are improving, and research into biodegradable alternatives is accelerating. The authors of a recent review caution, however, that prevention — reducing plastic at its source — remains far more effective than cleanup, which can never fully keep pace with the rate of pollution.`,
    questions: [
      {
        q: `The passage suggests that the most effective response to plastic pollution is`,
        choices: [`expanding ocean cleanup operations`, `reducing plastic production at its source`, `improving biodegradable materials`, `encouraging consumers to recycle more`],
        correct: 1,
        why: `The review's authors argue “prevention — reducing plastic at its source — remains far more effective than cleanup.”`,
      },
      {
        q: `The author's tone in discussing the scale of the problem is best described as`,
        choices: [`dismissive`, `triumphant`, `measured`, `alarmed without hope`],
        correct: 2,
        why: `The author acknowledges the problem's scale (“overwhelming”) but balances it with encouraging signs and practical solutions — a measured tone.`,
      },
    ],
  },
  {
    title: 'A Note on Early Cartography',
    passage: `Before satellites and GPS, mapmakers had to stitch the known world together from travelers' reports, celestial observations, and more than a little guesswork. Medieval European maps were often more symbolic than accurate: Jerusalem sat at the center of many, and unknown regions were filled with imagined monsters. Yet these maps were not merely errors waiting to be corrected. They recorded the limits of geographic knowledge at a given moment and revealed what cultures valued — which routes mattered, which cities were sacred, which territories were contested. To read an old map, historians suggest, is to read the ambitions and anxieties of the society that drew it.`,
    questions: [
      {
        q: `The author's attitude toward medieval maps is best described as`,
        choices: [`dismissive of their inaccuracies`, `appreciative of their historical value`, `puzzled by their symbolism`, `amused by their imagined monsters`],
        correct: 1,
        why: `Rather than dismissing them as errors, the author argues old maps “revealed what cultures valued” — an appreciative stance.`,
      },
      {
        q: `Which choice best describes the function of the final sentence?`,
        choices: [`It introduces a new debate about map accuracy.`, `It summarizes the passage's central claim about old maps.`, `It criticizes modern mapmakers.`, `It suggests old maps should be discarded.`],
        correct: 1,
        why: `The final sentence crystallizes the passage's thesis: old maps reflect the society that created them.`,
      },
    ],
  },
  {
    title: 'The Rediscovery of the Quagga',
    passage: `For nearly a century, the quagga — a zebra-like mammal once common in South Africa — was known only through a handful of museum specimens and the vivid descriptions of early settlers. Hunted to extinction in the 1880s, the animal seemed destined to remain a footnote in natural history. Then, in the 1980s, a surprising discovery changed everything: DNA extracted from a century-old skin revealed that the quagga was not a distinct species, as had long been assumed, but a subspecies of the plains zebra. The finding reshaped scientific understanding of how the two animals were related and demonstrated that even degraded museum specimens could yield profound biological insights.`,
    questions: [
      {
        q: `Which choice best describes the function of the final sentence in the passage?`,
        choices: [`It introduces a new debate about the quagga's classification.`, `It emphasizes the broader significance of the DNA discovery.`, `It questions the reliability of museum specimens.`, `It suggests the quagga might not be extinct after all.`],
        correct: 1,
        why: `The final sentence moves from the specific finding to its wider implications, emphasizing how the discovery demonstrated the value of museum specimens — a broader point about scientific method.`,
      },
      {
        q: `As used in the passage, “profound” most nearly means`,
        choices: [`deep and far-reaching`, `mysterious and unexplained`, `temporary and fleeting`, `practical and useful`],
        correct: 0,
        why: `In context, “profound biological insights” refers to insights that are deep and far-reaching in significance.`,
      },
    ],
  },
  {
    title: 'The Value of Handwriting',
    passage: `In an age of keyboards and voice dictation, handwriting might seem like a fading skill. Yet a growing body of research suggests that the physical act of forming letters by hand plays a unique role in learning. Brain scans show that writing by hand activates regions involved in memory and comprehension more strongly than typing does. For students, this may mean that taking notes by hand — however laborious it feels — helps ideas stick. The research does not suggest abandoning keyboards, but it does remind us that older technologies sometimes carry hidden advantages.`,
    questions: [
      {
        q: `The author's attitude toward handwriting is best described as`,
        choices: [`dismissive`, `ambivalent`, `appreciative`, `indifferent`],
        correct: 2,
        why: `The author highlights handwriting's benefits for learning and calls it a skill with “hidden advantages,” revealing an appreciative attitude.`,
      },
      {
        q: `Which choice provides the best evidence for the answer to the previous question?`,
        choices: [`“handwriting might seem like a fading skill”`, `“writing by hand activates regions involved in memory”`, `“the research does not suggest abandoning keyboards”`, `“older technologies sometimes carry hidden advantages”`],
        correct: 3,
        why: `The phrase “hidden advantages” directly expresses the author's positive assessment of handwriting.`,
      },
    ],
  },
  {
    title: 'Urban Rooftop Gardens',
    passage: `On the rooftops of warehouses in Brooklyn, a quiet agricultural revolution is taking place. Rooftop farms, built on layers of lightweight soil, now supply fresh produce to restaurants and markets within miles of where the food is grown. Proponents point to clear benefits: shorter supply chains mean lower emissions from transport, and green rooftops absorb stormwater that might otherwise overwhelm city sewers. Critics, however, note that the startup costs are high and that rooftop farms cannot replace the scale of traditional agriculture. Even so, supporters argue, the value of these gardens lies less in replacing farms than in reimagining how cities use underutilized space.`,
    questions: [
      {
        q: `The main purpose of the passage is to`,
        choices: [`argue that rooftop farms should replace traditional agriculture`, `explain the benefits and limitations of rooftop farming`, `describe the history of farming in Brooklyn`, `criticize the high cost of urban development`],
        correct: 1,
        why: `The passage presents both the benefits (shorter supply chains, stormwater absorption) and the criticisms (high costs, limited scale), so its purpose is to explain both sides.`,
      },
      {
        q: `Which choice best describes the author's stance on rooftop gardens?`,
        choices: [`strongly opposed`, `cautiously supportive`, `entirely neutral`, `openly hostile`],
        correct: 1,
        why: `The author acknowledges criticisms but concludes that the gardens' value lies in “reimagining how cities use underutilized space” — a cautiously supportive stance.`,
      },
    ],
  },
  {
    title: 'Sleep and Memory',
    passage: `Psychologists have long known that sleep is essential for health, but its role in memory has only recently come into focus. Studies of students who study before sleeping show that they recall the material better the next day than those who stay up late reviewing. During deep sleep, researchers believe, the brain replays and consolidates the day's experiences, transferring them from short-term storage into long-term memory. This finding carries a practical lesson: pulling an all-nighter before an exam may be the least effective way to prepare for it.`,
    questions: [
      {
        q: `According to the passage, deep sleep helps memory by`,
        choices: [`erasing irrelevant information`, `replaying and consolidating experiences`, `increasing the time spent studying`, `reducing the need for review`],
        correct: 1,
        why: `The passage states that during deep sleep “the brain replays and consolidates the day's experiences, transferring them from short-term storage into long-term memory.”`,
      },
      {
        q: `The passage suggests that students who stay up late reviewing before an exam are likely to`,
        choices: [`perform better than their peers`, `recall the material more vividly`, `miss out on the memory benefits of sleep`, `remember unrelated facts more clearly`],
        correct: 2,
        why: `Because deep sleep is when memories are consolidated, sacrificing sleep to review means missing the consolidation process — the opposite of what the student intends.`,
      },
    ],
  },
  {
    title: 'The Color of Flamingos',
    passage: `Flamingos are not born pink. Chicks hatch with gray or white feathers and gradually turn pink as they mature. The color comes from carotenoid pigments in the algae and crustaceans that make up their diet; the birds metabolize these pigments and deposit them in their feathers. In zoos, keepers must carefully manage the flamingos' diet — supplementing it with pigment-rich foods — or the birds will fade to white. The flamingo's famous color, then, is not a fixed trait but a visible record of what it eats, a vivid illustration of how environment shapes even the most iconic of appearances.`,
    questions: [
      {
        q: `The main idea of the passage is that`,
        choices: [`flamingos are naturally white`, `a flamingo's color reflects its diet`, `zoos struggle to keep flamingos healthy`, `carotenoids are harmful to birds`],
        correct: 1,
        why: `The passage explains that flamingos get their pink color from pigments in their food — “a visible record of what it eats.”`,
      },
      {
        q: `As used in the passage, “iconic” most nearly means`,
        choices: [`religious`, `widely recognized and symbolic`, `newly discovered`, `easily hidden`],
        correct: 1,
        why: `“Iconic” means widely recognized and symbolic — the pink flamingo is an instantly recognizable symbol.`,
      },
    ],
  },
  {
    title: 'The Economics of Free Goods',
    passage: `Economists are often asked why internet services that appear to cost nothing are so profitable. The answer lies in a distinction that surprises many students: a price of zero is not the same as a value of zero. Firms give away a service to attract users, then convert that attention into revenue through advertising or by selling enhanced versions. The strategy succeeds because the marginal cost of serving one more user is nearly zero — the fixed costs of building the platform are enormous, but the cost of each additional user is trivial. Critics worry that such models concentrate power in firms that can subsidize losses indefinitely, driving competitors out of the market. Economists respond that as long as entry remains possible and users can switch freely, competition disciplines even the largest platforms.`,
    questions: [
      {
        q: `The primary purpose of the passage is to`,
        choices: [`criticize internet companies for deceptive pricing`, `explain how zero-price business models remain profitable`, `argue that economists misunderstand the internet`, `describe the history of online advertising`],
        correct: 1,
        why: `The passage explains the economics behind free services — the marginal-cost logic and the attention model — rather than criticizing, arguing, or narrating history.`,
      },
      {
        q: `As used in the passage, “discipline” most nearly means`,
        choices: [`punish`, `regulate by law`, `constrain through competitive pressure`, `teach good behavior`],
        correct: 2,
        why: `In context, competition “disciplines” large platforms by constraining their behavior — if they abuse users, those users can switch to rivals.`,
      },
      {
        q: `Which choice best describes the author\'s stance toward the critics\' concern?`,
        choices: [`It is valid but the author offers a counterargument.`, `It is dismissed as entirely unfounded.`, `It is ignored in favor of market data.`, `It is endorsed without qualification.`],
        correct: 0,
        why: `The author states the critics' worry, then immediately presents the economists' counterargument about competition, so the concern is taken seriously but answered.`,
      },
    ],
  },
  {
    title: 'The Puzzle of the Cosmic Microwave Background',
    passage: `In 1964, two engineers at Bell Labs detected a faint hiss of radio noise that would not go away, no matter where they pointed their antenna. They had stumbled onto the cosmic microwave background — the afterglow of the Big Bang, stretched and cooled over nearly fourteen billion years until it became a whisper of radiation at 2.7 kelvin. The discovery was accidental, but its implications were anything but. The existence of this radiation had been predicted, and its precise temperature matched theoretical expectations so closely that it converted the Big Bang from one hypothesis among many into the dominant account of cosmic origins. Yet the story also illustrates a quieter lesson: the engineers were not looking for the background at all, and their willingness to investigate an anomaly rather than dismiss it changed the course of cosmology.`,
    questions: [
      {
        q: `The author uses the example of the engineers to make the point that`,
        choices: [`scientific breakthroughs are rarely predicted by theory`, `investigating unexplained anomalies can lead to major discoveries`, `Bell Labs funded too little pure research`, `the Big Bang theory remains unproven`],
        correct: 1,
        why: `The passage's final sentence draws the explicit lesson: pursuing the anomaly, rather than dismissing it, transformed cosmology.`,
      },
      {
        q: `According to the passage, the significance of the background radiation\'s temperature was that it`,
        choices: [`proved the engineers had made an error`, `matched theoretical predictions and strengthened the Big Bang account`, `showed the universe was older than expected`, `contradicted all existing models`],
        correct: 1,
        why: `The passage says the temperature “matched theoretical expectations so closely that it converted the Big Bang … into the dominant account.”`,
      },
      {
        q: `The author\'s tone is best described as`,
        choices: [`skeptical of modern cosmology`, `celebratory but analytical`, `dismissive of engineering work`, `neutral to the point of detachment`],
        correct: 1,
        why: `The author celebrates the discovery's significance while analyzing its causes and implications — a celebratory but analytical tone.`,
      },
    ],
  },
  {
    title: "The Composer's Craft",
    passage: `When audiences marvel at the soaring melodies of a symphony, they rarely consider the labor beneath the surface. Composers routinely revise a single phrase dozens of times, discarding passages that sound effortless in favor of those that took weeks to perfect. The notebooks of great composers are filled with crossed-out bars and marginal notes — evidence that inspiration is often the reward of persistence rather than its cause. Understanding this can change how we listen: the music we find most natural is frequently the product of the most painstaking craft.`,
    questions: [
      {
        q: `The author uses the composers' notebooks as evidence that`,
        choices: [`composers rarely make changes to their work`, `inspiration typically follows sustained effort`, `symphonies are written quickly`, `audiences appreciate technical skill`],
        correct: 1,
        why: `The notebooks, filled with revisions, support the author's claim that “inspiration is often the reward of persistence rather than its cause.”`,
      },
      {
        q: `Which choice best summarizes the passage's central claim?`,
        choices: [`Great music sounds effortless because composers hide their work.`, `The appearance of effortlessness in music is usually the result of extensive labor.`, `Audiences should study composers' notebooks before attending concerts.`, `Most composers find writing music easy and quick.`],
        correct: 1,
        why: `The passage argues that the most “natural”-sounding music is often the product of the most painstaking craft.`,
      },
    ],
  },
  {
    title: 'The Return of the American Chestnut',
    passage: `The American chestnut once dominated eastern forests, with billions of trees stretching from Maine to Georgia. Then, in 1904, a fungal blight imported on nursery stock swept through, and within fifty years the species had been reduced to sprouts that died before reaching maturity. For decades, the tree seemed doomed. Today, a coalition of scientists is fighting back using a technique called backcross breeding: crossing surviving chestnuts with a blight-resistant Asian species, then breeding the offspring with American chestnuts again to recover the native traits. After several generations, the most resistant hybrids are planted in test forests. The program is painstaking — a single generation can take a decade — but supporters point out that the project is less about speed than about restoring a species that shaped an entire ecosystem.`,
    questions: [
      {
        q: `The author's primary purpose is to`,
        choices: [`explain how a fungal blight destroyed American chestnut trees`, `describe an effort to restore the American chestnut`, `criticize the importation of foreign plants`, `compare two species of chestnut`],
        correct: 1,
        why: `The passage moves from the blight's devastation to the backcross-breeding restoration program — the restoration is the central subject.`,
      },
      {
        q: `As used in the passage, “painstaking” most nearly means`,
        choices: [`requiring great care and effort`, `causing physical discomfort`, `highly publicized`, `quick and efficient`],
        correct: 0,
        why: `The program's multi-generational process that “can take a decade” shows that painstaking means requiring great care and effort.`,
      },
      {
        q: `Which choice best describes the function of the final sentence?`,
        choices: [`It concedes that the restoration may fail.`, `It reframes the project's slow pace as part of a larger goal.`, `It introduces a new rival to backcross breeding.`, `It suggests the chestnut is beyond saving.`],
        correct: 1,
        why: `The final sentence turns the objection about slowness into a point about restoring an ecosystem — the program's broader purpose.`,
      },
    ],
  },
  {
    title: 'The Suffragette Press',
    passage: `When the campaign for women's suffrage reached its peak in Britain in the early twentieth century, newspapers played an unexpected role: they were weapons. Suffragists founded dozens of their own publications, from the dignified weekly Votes for Women to the militant The Suffragette, which was repeatedly shut down by the authorities only to reappear under a new name. The papers did more than report events; they created a community. Readers in distant towns learned of meetings, shared strategies, and — crucially — saw themselves reflected in a movement that the mainstream press often mocked or ignored. When the government seized a printing press, supporters pooled money to buy another within weeks. The publications were so effective that Parliament eventually passed laws specifically to suppress them, an ironic tribute to their power.`,
    questions: [
      {
        q: `The author suggests that the suffrage newspapers were especially valuable because they`,
        choices: [`were the first newspapers run entirely by women`, `gave supporters a sense of belonging and shared purpose`, `forced Parliament to change its laws`, `outsold the mainstream press`],
        correct: 1,
        why: `The passage says the papers “created a community” and let readers “see themselves reflected” in the movement — a sense of belonging and shared purpose.`,
      },
      {
        q: `The phrase “an ironic tribute to their power” refers to the fact that`,
        choices: [`the authorities admired the newspapers' quality`, `Parliament responded to the newspapers by passing laws against them`, `the newspapers were repeatedly shut down by accident`, `supporters bought new presses with pooled money`],
        correct: 1,
        why: `Parliament's decision to pass laws specifically against the papers shows how effective — and therefore threatening — they had become.`,
      },
      {
        q: `The author's tone toward the newspapers is best described as`,
        choices: [`dismissive`, `admiring`, `neutral`, `critical`],
        correct: 1,
        why: `Details such as “an unexpected role,” “created a community,” and “an ironic tribute to their power” convey clear admiration.`,
      },
    ],
  },
  {
    title: 'The Placebo Effect',
    passage: `For decades, the placebo effect was treated as a nuisance: a control that researchers had to subtract from their results. That view has begun to change. Studies show that a sugar pill can produce measurable changes in pain, mood, and even immune response — and that the effect is not purely psychological in the dismissive sense. Brain imaging reveals that placebos can trigger the release of the body's own painkillers, the endorphins, much as real drugs do. The effect even has a dose-response relationship: two placebo pills work better than one, and a placebo injection works better than a placebo pill. None of this means that treatments themselves are unimportant, researchers stress. It means that expectation is a biological variable — one that well-designed medicine must learn to harness rather than merely filter out.`,
    questions: [
      {
        q: `The main idea of the passage is that the placebo effect`,
        choices: [`is purely imaginary and should be ignored`, `has real biological effects that deserve study`, `works only for pain`, `is stronger than any real medication`],
        correct: 1,
        why: `The passage argues that placebos produce measurable biological changes, making expectation “a biological variable” that deserves study.`,
      },
      {
        q: `The passage mentions the dose-response relationship in order to show that`,
        choices: [`placebos can cure serious illness`, `the placebo effect behaves like a genuine biological phenomenon`, `patients should receive larger placebo doses`, `endorphins are released by all medications`],
        correct: 1,
        why: `The fact that larger placebos work better mimics the behavior of real drugs, supporting the claim that the effect is biological rather than imaginary.`,
      },
      {
        q: `As used in the passage, “harness” most nearly means`,
        choices: [`put to use`, `restrain`, `ignore`, `measure`],
        correct: 0,
        why: `The passage argues that medicine should learn to “harness” expectation — to put it to use deliberately rather than filter it out.`,
      },
    ],
  },
  {
    title: 'The Lantern Keeper',
    passage: `Every evening at dusk, the old man climbed the hill to the lighthouse and lit the lamp, just as his father had done and his father before that. The town no longer needed the light — shipping lanes had shifted decades ago — but the keeper kept his ritual all the same. Tourists sometimes asked why he bothered, and he would smile and say the light was for the ships that remembered the way home. One evening, a storm knocked out the power on the new electronic beacon across the bay. In the darkness, the town looked up and saw the old flame burning steady on the hill, and for a moment no one needed to ask why the keeper had kept it lit all those years.`,
    questions: [
      {
        q: `The keeper's answer to the tourists suggests that he`,
        choices: [`believes the lighthouse still guides real ships`, `values the ritual more than its practical purpose`, `resents the tourists' questions`, `wants the town to fund the lighthouse`],
        correct: 1,
        why: `His answer — that the light is for “ships that remembered the way home” — reveals that the ritual's meaning matters more to him than its function.`,
      },
      {
        q: `The final sentence most strongly suggests that`,
        choices: [`the town will replace the electronic beacon`, `the keeper's dedication proved meaningful`, `the tourists were right to ask questions`, `the old lighthouse will be closed`],
        correct: 1,
        why: `When the modern beacon fails, the keeper's light is the one that serves the town — his years of devotion are vindicated.`,
      },
      {
        q: `The author's attitude toward the keeper is best described as`,
        choices: [`condescending`, `admiring`, `indifferent`, `skeptical`],
        correct: 1,
        why: `The respectful treatment of the keeper's devotion, culminating in the storm scene, conveys unmistakable admiration.`,
      },
    ],
  },
];

function vocabQuestion() { return vocabInContext(); }

function grammarQuestion() {
  // mix the 5 interactive templates with the 3 sentence-revision banks
  const t = Math.random() < 0.6 ? pick(GRAMMAR_TEMPLATES) : pick([TENSE_TEMPLATES, WORDINESS_TEMPLATES, COMBINING_TEMPLATES]);

  if (t.build) {
    const built = t.build();
    const choices = uniqueChoices(built.correct, built.choices.filter((c) => c !== built.correct));
    return {
      id: hashId('grammar' + built.stem),
      section: 'reading',
      topic: t.topic,
      difficulty: t.difficulty,
      prompt: built.stem,
      choices,
      correctIndex: choices.indexOf(built.correct),
      explanation: built.explanation,
    };
  }

  // sentence-revision banks (array of { good, bad, why })
  const pick2 = t[Math.floor(Math.random() * t.length)];
  const choices = uniqueChoices(pick2.good, [pick2.bad]);
  return {
    id: hashId('grammar' + pick2.good),
    section: 'reading',
    topic: 'grammar-usage',
    difficulty: 3,
    prompt: `Which version of the sentence is most clear and correct?`,
    choices,
    correctIndex: choices.indexOf(pick2.good),
    explanation: pick2.why,
  };
}

function transitionQuestion() {
  const t = pick(TRANSITIONS);
  const prompt = t.prefix.replace('______', '________');
  const choices = uniqueChoices(t.good, t.wrongs);
  return {
    id: hashId('transition' + t.prefix),
    section: 'reading',
    topic: 'transitions',
    difficulty: 2,
    prompt: `Which choice completes the text with the most logical transition?\n\n“${t.prefix}”`,
    choices,
    correctIndex: choices.indexOf(t.good),
    explanation: t.why,
  };
}

function passageQuestion() {
  const passage = pick(PASSAGES);
  const q = pick(passage.questions);
  const correctText = q.choices[q.correct];
  const choices = uniqueChoices(correctText, q.choices.filter((c) => c !== correctText));
  return {
    id: hashId('passage' + passage.title + q.q),
    section: 'reading',
    topic: 'reading-comprehension',
    difficulty: 3,
    prompt: `${passage.title}\n\n${passage.passage}\n\n${q.q}`,
    choices,
    correctIndex: choices.indexOf(correctText),
    explanation: q.why,
    passageTitle: passage.title,
  };
}

module.exports = function readingQuestion() {
  const factories = [easyVocabQuestion, vocabQuestion, hardVocabQuestion, grammarQuestion, transitionQuestion, passageQuestion, passageQuestion];
  return pick(factories)();
};
