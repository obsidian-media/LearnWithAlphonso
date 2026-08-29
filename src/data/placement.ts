import type { Level } from "./levels";

export type PlacementQuestion = {
  id: string;
  level: Level;
  prompt: string;
  choices: string[];
  answer: number;
};

/** Three questions per CEFR band, ordered easiest → hardest. */
export const PLACEMENT_QUESTIONS: PlacementQuestion[] = [
  { id: "p1", level: "A1", prompt: "She ___ a teacher.", choices: ["are", "is", "be", "am"], answer: 1 },
  { id: "p2", level: "A1", prompt: "Choose the polite greeting:", choices: ["Oi you", "Good morning", "What", "Give"], answer: 1 },
  { id: "p3", level: "A1", prompt: "I ___ coffee every morning.", choices: ["drinks", "drinking", "drink", "drank"], answer: 2 },

  { id: "p4", level: "A2", prompt: "We ___ to Rome last summer.", choices: ["go", "gone", "went", "going"], answer: 2 },
  { id: "p5", level: "A2", prompt: "This bag is ___ than that one.", choices: ["cheap", "cheaper", "cheapest", "more cheap"], answer: 1 },
  { id: "p6", level: "A2", prompt: "Can I pay ___ card?", choices: ["by", "on", "for", "of"], answer: 0 },

  { id: "p7", level: "B1", prompt: "If it rains, we ___ inside.", choices: ["stayed", "will stay", "would stayed", "stay would"], answer: 1 },
  { id: "p8", level: "B1", prompt: "I look forward to ___ from you.", choices: ["hear", "hearing", "heard", "be hearing"], answer: 1 },
  { id: "p9", level: "B1", prompt: "\"Unless\" means:", choices: ["if", "if not", "because", "although"], answer: 1 },

  { id: "p10", level: "B2", prompt: "The bridge is ___ inspected annually.", choices: ["been", "be", "being", "was"], answer: 2 },
  { id: "p11", level: "B2", prompt: "___ the cost, demand rose.", choices: ["Although", "Despite", "However", "Whereas"], answer: 1 },
  { id: "p12", level: "B2", prompt: "Costs rose; ___, prices followed.", choices: ["accordingly", "whereas", "despite", "although"], answer: 0 },

  { id: "p13", level: "C1", prompt: "Most formal equivalent of \"find out\":", choices: ["dig up", "check out", "ascertain", "get"], answer: 2 },
  { id: "p14", level: "C1", prompt: "That argument doesn't hold ___.", choices: ["air", "water", "ground", "weight"], answer: 1 },
  { id: "p15", level: "C1", prompt: "Which avoids nominalisation overload?", choices: ["The implementation of the reduction of costs", "We reduced costs", "Cost reduction implementation", "The undertaking of cost reduction"], answer: 1 },
];

export const PLACEMENT_ORDER: Level[] = ["A1", "A2", "B1", "B2", "C1"];

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

export const PLACEMENT_KEY = "lingua.placement";
export const LEVEL_KEY = "lingua.level";
