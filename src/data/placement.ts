import type { Level } from "./levels";

/**
 * A placement question, in the three formats the exam can fairly assess.
 *
 * `speak` is deliberately absent. Asking for microphone permission during
 * onboarding -- before the learner has any reason to grant it -- and then
 * having a denial make the question unanswerable is the wrong trade for an
 * exam that sets someone's whole course; the typing fallback that rescues a
 * speaking question inside a lesson would here be assessing writing while
 * claiming to assess speaking. That is a product decision, recorded in
 * docs/superpowers/plans/2026-09-24-placement-question-types.md so it can be
 * overturned knowingly.
 *
 * Unlike lesson content, these ids are NOT review-item keys (review keys are
 * `lessonId:questionId`), and the id-parity baseline covers only `byLevel`,
 * not the placement pool -- so entries here can be edited and reordered
 * freely.
 */
export type PlacementQuestion = { id: string; level: Level } & (
  | { type: "mc"; prompt: string; choices: string[]; answer: number }
  | {
      type: "listening";
      prompt: string;
      /** Spoken via TTS. Shown as text when the browser cannot speak -- an
       *  unanswerable placement question mis-places the learner downward. */
      audioText: string;
      choices: string[];
      /** The correct choice's TEXT, matching the lesson player's variant. */
      answer: string;
    }
  | { type: "translate"; prompt: string; acceptableAnswers: string[] }
);

/**
 * Question pool per CEFR band — 9 candidates per band, 3 sampled at random
 * per attempt (see pickPlacementSet). Bands stay ordered easiest -> hardest
 * within themselves for readability; sampling order is band-major, so a
 * retaken test still progresses A1 -> C1 even though the specific
 * questions shown differ each time.
 */
