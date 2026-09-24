import type { Level } from "./levels";

export type PlacementQuestion = {
  id: string;
  level: Level;
  prompt: string;
  choices: string[];
  answer: number;
};

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
    prompt: "She ___ a teacher.",
    choices: ["are", "is", "be", "am"],
    answer: 1,
  },
  {
    id: "p2",
    level: "A1",
    prompt: "Choose the polite greeting:",
    choices: ["Oi you", "Good morning", "Yo", "Alright mate"],
    answer: 1,
  },
  {
    id: "p3",
    level: "A1",
    prompt: "I ___ coffee every morning.",
    choices: ["drinks", "drinking", "drink", "drank"],
    answer: 2,
  },
  {
    id: "p1b",
    level: "A1",
    prompt: "They ___ from Canada.",
    choices: ["is", "am", "are", "be"],
    answer: 2,
  },
  {
    id: "p2b",
    level: "A1",
    prompt: "___ is your name?",
    choices: ["What", "Whose", "Which", "Who"],
    answer: 0,
  },
  {
    id: "p3b",
    level: "A1",
    prompt: "He ___ a big house.",
    choices: ["have", "has", "haves", "having"],
    answer: 1,
  },
  {
    id: "p1c",
    level: "A1",
    prompt: "This is ___ book.",
    choices: ["I", "my", "me", "mine own"],
    answer: 1,
  },
  {
    id: "p2c",
    level: "A1",
    prompt: "We ___ students.",
    choices: ["is", "am", "are", "be"],
    answer: 2,
  },
  {
    id: "p3c",
    level: "A1",
    prompt: "Choose the correct farewell:",
    choices: ["Good night", "Good night to you go", "Nighting", "Good nightly"],
    answer: 0,
  },

  {
    id: "p4",
    level: "A2",
    prompt: "We ___ to Rome last summer.",
    choices: ["go", "gone", "went", "going"],
    answer: 2,
  },
  {
    id: "p5",
    level: "A2",
    prompt: "This bag is ___ than that one.",
    choices: ["cheap", "cheaper", "cheapest", "more cheap"],
    answer: 1,
  },
  {
    id: "p6",
    level: "A2",
    prompt: "Can I pay ___ card?",
    choices: ["by", "on", "for", "of"],
    answer: 0,
  },
  {
    id: "p4b",
    level: "A2",
    prompt: "She ___ her homework already.",
    choices: ["finish", "finished", "finishing", "finishes"],
    answer: 1,
  },
  {
    id: "p5b",
    level: "A2",
    prompt: "There ___ many people at the party.",
    choices: ["was", "is", "were", "be"],
    answer: 2,
  },
  {
    id: "p6b",
    level: "A2",
    prompt: "I'm going to ___ a new car next year.",
    choices: ["buy", "bought", "buying", "buys"],
    answer: 0,
  },
  {
    id: "p4c",
    level: "A2",
    prompt: "He plays football ___ Sundays.",
    choices: ["in", "at", "on", "by"],
    answer: 2,
  },
  {
    id: "p5c",
    level: "A2",
    prompt: "This is the ___ film I've ever seen.",
    choices: ["good", "better", "best", "goodest"],
    answer: 2,
  },
  {
    id: "p6c",
    level: "A2",
    prompt: "___ you ever been to Spain?",
    choices: ["Do", "Did", "Have", "Are"],
    answer: 2,
  },

  {
    id: "p7",
    level: "B1",
    prompt: "If it rains, we ___ inside.",
    choices: ["stayed", "will stay", "would stayed", "stay would"],
    answer: 1,
  },
  {
    id: "p8",
    level: "B1",
    prompt: "I look forward to ___ from you.",
    choices: ["hear", "hearing", "heard", "be hearing"],
    answer: 1,
  },
  {
    id: "p9",
    level: "B1",
    prompt: '"Unless" means:',
    choices: ["if", "if not", "because", "although"],
    answer: 1,
  },
  {
    id: "p7b",
    level: "B1",
    prompt: "By the time we arrived, the film ___.",
    choices: ["already started", "had already started", "has already started", "already starts"],
    answer: 1,
  },
  {
    id: "p8b",
    level: "B1",
    prompt: "She's the woman ___ car was stolen.",
    choices: ["who", "which", "whose", "that"],
    answer: 2,
  },
  {
    id: "p9b",
    level: "B1",
    prompt: "You ___ smoke in here, it's not allowed.",
    choices: ["don't have to", "mustn't", "shouldn't", "don't must"],
    answer: 1,
  },
  {
    id: "p7c",
    level: "B1",
    prompt: "I used to ___ swimming every weekend.",
    choices: ["go", "going", "went", "goes"],
    answer: 0,
  },
  {
    id: "p8c",
    level: "B1",
    prompt: '"Although" introduces:',
    choices: ["a reason", "a contrast", "a condition", "a result"],
    answer: 1,
  },
  {
    id: "p9c",
    level: "B1",
    prompt: "He asked me ___ I was ready.",
    choices: ["that", "if", "what", "so"],
    answer: 1,
  },

  {
    id: "p10",
    level: "B2",
    prompt: "The bridge is ___ inspected annually.",
    choices: ["been", "be", "being", "was"],
    answer: 2,
  },
  {
    id: "p11",
    level: "B2",
    prompt: "___ the cost, demand rose.",
    choices: ["Although", "Despite", "However", "Whereas"],
    answer: 1,
  },
  {
    id: "p12",
    level: "B2",
    prompt: "Costs rose; ___, prices followed.",
    choices: ["accordingly", "whereas", "despite", "although"],
    answer: 0,
  },
  {
    id: "p10b",
    level: "B2",
    prompt: "She said she ___ the report by Friday.",
    choices: ["will finish", "would finish", "finishes", "finish"],
    answer: 1,
  },
  {
    id: "p11b",
    level: "B2",
    prompt: 'Most formal way to say "a lot of growth":',
    choices: ["tons of growth", "loads of growth", "substantial growth", "big growth"],
    answer: 2,
  },
  {
    id: "p12b",
    level: "B2",
    prompt: '"Whereas" is used to:',
    choices: ["give a reason", "compare two contrasting facts", "add an example", "conclude"],
    answer: 1,
  },
  {
    id: "p10c",
    level: "B2",
    prompt: "If I had known, I ___ differently.",
    choices: ["would act", "would have acted", "will act", "acted"],
    answer: 1,
  },
  {
    id: "p11c",
    level: "B2",
    prompt: "The report is ___ to be published next week.",
    choices: ["expect", "expecting", "expected", "expects"],
    answer: 2,
  },
  {
    id: "p12c",
    level: "B2",
    prompt: '"Nevertheless" signals:',
    choices: ["addition", "concession/contrast", "cause", "example"],
    answer: 1,
  },

  {
    id: "p13",
    level: "C1",
    prompt: 'Most formal equivalent of "find out":',
    choices: ["dig up", "check out", "ascertain", "get"],
    answer: 2,
  },
  {
    id: "p14",
    level: "C1",
    prompt: "That argument doesn't hold ___.",
    choices: ["air", "water", "ground", "weight"],
    answer: 1,
  },
  {
    id: "p15",
    level: "C1",
    prompt: "Which avoids nominalisation overload?",
    choices: [
      "The implementation of the reduction of costs",
      "We reduced costs",
      "Cost reduction implementation",
      "The undertaking of cost reduction",
    ],
    answer: 1,
  },
  {
    id: "p13b",
    level: "C1",
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
    prompt: 'Most precise register-appropriate word for "a lot of proof":',
    choices: ["loads of proof", "substantial evidence", "big proof", "much proof stuff"],
    answer: 1,
  },
  {
    id: "p15b",
    level: "C1",
    prompt: "Which sentence best avoids a dangling modifier?",
    choices: [
      "Walking to the store, the rain started.",
      "Walking to the store, I got caught in the rain.",
      "The rain, walking to the store, started.",
      "To the store walking, rain started.",
    ],
    answer: 1,
  },
  {
    id: "p13c",
    level: "C1",
    prompt: '"Notwithstanding" is closest in meaning to:',
    choices: ["because of", "despite", "in addition to", "as a result of"],
    answer: 1,
  },
  {
    id: "p14c",
    level: "C1",
    prompt: 'Best formal alternative to "a big problem":',
    choices: ["a huge issue", "a significant challenge", "a massive headache", "a really big deal"],
    answer: 1,
  },
  {
    id: "p15c",
    level: "C1",
    prompt: "Which uses hedging appropriately in academic writing?",
    choices: [
      "This proves the theory is correct.",
      "This suggests the theory may be correct.",
      "Everyone knows this theory is correct.",
      "This is obviously correct.",
    ],
    answer: 1,
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
export function pickPlacementSet(
  pool: PlacementQuestion[] = PLACEMENT_QUESTIONS,
): PlacementQuestion[] {
  const picked: PlacementQuestion[] = [];
  for (const lvl of PLACEMENT_ORDER) {
    const candidates = pool.filter((q) => q.level === lvl);
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    picked.push(...shuffled.slice(0, 3));
  }
  return picked;
}

/**
 * A band is "passed" when at least 2 of its 3 questions are correct.
 * Placement = highest consecutively passed band, or the next band up when
 * every band is passed.
 */
export function scorePlacement(correctByLevel: Record<Level, number>): {
  level: Level;
  passed: Level[];
} {
  const passed: Level[] = [];
  for (const lvl of PLACEMENT_ORDER) {
    if ((correctByLevel[lvl] ?? 0) >= 2) passed.push(lvl);
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
 *   guard means a skip only ever happens when it can be confirmed by a
 *   real question afterwards -- it never grants free credit right before
 *   the test would otherwise end, and the final band (C1) can only ever
 *   be earned by answering real C1 questions, never awarded as a skip
 *   target.
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
