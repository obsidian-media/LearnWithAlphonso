// Slot typing for cloze and multiple-choice questions, and the check that every
// wrong option belongs to its slot. The rules are written down in
// docs/distractor-policy.md; src/data/distractor-gate.test.ts enforces them.

import { alsoCorrectReason } from "./also-correct";

export type SlotType =
  | "place-prep"
  | "motion-prep"
  | "time-prep"
  | "fixed-prep"
  | "modal"
  | "aux"
  | "wh-word"
  | "quantifier"
  | "collocation-verb"
  | "inflection"
  | "category"
  | "phrase";

const set = (s: string) => new Set(s.split(",").map((x) => x.trim()));

/** Curated pools. A wrong option for a slot must come from its pool (or be allow-listed). */
export const POOLS: Record<Exclude<SlotType, "inflection" | "category" | "phrase">, Set<string>> = {
  "fixed-prep": set(
    "in,on,at,by,with,of,for,to,from,into,onto,under,over,through,during,since,until,before,after,up,down",
  ),
  "place-prep": set(
    "in,on,at,under,behind,next to,in front of,between,opposite,above,below,near,beside,inside,outside,against,among,by",
  ),
  "motion-prep": set(
    "into,out of,onto,across,through,along,up,down,over,past,towards,toward,around,round,under,to,from",
  ),
  "time-prep": set("at,on,in,by,for,during,since,until,from,before,after,to,of"),
  modal: set(
    "can,could,may,might,must,should,would,will,shall,can't,couldn't,won't,wouldn't,shouldn't,mustn't,needn't,ought to",
  ),
  aux: set(
    "am,is,are,was,were,be,been,being,isn't,aren't,wasn't,weren't,do,does,did,don't,doesn't,didn't,have,has,had,haven't,hasn't,hadn't,doing,having,done",
  ),
  "wh-word": set(
    "what,when,where,why,who,whose,whom,which,how,how much,how many,how often,how long,how far,how old",
  ),
  quantifier: set(
    "much,many,few,little,a few,a little,some,any,no,enough,plenty,several,lots of,a lot of,most,all,whole,more,less,fewer,both,neither,each,every,none,of,too",
  ),
  "collocation-verb": set(
    "make,do,take,have,get,give,go,spend,pay,catch,play,watch,listen to,ask,speak,write,ride,wash,brush,throw,say,tell,keep,break,save,run,see,look,read",
  ),
};

const PLACE = POOLS["place-prep"];
const MOTION = POOLS["motion-prep"];
const TIME = POOLS["time-prep"];
// A fixed phrase ("by bus", "opposite from", "went up") can take any preposition or particle.
for (const w of [...PLACE, ...MOTION, ...TIME, "off", "out", "away", "back", "next", "right"])
  POOLS["fixed-prep"].add(w);

const norm = (s: string) => s.toLowerCase().replace(/’/g, "'").trim();