export const PLACEMENT_QUESTIONS: PlacementQuestion[] = [
  {
    id: "p1",
    level: "A1",
    type: "mc",
    prompt: "She ___ a teacher.",
    choices: ["are", "is", "be", "am"],
    answer: 1,
  },
  {
    id: "p2",
    level: "A1",
    type: "mc",
    prompt: "Choose the most formal greeting:",
    choices: ["Hey", "Hi there", "Good morning", "What's up"],
    answer: 2,
  },
  {
    id: "p3",
    level: "A1",
    type: "mc",
    prompt: "They ___ tea in the afternoon.",
    choices: ["drinks", "drinking", "drink", "drank"],
    answer: 2,
  },
  {
    id: "p1b",
    level: "A1",
    type: "mc",
    prompt: "They ___ from Canada.",
    choices: ["is", "am", "are", "be"],
    answer: 2,
  },
  {
    id: "p2b",
    level: "A1",
    type: "mc",
    prompt: "___ does this word mean?",
    choices: ["What", "Whose", "Which", "Who"],
    answer: 0,
  },
  {
    id: "p3b",
    level: "A1",
    type: "mc",
    prompt: "He ___ a big house.",
    choices: ["have", "has", "having", "is having"],
    answer: 1,
  },
  {
    id: "p1c",
    level: "A1",
    type: "mc",
    prompt: "This is ___ book.",
    choices: ["I", "my", "me", "mine"],
    answer: 1,
  },
  {
    id: "p2c",
    level: "A1",
    type: "mc",
    prompt: "We ___ students.",
    choices: ["is", "am", "are", "be"],
    answer: 2,
  },
  {
    id: "p3c",
    level: "A1",
    type: "mc",
    prompt: "It is late at night and you are going to bed. Choose the correct farewell:",
    choices: ["Good night", "Good morning", "Good afternoon", "Hello again"],
    answer: 0,
  },

  {
    id: "p4",
    level: "A2",
    type: "mc",
    prompt: "We ___ to Rome last summer.",
    choices: ["go", "gone", "went", "going"],
    answer: 2,
  },
  {
    id: "p5",
    level: "A2",
    type: "mc",
    prompt: "This bag is ___ than that one.",
    choices: ["cheap", "cheaper", "cheapest", "more cheap"],
    answer: 1,
  },
  {
    id: "p6",
    level: "A2",
    type: "mc",
    prompt: "The parcel was sent ___ courier.",
    choices: ["by", "on", "for", "of"],
    answer: 0,
  },
  {
    id: "p4b",
    level: "A2",
    type: "mc",
    prompt: "Yesterday she ___ her homework before dinner.",
    choices: ["finish", "finished", "finishing", "finishes"],
    answer: 1,
  },
  {
    id: "p5b",
    level: "A2",
    type: "mc",
    prompt: "There ___ a lot of people at the party last night.",
    choices: ["were", "is", "be", "been"],
    answer: 0,
  },
  {
    id: "p6b",
    level: "A2",
    type: "mc",
    prompt: "I'm going to ___ a new car next year.",
    choices: ["buy", "bought", "buying", "buys"],
    answer: 0,
  },
  {
    id: "p4c",
    level: "A2",
    type: "mc",
    prompt: "He plays football ___ Sundays.",
    choices: ["in", "at", "on", "by"],
    answer: 2,
  },
  {
    id: "p5c",
    level: "A2",
    type: "mc",
    prompt: "This is the ___ film I've ever seen.",
    choices: ["good", "better", "best", "most good"],
    answer: 2,
  },
  {
    id: "p6c",
    level: "A2",
    type: "mc",
    prompt: "___ you ever been to Spain?",
    choices: ["Do", "Did", "Have", "Are"],
    answer: 2,
  },

  {
    id: "p7",
    level: "B1",
    type: "mc",
    prompt: "If the train is late, we ___ a taxi.",
    choices: ["took", "will take", "would take", "have taken"],
    answer: 1,
  },
  {
    id: "p8",
    level: "B1",
    type: "mc",
    prompt: "I am thinking of ___ a new laptop.",
    choices: ["buy", "buying", "bought", "be buying"],
    answer: 1,
  },
  {
    id: "p9",
    level: "B1",
    type: "mc",
    prompt: '"In case" means:',
    choices: ["because of", "as a precaution", "instead of", "as soon as"],
    answer: 1,
  },
  {
    id: "p7b",
    level: "B1",
    type: "mc",
    prompt: "By the time we arrived, the film ___.",
    choices: ["already started", "had already started", "has already started", "already starts"],
    answer: 1,
  },
  {
    id: "p8b",
    level: "B1",
    type: "mc",
    prompt: "She's the woman ___ car was stolen.",
    choices: ["who", "which", "whose", "that"],
    answer: 2,
  },
  {
    id: "p9b",
    level: "B1",
    type: "mc",
    prompt: "You ___ smoke in here, it's not allowed.",
    choices: ["don't have to", "mustn't", "needn't", "might not"],
    answer: 1,
  },
  {
    id: "p7c",
    level: "B1",
    type: "mc",
    prompt: "I used to ___ swimming every weekend.",
    choices: ["go", "going", "went", "goes"],
    answer: 0,
  },
  {
    id: "p8c",
    level: "B1",
    type: "mc",
    prompt: '"Although" introduces:',
    choices: ["a reason", "a contrast", "a condition", "a result"],
    answer: 1,
  },
  {
    id: "p9c",
    level: "B1",
    type: "mc",
    prompt: "He asked me ___ I was ready.",
    choices: ["that", "if", "what", "so"],
    answer: 1,
  },

  {
    id: "p10",
    level: "B2",
    type: "mc",
    prompt: "The road is ___ resurfaced at the moment.",
    choices: ["been", "be", "being", "was"],
    answer: 2,
  },
  {
    id: "p11",
    level: "B2",
    type: "mc",
    prompt: "___ the delay, the audience stayed.",
    choices: ["Although", "Despite", "However", "Whereas"],
    answer: 1,
  },
  {
    id: "p12",
    level: "B2",
    type: "mc",
    prompt: "Demand fell; ___, output was cut.",
    choices: ["accordingly", "whereas", "despite", "although"],
    answer: 0,
  },
  {
    id: "p10b",
    level: "B2",
    type: "mc",
    prompt: "Last week she said she ___ the report by Friday.",
    choices: ["would finish", "finishing", "had finish", "finishes"],
    answer: 0,
  },
  {
    id: "p11b",
    level: "B2",
    type: "mc",
    prompt: 'Most formal way to say "a lot of growth":',
    choices: ["tons of growth", "loads of growth", "substantial growth", "big growth"],
    answer: 2,
  },
  {
    id: "p12b",
    level: "B2",
    type: "mc",
    prompt: '"Nevertheless" is used to:',
    choices: ["give a reason", "concede a point and then continue", "add an example", "conclude"],
    answer: 1,
  },
  {
    id: "p10c",
    level: "B2",
    type: "mc",
    prompt: "If I had known, I ___ differently.",
    choices: ["would act", "would have acted", "will act", "acted"],
    answer: 1,
  },
  {
    id: "p11c",
    level: "B2",
    type: "mc",
    prompt: "The report is ___ to be published next week.",
    choices: ["expect", "expecting", "expected", "expects"],
    answer: 2,
  },
  {
    id: "p12c",
    level: "B2",
    type: "mc",
    prompt: '"Hence" is closest in meaning to:',
    choices: ["therefore", "however", "meanwhile", "although"],
    answer: 0,
  },

  {
    id: "p13",
    level: "C1",
    type: "mc",
    prompt: "Not only ___ the deadline, but they also went over budget.",
    choices: ["did they miss", "they missed", "they did miss", "they miss"],
    answer: 0,
  },
  {
    id: "p14",
    level: "C1",
    type: "mc",
    prompt: "That claim does not stand up to ___.",
    choices: ["scrutiny", "attention", "notice", "view"],
    answer: 0,
  },
  {
    id: "p15",
    level: "C1",
    type: "mc",
    prompt: "Which sentence is the least nominalised?",
    choices: [
      "The committee required a reduction in expenditure",
      "The committee spent less",
      "Expenditure reduction was a committee requirement",
      "The requirement for the reduction of expenditure",
    ],
    answer: 1,
  },
  {
    id: "p13b",
    level: "C1",
    type: "mc",
    prompt: '"To play devil\'s advocate" means to:',
    choices: [
      "cause trouble deliberately",
      "argue a position you may not hold, to test it",
      "cheat in a game",
      "act innocent",
    ],
    answer: 1,
  },
  {
    id: "p14b",
    level: "C1",
    type: "mc",
    prompt: "She took the setback in her ___ and carried on.",
    choices: ["stride", "step", "pace", "march"],
    answer: 0,
  },
  {
    id: "p15b",
    level: "C1",
    type: "mc",
    prompt: "Which sentence best avoids a dangling modifier?",
    choices: [
      "Walking to the store, the rain started.",
      "Walking to the store, I got caught in the rain.",
      "While walking to the store, the rain soaked my shoes.",
      "Having walked to the store, the rain stopped.",
    ],
    answer: 1,
  },
  {
    id: "p13c",
    level: "C1",
    type: "mc",
    prompt: '"Notwithstanding" is closest in meaning to:',
    choices: ["because of", "despite", "in addition to", "as a result of"],
    answer: 1,
  },
  {
    id: "p14c",
    level: "C1",
    type: "mc",
    prompt: 'Best formal alternative to "a big problem":',
    choices: ["a huge issue", "a significant challenge", "a massive headache", "a really big deal"],
    answer: 1,
  },
  {
    id: "p15c",
    level: "C1",
    type: "mc",
    prompt: "Which uses hedging appropriately in academic writing?",
    choices: [
      "This proves the theory is correct.",
      "This suggests the theory may be correct.",
      "Everyone knows this theory is correct.",
      "This is obviously correct.",
    ],
    answer: 1,
  },
  // --- Listening (added with phase 5) ---------------------------------
  // Two per band, four options each. Every distractor is one word or one
  // inflection from the answer, so the question cannot be passed by
  // spotting a topic word -- in an exam a word-spottable question inflates
  // the band and starts the learner on content they cannot do.
  //
  // These are NOT shown when the browser has no speech synthesis: the
  // session filters them out (see startSession). The sentence IS the
  // answer, so printing it as a fallback -- which is what the lesson
  // player does, where the cost is one heart -- would hand the learner
  // every listening question for free and inflate their placement.
  {
    id: "p50",
    level: "A1",
    type: "listening",
    prompt: "What did you hear?",
    audioText: "The shop shuts at six.",
    choices: [
      "The shop shuts at six.",
      "The shop shuts at seven.",
      "The shop shuts at five.",
      "The shop opens at six.",
    ],
    answer: "The shop shuts at six.",
  },
  {
    id: "p51",
    level: "A1",
    type: "listening",
    prompt: "What did you hear?",
    audioText: "I have lost my umbrella.",
    choices: [
      "I have lost my umbrella.",
      "I have lost my umbrellas.",
      "I have found my umbrella.",
      "He has lost my umbrella.",
    ],
    answer: "I have lost my umbrella.",
  },
  {
    id: "p52",
    level: "A2",
    type: "listening",
    prompt: "What did you hear?",
    audioText: "They stayed at a hotel near the beach.",
    choices: [
      "They stayed at a hotel near the beach.",
      "They stayed at a hostel near the beach.",
      "They stay at a hotel near the beach.",
      "We stayed at a hotel near the beach.",
    ],
    answer: "They stayed at a hotel near the beach.",
  },
  {
    id: "p53",
    level: "A2",
    type: "listening",
    prompt: "What did you hear?",
    audioText: "He has not sent the invoice yet.",
    choices: [
      "He has not sent the invoice yet.",
      "He has not signed the invoice yet.",
      "He has sent the invoice already.",
      "She has not sent the invoice yet.",
    ],
    answer: "He has not sent the invoice yet.",
  },
  {
    id: "p54",
    level: "B1",
    type: "listening",
    prompt: "What did you hear?",
    audioText: "The exam was easier than I remembered.",
    choices: [
      "The exam was easier than I remembered.",
      "The exam was easier than I expected.",
      "The exams were easier than I remembered.",
      "The exam was harder than I remembered.",
    ],
    answer: "The exam was easier than I remembered.",
  },
  {
    id: "p55",
    level: "B1",
    type: "listening",
    prompt: "What did you hear?",
    audioText: "She is thinking about applying for the post.",
    choices: [
      "She is thinking about applying for the post.",
      "He is thinking about applying for the post.",
      "She is thinking about applying for the course.",
      "She was thinking about applying for the post.",
    ],
    answer: "She is thinking about applying for the post.",
  },
  {
    id: "p56",
    level: "B2",
    type: "listening",
    prompt: "What did you hear?",
    audioText: "The results seem to confirm the earlier estimate.",
    choices: [
      "The results seem to confirm the earlier estimate.",
      "The results seem to confirm the earlier estimates.",
      "The result seems to confirm the earlier estimate.",
      "The results seem to question the earlier estimate.",
    ],
    answer: "The results seem to confirm the earlier estimate.",
  },
  {
    id: "p57",
    level: "B2",
    type: "listening",
    prompt: "What did you hear?",
    audioText: "She insisted the error was not hers.",
    choices: [
      "She insisted the error was not hers.",
      "She insisted the error was not ours.",
      "He insisted the error was not hers.",
      "She admitted the error was not hers.",
    ],
    answer: "She insisted the error was not hers.",
  },
  {
    id: "p58",
    level: "C1",
    type: "listening",
    prompt: "What did you hear?",
    audioText: "The account is plausible but largely unverified.",
    choices: [
      "The account is plausible but largely unverified.",
      "The account is plausible but largely unverifiable.",
      "The account is possible but largely unverified.",
      "The accounts are plausible but largely unverified.",
    ],
    answer: "The account is plausible but largely unverified.",
  },
  {
    id: "p59",
    level: "C1",
    type: "listening",
    prompt: "What did you hear?",
    audioText: "His conclusion depends on a questionable premise.",
    choices: [
      "His conclusion depends on a questionable premise.",
      "His conclusion depends on a questionable promise.",
      "His conclusions depend on a questionable premise.",
      "Her conclusion depends on a questionable premise.",
    ],
    answer: "His conclusion depends on a questionable premise.",
  },
  // --- Translation (added with phase 5) -------------------------------
  // One per band. Graded like every other translation: the curated
  // wordings decide it locally, and only what they reject is put to the
  // AI grader -- so an unusual-but-valid answer does not mis-place
  // someone, and a vendor being down does not either.
  {
    id: "p60",
    level: "A1",
    type: "translate",
    prompt: "Say hello to someone at the start of the day.",
    acceptableAnswers: ["Good morning.", "Morning.", "Good morning to you."],
  },
  {
    id: "p61",
    level: "A2",
    type: "translate",
    prompt: "Ask whether the museum is open on Sundays.",
    acceptableAnswers: [
      "Is the museum open on Sundays?",
      "Is the museum open on Sunday?",
      "Does the museum open on Sundays?",
    ],
  },
  {
    id: "p62",
    level: "B1",
    type: "translate",
    prompt: "Say that it all depends on how much time you have.",
    acceptableAnswers: [
      "It depends how much time we have.",
      "It depends on the time available.",
      "That depends how much time there is.",
      "It depends on how much time I have.",
      "It all depends on how much time I have.",
      "It all depends on how much time we have.",
      "That depends on how much time I have.",
      "It depends how much time I have.",
    ],
  },
  {
    id: "p63",
    level: "B2",
    type: "translate",
    prompt: "Make clear the team is free to turn the offer down.",
    acceptableAnswers: [
      "We are under no obligation to accept it.",
      "We do not have to accept it.",
      "There is no obligation to accept.",
    ],
  },
  {
    id: "p64",
    level: "C1",
    type: "translate",
    prompt: "Concede a point but keep your own position, idiomatically.",
    acceptableAnswers: [
      "That may be true, but I still think otherwise.",
      "Fair enough, though I would still disagree.",
      "I take your point, but I stand by my view.",
    ],
  },
];

export const PLACEMENT_ORDER: Level[] = ["A1", "A2", "B1", "B2", "C1"];

/**
 * Randomly samples 3 questions per CEFR band from the pool, in band order
 * (A1 -> C1). Called once per placement-test attempt so retaking the test
 * shows a different set of 15 questions instead of the same fixed 15 every
 * time. scorePlacement() only needs correctByLevel, so it's agnostic to
 * which 3 questions per band were shown.
 */
/**
 * Drops listening questions when the device has no speech synthesis.
 *
 * It lives HERE, next to the sampler, rather than in the route, because the
 * order matters and only this file can enforce it: filtering has to happen
 * BEFORE the 3-per-band draw. Filter afterwards and a band whose draw happened
 * to include both of its listening questions is left with one question -- and a
 * band needs 2 correct out of 3, so that band cannot be passed at all, however
 * well the learner does. It truncates their placement at the band below. The
 * odds are not negligible: C(2,2)*C(10,1)/C(12,3) = 4.5% per band, so about one
 * no-audio attempt in five loses a band this way.
 *
 * Why filter rather than fall back to printing the sentence, which is what the
 * lesson player does: a placement listening question's sentence IS its correct
 * answer, so printing it hands out a free mark on every listening question
 * drawn, and two free marks take a whole band. An exam that measures nothing
 * and then places someone in B1 is worse than one that measures less -- they
 * start on content they cannot do. Removing the questions costs coverage
 * instead, which is the cheaper loss: each band still holds nine
 * multiple-choice and one translation candidate, so three are still drawn.
 */