const TIME_OBJECT =
  /\b(\d{1,4}|a\.m\.|p\.m\.|o'clock|morning|afternoon|evening|night|midnight|noon|weekend|week|month|year|day|hour|minute|summer|winter|autumn|spring|holiday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|christmas|birthday|lunch|dinner|breakfast|bedtime)\b/i;
const MOTION_VERB =
  /\b(walk|walks|walked|run|runs|ran|running|go|goes|went|come|comes|came|roll|rolled|rolls|fly|flies|flew|jump|jumped|swim|swam|drive|drove|cross|follow|lead|leads|travel|turn|climb|move|moved|fell|fall|throw|threw|hiking|stepped|put)\b/i;
const PRONOUNLESS_STEM = /^(past simple|plural|comparative|superlative) of/i;

const PACK_RE = /^(a[12]p\d+)q\d+$/;

/** Slot type of a cloze/mc question, or null if it cannot be inferred. */
export function inferSlot(
  prompt: string,
  answer: string,
  options: string[],
  questionId = "",
): SlotType | null {
  const a = norm(answer);
  const text = prompt.trim();
  if (/^which verb goes with/i.test(text)) return "collocation-verb";
  if (PRONOUNLESS_STEM.test(text)) return "inflection";
  // Pair packs ("Opposite of ...", "Someone who ..."): the other answers of the pack are the pool.
  if (!text.includes("___") && PACK_RE.test(questionId)) return "category";
  if (!text.includes("___") && /^q[0-9]+$/.test(questionId)) return "phrase";
  // Every option is a form of one lemma (study / studies / are study): an inflection slot.
  const bare = options.map((o) => norm(o).replace(/^(is|are|am|to|more|most) /, ""));
  const common = bare.reduce((p, o) => {
    let i = 0;
    while (i < p.length && i < o.length && p[i] === o[i]) i++;
    return p.slice(0, i);
  });
  const otherPool =
    POOLS.modal.has(a) ||
    POOLS["wh-word"].has(a) ||
    POOLS.quantifier.has(a) ||
    PLACE.has(a) ||
    MOTION.has(a) ||
    TIME.has(a);
  if (common.length >= 2 && !otherPool) return "inflection";
  if (!text.includes("___")) return null;
  const after = text.slice(text.indexOf("___") + 3);
  if (POOLS.modal.has(a)) return "modal";
  if (POOLS.aux.has(a)) return "aux";
  if (POOLS["wh-word"].has(a) && /^\s*___/.test(text)) return "wh-word";
  if (POOLS.quantifier.has(a) && a !== "of") return "quantifier";
  if (PLACE.has(a) || MOTION.has(a) || TIME.has(a)) {
    // No article or possessive after the blank: a fixed phrase ("by bus", "in cash").
    if (
      !/^\s*(the|a|an|my|your|his|her|their|our|this|that)\b/i.test(after) &&
      !(TIME_OBJECT.test(after) && TIME.has(a))
    )
      return "fixed-prep";
    const timey =
      (TIME_OBJECT.test(after) && TIME.has(a)) ||
      ["during", "since", "until", "before", "after"].includes(a);
    if (timey) return "time-prep";
    if (MOTION.has(a) && (MOTION_VERB.test(text) || !PLACE.has(a))) return "motion-prep";
    if (PLACE.has(a)) return "place-prep";
    return "time-prep";
  }
  if (PACK_RE.test(questionId)) return "category";
  // Hand-authored phrase and function questions (greetings, replies, requests).
  if (/^q[0-9]+$/.test(questionId)) return "phrase";
  return null;
}

/** A bracketed clue after the blank, or a picture, picks the one option that fits. */
/** Pair-pack prompts that already define the answer ("Someone who cooks food is a..."). */
const DEFINITION_STEM =
  /^(someone who|an animal that|something that|opposite of|female form of|the body part|this hobby involves|which (sport or hobby|noun goes with)|how often does)/i;

export function hasClue(prompt: string, hasImage = false): boolean {
  return (
    hasImage ||
    DEFINITION_STEM.test(prompt.trim()) ||
    /\([^)]{4,}\)\s*$/.test(prompt) ||
    /\?\s+[A-Z][^?]*[.!]$/.test(prompt)
  );
}

/** Reviewed exceptions: question key (`lessonId/questionId`) -> options allowed outside the pool. */
export const DISTRACTOR_ALLOW: Record<string, { options: string[]; why: string }> = {};

export type Issue =
  | { kind: "off-pool"; option: string; slot: SlotType }
  | { kind: "also-correct"; option: string; reason: string }
  | { kind: "needs-clue" }
  | { kind: "unclassified" };

export type QuestionShape = {
  key: string;
  id: string;
  prompt: string;
  answer: string;
  options: string[];
  hasImage?: boolean;
  /** Reviewed: the sentence itself rules the other options out (QuestionFix.context). */
  clued?: boolean;
  /** Reviewed slot type that overrides inference. */
  slot?: SlotType;
  /** Answers of the question's whole pack, for `category` slots. */
  packAnswers?: Set<string>;
  /** A hand-authored phrase question that was read and judged sound (see reviewed-phrases.ts). */
  reviewed?: boolean;
};

/** Everything wrong with a question's options under docs/distractor-policy.md. */
export function checkDistractors(q: QuestionShape): Issue[] {
  const slot = q.slot ?? inferSlot(q.prompt, q.answer, q.options, q.id);
  const wrong = q.options.filter((o) => o !== q.answer);
  if (!slot) return [{ kind: "unclassified" }];
  if (slot === "phrase" && !q.reviewed) return [{ kind: "unclassified" }];
  const issues: Issue[] = [];
  const allow = new Set((DISTRACTOR_ALLOW[q.key]?.options ?? []).map(norm));
  for (const w of wrong) {
    const n = norm(w);
    let inPool: boolean;
    if (slot === "category") inPool = q.packAnswers?.has(w) ?? true;
    else if (slot === "inflection" || slot === "phrase")
      inPool = true; // checked by inferSlot: every option is one lemma
    else inPool = POOLS[slot].has(n);
    if (!inPool && !allow.has(n)) issues.push({ kind: "off-pool", option: w, slot });
  }
  const clue = hasClue(q.prompt, q.hasImage || q.clued);
  if (!clue && q.prompt.includes("___")) {
    for (const w of wrong) {
      const why = alsoCorrectReason(q.prompt, q.answer, w);
      if (why) issues.push({ kind: "also-correct", option: w, reason: why });
    }
  }
  if (slot === "category" && !clue) issues.push({ kind: "needs-clue" });
  return issues;
}