export function playablePool(
  pool: PlacementQuestion[],
  canPlayAudio: boolean,
): PlacementQuestion[] {
  if (canPlayAudio) return pool;
  return pool.filter((q) => q.type !== "listening");
}

export function pickPlacementSet(
  pool: PlacementQuestion[] = PLACEMENT_QUESTIONS,
): PlacementQuestion[] {
  const picked: PlacementQuestion[] = [];
  for (const lvl of PLACEMENT_ORDER) {
    const candidates = pool.filter((q) => q.level === lvl);
    // Fisher-Yates, not `sort(() => Math.random() - 0.5)`. That comparator is
    // not a shuffle: V8 uses insertion sort below 23 elements, so items stay
    // near where they started -- measured at ~13.8% draw rate for the
    // listening entries against a fair 16.7%, purely because they are appended
    // at the end of the pool. The bias ran against exactly the new content.
    const shuffled = [...candidates];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    picked.push(...shuffled.slice(0, 3));
  }
  return picked;
}

/**
 * A band is passed with at least this many of its three questions correct. The one definition of
 * "passed": scorePlacement counts bands with it, and resolveBand uses it to decide whether the band
 * after a skip held up -- if the two disagreed, a band could be "failed" for one and "passed" for the other.
 */
export const PLACEMENT_PASS_MARK = 2;

/**
 * A band is "passed" when at least PLACEMENT_PASS_MARK (2) of its 3 questions
 * are correct. Placement = highest consecutively passed band, or the next band
 * up when every band is passed.
 */
export function scorePlacement(correctByLevel: Record<Level, number>): {
  level: Level;
  passed: Level[];
} {
  const passed: Level[] = [];
  for (const lvl of PLACEMENT_ORDER) {
    if ((correctByLevel[lvl] ?? 0) >= PLACEMENT_PASS_MARK) passed.push(lvl);
    else break;
  }
  if (passed.length === 0) return { level: "A1", passed };
  const last = passed[passed.length - 1];
  const idx = PLACEMENT_ORDER.indexOf(last);
  // placed into the band after the last one fully passed (capped at C1)
  const next = PLACEMENT_ORDER[Math.min(idx + 1, PLACEMENT_ORDER.length - 1)];
  return { level: next, passed };
}

/** Groups an already-sampled placement set (e.g. from pickPlacementSet) by CEFR band, in PLACEMENT_ORDER. */
export function groupByBand(questions: PlacementQuestion[]): Record<Level, PlacementQuestion[]> {
  const grouped = { A1: [], A2: [], B1: [], B2: [], C1: [] } as Record<Level, PlacementQuestion[]>;
  for (const q of questions) grouped[q.level].push(q);
  return grouped;
}

export type AdaptiveBandDecision = {
  /** True when the test should end here -- no further bands get tested. */
  stop: boolean;
  /** A band that gets synthetic pass credit without being shown to the learner. */
  skipped: Level | null;
  /** Which PLACEMENT_ORDER index to test next (meaningless when stop is true). */
  nextIdx: number;
};

/**
 * V4 pkg 3 -- adaptive band sequencing. Modeled on V3 pkg 4b's
 * pickReinforcementQuestion "doingWell" skew (bank-engine.ts): pool/path
 * selection driven by running accuracy instead of a fixed order. That
 * function skews which *question pool* to draw from; this data's only
 * real difficulty axis is the CEFR band itself (no per-question
 * difficulty tag exists), so here "harder if doing well, easier if not"
 * is expressed as skipping or stopping bands rather than picking within
 * one.
 *
 * - Every question wrong in a band (or the band has no candidates at
 *   all): stop testing further bands immediately -- there's no value
 *   grinding a beginner through B2/C1 material they have ~0 chance at.
 * - Every question right in a band, AND a real band still exists two
 *   steps ahead with actual content: skip the immediately-next band
 *   (synthetic pass credit, never shown to the learner) and resume
 *   testing from the one after it. The "two steps ahead has content"
 *   guard means a skip only ever happens when there is a real band to
 *   test next -- it never grants free credit right before the test would
 *   otherwise end, and the final band (C1) can only ever be earned by
 *   answering real C1 questions, never awarded as a skip target. That
 *   guard only guarantees something is TESTED afterwards, not that it is
 *   PASSED: the credit is a bet that the learner will pass that next
 *   band, and resolveBand (below) is what settles it. Callers use
 *   resolveBand, not this, to move between bands.
 * - Anything else (partial credit): advance to the very next band as
 *   normal -- ambiguous performance always gets a real test.
 */
export function nextAdaptiveBand(
  bandPool: Record<Level, PlacementQuestion[]>,
  currentIdx: number,
  correctInBand: number,
): AdaptiveBandDecision {
  const last = PLACEMENT_ORDER.length - 1;
  const bandSize = bandPool[PLACEMENT_ORDER[currentIdx]!]?.length ?? 0;
  if (bandSize === 0 || correctInBand === 0) {
    return { stop: true, skipped: null, nextIdx: currentIdx };
  }
  const landingIdx = currentIdx + 2;
  const landingHasContent =
    landingIdx <= last && (bandPool[PLACEMENT_ORDER[landingIdx]!]?.length ?? 0) > 0;
  if (correctInBand === bandSize && landingHasContent) {
    return { stop: false, skipped: PLACEMENT_ORDER[currentIdx + 1]!, nextIdx: landingIdx };
  }
  return { stop: false, skipped: null, nextIdx: currentIdx + 1 };
}

/** What the adaptive walk remembers from one band to the next. */
export type PlacementTally = {
  /**
   * Correct answers per band. A skipped band holds PLACEMENT_PASS_MARK for as long as its credit stands, and
   * 0 from the moment the credit is withdrawn until the band has really been asked.
   */
  correctByLevel: Record<Level, number>;
  /** The skipped bands whose credit still stands: the only ones the result may call "fast-tracked". */
  skippedLevels: Level[];
  /** True while the learner answers a skipped band the exam sent them back to. That band is the last one asked. */
  revisiting: boolean;
};

export type BandResolution = {
  /** True when the exam ends here. */
  stop: boolean;
  /** Which PLACEMENT_ORDER index to ask next (meaningless when stop is true). */
  nextIdx: number;
  tally: PlacementTally;
};

/** The tally of an exam that has not started. */
export function emptyTally(): PlacementTally {
  return {
    correctByLevel: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 },
    skippedLevels: [],
    revisiting: false,
  };
}

/**
 * What happens when the learner has answered the last question of a band: where the exam goes next, and
 * what the credit for any skipped band is worth. Every platform's exam calls this when a band completes.
 *
 * A skip is a bet. Acing a band makes nextAdaptiveBand jump the next one -- credited as passed, never
 * asked -- on the strength that someone who aced A1 will pass A2, so B1 is the interesting question. The
 * credit stands only once the band after the skip (the landing band) is passed for real: a pass above
 * implies a pass below. If the landing band is NOT passed (under PLACEMENT_PASS_MARK, so 0 or 1 of 3)
 * the bet lost, and the credit must decide nothing: scorePlacement would read the credited band as
 * passed and place the learner AT the band they had just failed, on an A2 nobody ever asked them. So the
 * credit is withdrawn and the exam goes BACK and asks the skipped band -- then ends, because nothing
 * above can change the result once the landing band has failed -- and the placement rests on answers the
 * learner actually gave. A band that has been asked is never asked again, so a sitting is still at most
 * 15 questions.
 *
 * A skipped band with no questions in the pool cannot be gone back to (a thin or misconfigured pool;
 * every shipped course has all five bands). There the exam ends with the credit withdrawn and the learner
 * is placed at the skipped band at most.
 *
 * Passing the landing band 2 of 3 changes nothing: the credit stands and the exam carries on as usual.
 */
export function resolveBand(
  bandPool: Record<Level, PlacementQuestion[]>,
  currentIdx: number,
  correctInBand: number,
  tally: PlacementTally,
): BandResolution {
  const correctByLevel = {
    ...tally.correctByLevel,
    [PLACEMENT_ORDER[currentIdx]!]: correctInBand,
  };
  const end = (skippedLevels: Level[]): BandResolution => ({
    stop: true,
    nextIdx: currentIdx,
    tally: { correctByLevel, skippedLevels, revisiting: false },
  });

  // The band the learner was sent back to is the last one asked: the band above it already failed.
  if (tally.revisiting) return end(tally.skippedLevels);

  // Is the band just finished the landing band of a skip, and did the learner fail it?
  const skippedBelow = PLACEMENT_ORDER[currentIdx - 1];
  if (
    skippedBelow &&
    tally.skippedLevels.includes(skippedBelow) &&
    correctInBand < PLACEMENT_PASS_MARK
  ) {
    const skippedLevels = tally.skippedLevels.filter((lvl) => lvl !== skippedBelow);
    correctByLevel[skippedBelow] = 0;
    if ((bandPool[skippedBelow]?.length ?? 0) === 0) return end(skippedLevels);
    return {
      stop: false,
      nextIdx: currentIdx - 1,
      tally: { correctByLevel, skippedLevels, revisiting: true },
    };
  }

  const decision = nextAdaptiveBand(bandPool, currentIdx, correctInBand);
  if (decision.skipped) correctByLevel[decision.skipped] = PLACEMENT_PASS_MARK;
  return {
    stop: decision.stop,
    nextIdx: decision.nextIdx,
    tally: {
      correctByLevel,
      skippedLevels: decision.skipped
        ? [...tally.skippedLevels, decision.skipped]
        : tally.skippedLevels,
      revisiting: false,
    },
  };
}

/**
 * The most questions the adaptive walk can ever ask for this pool: every band at most once (a skipped band
 * is only asked when it is gone back to, and never twice), so the sum of the band sizes -- 15 for a course
 * with three questions in each of five bands. It does not depend on the answers, so it can be shown from the
 * first question and never changes.
 */
export function placementMaxQuestions(bandPool: Record<Level, PlacementQuestion[]>): number {
  return PLACEMENT_ORDER.reduce((sum, lvl) => sum + (bandPool[lvl]?.length ?? 0), 0);
}

/** "Question 4 · up to 15": the same words on web, iOS and Android. */
export function placementProgressLabel(questionNumber: number, max: number): string {
  return `Question ${questionNumber} · up to ${max}`;
}

/** What a screen reader says for the counter: "Question 4, up to 15" (the dot would be read aloud or dropped). */
export function placementProgressSpokenLabel(questionNumber: number, max: number): string {
  return `Question ${questionNumber}, up to ${max}`;
}

/** Finishing before the maximum is a result, not a failure: the exam had what it needed. */
export function placementFinishedLabel(asked: number): string {
  return `Placed after ${asked} questions`;
}

export type BandMarkerState =
  /** Asked and passed on the learner's own answers. */
  | "passed"
  /** Credited from a perfect band below, not asked: looks different on purpose. */
  | "skipped"
  /** The band being asked now. */
  | "current"
  /** Asked, and not passed. */
  | "missed"
  /** Not reached. */
  | "upcoming";

/**
 * One marker per band that has questions, in order, for the row under the progress counter. `shown` is the
 * questions put to the learner so far (so a band is "asked" if any of them is from it). A skipped band whose
 * credit was withdrawn is no longer in tally.skippedLevels, so it reads as upcoming and then current when
 * the exam goes back to it.
 */
export function bandMarkers(
  bandPool: Record<Level, PlacementQuestion[]>,
  shown: PlacementQuestion[],
  bandIdx: number,
  tally: PlacementTally,
  done: boolean,
): { level: Level; state: BandMarkerState }[] {
  const asked = new Set(shown.map((q) => q.level));
  return PLACEMENT_ORDER.filter((lvl) => (bandPool[lvl]?.length ?? 0) > 0).map((level) => {
    let state: BandMarkerState = "upcoming";
    if (!done && PLACEMENT_ORDER[bandIdx] === level) state = "current";
    else if (tally.skippedLevels.includes(level)) state = "skipped";
    else if (asked.has(level)) {
      state = (tally.correctByLevel[level] ?? 0) >= PLACEMENT_PASS_MARK ? "passed" : "missed";
    }
    return { level, state };
  });
}
