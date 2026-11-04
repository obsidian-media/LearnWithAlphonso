// Slot typing for cloze and multiple-choice questions, and the check that every
// wrong option belongs to its slot. The rules are written down in
// docs/distractor-policy.md; src/data/distractor-gate.test.ts enforces them.

import { PACK_EXTRA_VOCAB } from "./pack-extra-vocab";
import { REVIEWED_PHRASES } from "./reviewed-phrases";
import { alsoCorrectReason, bracketClue, clueIsSpecific } from "./also-correct";
export { bracketClue, clueIsSpecific };
import { ANSWER_POS, PACK_ANSWER_POS } from "./answer-pos";

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

type PooledSlot = Exclude<SlotType, "inflection" | "category" | "phrase" | "fixed-prep">;

/** Curated pools. A wrong option for a slot must come from its pool (or be allow-listed). */
export const POOLS: Record<PooledSlot, Set<string>> = {
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

/**
 * Fixed-phrase slots (no article after the blank: "by bus", "went up", "opposite from")
 * each have their own small pool, chosen by the answer's group. They are NOT one big
 * list of prepositions: "at / during / into / since" are not options for "by ___".
 */
export const FIXED_GROUPS: Record<string, Set<string>> = {
  basic: set("in,on,at,by,with,of,for,to,from"),
  particle: set("up,down,off,out,away,back,over"),
  adjacent: set("opposite,next,near,behind,far,beside"),
};
function fixedGroup(answer: string): Set<string> | null {
  const a = norm(answer);
  for (const g of Object.values(FIXED_GROUPS)) if (g.has(a)) return g;
  return null;
}

const PLACE = POOLS["place-prep"];
const MOTION = POOLS["motion-prep"];
const TIME = POOLS["time-prep"];
const ALL_PREPS = new Set([
  ...PLACE,
  ...MOTION,
  ...TIME,
  ...Object.values(FIXED_GROUPS).flatMap((g) => [...g]),
]);

function norm(s: string) {
  return s.toLowerCase().replace(/’/g, "'").trim();
}

const TIME_OBJECT =
  /\b(\d{1,4}|a\.m\.|p\.m\.|o'clock|morning|afternoon|evening|night|midnight|noon|weekend|week|month|year|day|hour|minute|summer|winter|autumn|spring|holiday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|christmas|birthday|lunch|dinner|breakfast|bedtime)\b/i;
const MOTION_VERB =
  /\b(walk|walks|walked|run|runs|ran|running|go|goes|went|come|comes|came|roll|rolled|rolls|fly|flies|flew|jump|jumped|swim|swam|drive|drove|cross|follow|lead|leads|travel|turn|climb|move|moved|fell|fall|throw|threw|hiking|stepped|put)\b/i;
const PRONOUNLESS_STEM = /^(past simple|plural|comparative|superlative) of/i;

const PACK_RE = /^(a[12]p\d+)q\d+$/;
const packOf = (id: string) => PACK_RE.exec(id)?.[1];

/** Forms of one lemma: the wrong options share a stem of 4+ letters (or the whole short word). */
export function shareLemma(options: string[]): boolean {
  const bare = options.map((o) =>
    norm(o).replace(/^(is|are|am|was|were|do|does|did|will|to|more|most) /, ""),
  );
  if (bare.length < 2) return true;
  const common = bare.reduce((p, o) => {
    let i = 0;
    while (i < p.length && i < o.length && p[i] === o[i]) i++;
    return p.slice(0, i);
  });
  const shortest = Math.min(...bare.map((b) => b.length));
  // lives / live / living share "liv"; go / goes / going share the whole short word;
  // lives / lion / lip / lid share only "li" and are not forms of one verb.
  return common.length >= Math.min(3, shortest) && common.length >= 2;
}

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
  const otherPool =
    POOLS.modal.has(a) || POOLS["wh-word"].has(a) || POOLS.quantifier.has(a) || ALL_PREPS.has(a);
  if (!otherPool && shareLemma(options)) return "inflection";
  if (!text.includes("___")) return null;
  const after = text.slice(text.indexOf("___") + 3);
  if (POOLS.modal.has(a)) return "modal";
  if (POOLS.aux.has(a)) return "aux";
  if (POOLS["wh-word"].has(a) && /^\s*___/.test(text)) return "wh-word";
  if (POOLS.quantifier.has(a) && a !== "of") return "quantifier";
  if (ALL_PREPS.has(a)) {
    const article = /^\s*(the|a|an|my|your|his|her|their|our|this|that)\b/i.test(after);
    // No article or possessive after the blank: a fixed phrase ("by bus", "in cash").
    if (!article && !(TIME_OBJECT.test(after) && TIME.has(a))) return "fixed-prep";
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

/** Pair-pack prompts that already define the answer ("Someone who cooks food is a..."). */
const DEFINITION_STEM =
  /^(someone who|an animal that|something that|opposite of|female form of|the body part|this hobby involves|which (sport or hobby|noun goes with|adverb means)|how often does)/i;

/** A specific bracketed clue, a photo, or a definition-style prompt. */
export function hasClue(prompt: string, hasImage = false): boolean {
  return (
    hasImage ||
    DEFINITION_STEM.test(prompt.trim()) ||
    clueIsSpecific(prompt) ||
    /\?\s+[A-Z][^?]*[.!]$/.test(prompt)
  );
}

/** The blanket reason an earlier pass stamped on every reviewed-context question. */
export const BLANKET_CONTEXT = "the sentence already rules out the other options";

/** Reviewed exceptions: question key (`lessonId/questionId`) -> options allowed outside the pool. */
export const DISTRACTOR_ALLOW: Record<string, { options: string[]; why: string }> = {};

/**
 * Packs on one theme share a vocabulary: a wrong option for a transport question may be any
 * transport word, whichever transport pack it comes from. Packs on no theme stand alone.
 */
export const THEME_PACKS: string[][] = [
  ["a1p8", "a1p19", "a2p11"],
  ["a1p20", "a2p4", "a2p13"],
  ["a1p21", "a2p9"],
  ["a1p11", "a2p15"],
  ["a1p22", "a2p8"],
  ["a2p16", "a2p13"],
  ["a1p5", "a1p16"],
];

/**
 * Same-kind words a pack's questions may use as wrong options although the pack never teaches
 * them (the other months for a month question). Reviewed per pack, never per question.
 */
export const EXTRA_VOCAB: Record<string, string> = {
  a1p14:
    "March,April,May,August,September,November,Thursday,Wednesday,Tuesday,Monday,Friday,Saturday,Sunday,dawn,evening,midnight,lunchtime",
  a1p10: "windy,snowy,cloudy,stormy,chilly,sunny,foggy,rainy,dry,wet,cold,warm",
  a1p9: "belt,gloves,socks,hat,scarf,skirt,dress,jumper,coat,sandals,slippers,trainers,boots,shorts,jacket",
};

/** Per pack, every word the pack teaches plus its themed packs' words and its reviewed extras. */
export function buildPackVocab(rawWords: Map<string, Set<string>>): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const packs = new Set<string>([...rawWords.keys()]);
  for (const pack of packs) {
    const set = new Set<string>(rawWords.get(pack) ?? []);
    for (const group of THEME_PACKS)
      if (group.includes(pack))
        for (const p of group) for (const w of rawWords.get(p) ?? []) set.add(w);
    for (const w of (EXTRA_VOCAB[pack] ?? "").split(",").filter(Boolean)) set.add(w);
    for (const w of PACK_EXTRA_VOCAB[pack] ?? []) set.add(w);
    out.set(pack, set);
  }
  return out;
}

export type Issue =
  | { kind: "off-pool"; option: string; slot: SlotType }
  | { kind: "pos-mismatch"; option: string; answerPos: string; optionPos: string }
  | { kind: "also-correct"; option: string; reason: string }
  | { kind: "needs-clue" }
  | { kind: "tense-unanchored" }
  | { kind: "options-not-replaced" }
  | { kind: "weak-context" }
  | { kind: "unclassified" };

export type QuestionShape = {
  key: string;
  id: string;
  prompt: string;
  answer: string;
  options: string[];
  hasImage?: boolean;
  /**
   * Reviewed reason, written for this question, why the sentence rules the other options
   * out (QuestionFix.context). A reason shared by several questions is not a reason.
   */
  context?: string;
  /** Reviewed slot type that overrides inference. */
  slot?: SlotType;
  /** Answers of the question's whole pack, for `category` slots. */
  packAnswers?: Set<string>;
  /** Every word the pack itself uses (its answers and the options of its unfixed questions). */
  packVocab?: Set<string>;
  /** True when a reviewed fix replaced the wrong options; false when it only added a clue or reason. */
  wrongReplaced?: boolean;
  /** A hand-authored phrase question that was read and judged sound (see reviewed-phrases.ts). */
  reviewed?: boolean;
  /** How many questions carry exactly this context reason (computed by the sweep). */
  contextUses?: number;
  /** Ignored by the check (kept so a fixture can show that an allow list no longer helps). */
  allow?: string[];
};

/**
 * Hand labels for topic words whose generated tag is wrong or missing (answer-pos.ts reads a
 * single sentence, so "cold" is an adjective in weather and a noun in health). Per pack, and
 * only where a wrong tag blocked a question that is in fact sound.
 */
const nouns = (s: string) => Object.fromEntries(s.split(",").map((w) => [w.trim(), "Noun"]));
const POS_FIX: Record<string, Record<string, string>> = {
  a1p11: { ...nouns("coins,notes,cash,tax"), later: "Adverb" },
  a1p14: nouns("time,year,January,Monday"),
  a1p19: nouns("till,trolley,price,vegetables,oil,debit"),
  a2p7: nouns("kitchen,bedroom,bathroom,house,garage,garden,flat,dining room"),
  a2p9: nouns("cold,cough,fever,headache,bruise,nuts,bread,milk,eggs"),
  a2p11: nouns("nuts,bread,milk,eggs,deposit"),
  a2p15: {
    ...nouns("stamp"),
    registered: "Adjective",
    airmail: "Adjective",
    surface: "Adjective",
    "second-class": "Adjective",
  },
  a2p16: { ...nouns("centre,park,stop,market"), local: "Adjective" },
  a1p8: { orange: "Noun", medium: "Adjective" },
  a1p16: { sleep: "Verb", "glances at": "Verb", watch: "Verb", walk: "Verb" },
  a2p13: Object.fromEntries(
    "left,right,straight,back,up,forward"
      .split(",")
      .map((w) => [w, "Adverb"])
      .concat("end,start,middle,side".split(",").map((w) => [w, "Noun"])),
  ),
  a2p17: {
    above: "Preposition",
    beside: "Preposition",
    beneath: "Preposition",
    alongside: "Preposition",
    behind: "Preposition",
    inside: "Preposition",
    towards: "Preposition",
    into: "Preposition",
    through: "Preposition",
  },
  a2p20: {
    long: "Adjective",
    fluent: "Adjective",
    warm: "Adjective",
    tall: "Adjective",
    light: "Adjective",
  },
};

/** The time pack mixes days, months, parts of the day and units; a wrong option must be the answer's own kind. */
const TIME_KIND: Record<string, string> = Object.fromEntries([
  ...["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((w) => [
    w,
    "day-name",
  ]),
  ...[
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ].map((w) => [w, "month-name"]),
  ...[
    "morning",
    "mornings",
    "afternoon",
    "afternoons",
    "evening",
    "evenings",
    "night",
    "nights",
    "noon",
    "midnight",
    "dawn",
    "lunchtime",
  ].map((w) => [w, "part-of-day"]),
  ...[
    "second",
    "minute",
    "hour",
    "day",
    "days",
    "week",
    "weeks",
    "weekend",
    "month",
    "months",
    "year",
    "years",
    "hours",
    "minutes",
    "time",
  ].map((w) => [w, "unit"]),
]);

const posOf = (packId: string | undefined, word: string): string | undefined =>
  (packId ? POS_FIX[packId]?.[word] : undefined) ??
  (packId ? PACK_ANSWER_POS[packId]?.[word] : undefined) ??
  ANSWER_POS[word] ??
  ANSWER_POS[word.toLowerCase()];

/** A reason that only says the other options are wrong ("cannot ...", "is not a place") explains nothing. */
export const NEGATIVE_REASON =
  /\b(cannot|can't|isn't|aren't|doesn't|don't|never|not an?|is not|are not|needs? another|do(es)? not|none of|would make (no )?sense|makes? no sense|nonsense)\b/i;

/** A context reason counts only if it is written for this question: unique and not the stamp. */
function contextIsReal(q: QuestionShape): boolean {
  return (
    !!q.context &&
    q.context !== BLANKET_CONTEXT &&
    q.context.length >= 25 &&
    !NEGATIVE_REASON.test(q.context) &&
    (q.contextUses ?? 1) === 1
  );
}

/** Past forms that are not base + ed (base -> past). */
const IRREG_PAST: Record<string, string> = Object.fromEntries(
  "go:went,eat:ate,write:wrote,see:saw,buy:bought,say:said,know:knew,take:took,give:gave,come:came,get:got,have:had,make:made,do:did,drink:drank,drive:drove,run:ran,swim:swam,sing:sang,ride:rode,speak:spoke,begin:began,break:broke,bring:brought,build:built,choose:chose,fly:flew,forget:forgot,leave:left,lose:lost,meet:met,pay:paid,sell:sold,send:sent,sit:sat,sleep:slept,stand:stood,tell:told,think:thought,wear:wore,win:won,wake:woke,fall:fell,feel:felt,find:found,hold:held,keep:kept,hear:heard,hide:hid,lead:led,lend:lent,spend:spent,teach:taught,throw:threw,understand:understood,catch:caught,draw:drew,grow:grew,hang:hung,mean:meant,steal:stole,swear:swore,sweep:swept,shake:shook,ring:rang,rise:rose,shine:shone,sink:sank,drink:drank"
    .split(",")
    .map((p) => p.split(":") as [string, string]),
);
const PAST_TO_BASE: Record<string, string> = Object.fromEntries(
  Object.entries(IRREG_PAST).map(([b, p]) => [p, b]),
);

/** Only a past time fixes the simple past: "every day" and "always" fit both tenses. */
const PAST_ONLY =
  /\b(yesterday|last (night|week|weekend|month|year|summer|winter|\w*day)|\w+ ago|when (i|he|she|we|they|you|it) (was|were)|in (19|20)\d\d|this morning)\b/i;
/** Only a present time rules the simple past out. */
const PRESENT_ONLY = /\b(right now|at the moment|these days|nowadays|currently|at present|now)\b/i;
const FUTURE_ONLY = /\b(tomorrow|tonight|next \w+|soon)\b/i;
/** The word before the blank fixes the form: a bare verb, an -ing form or a participle. */
const FRAME_BASE =
  /(\b(to|will|would|can|could|shall|should|must|might|may|let's|do|does|did)|n't|'ll|'d)\s+(\w+\s+)?___/i;
const FRAME_BE = /(\b(am|is|are|was|were|be|been|being)|'m|'re|'s)\s+(\w+\s+)?___/i;
/** After hate, enjoy, go ... the blank takes an -ing form, not a finite verb. */
const FRAME_ING =
  /\b(hate|hates|love|loves|like|likes|enjoy|enjoys|mind|stop|keep|finish|avoid|go|goes|forward to)\s+(\w+\s+)?___/i;
/** After an article or possessive the blank is a noun, not a verb. */
const FRAME_NOUN = /\b(the|a|an|my|your|his|her|our|their|this|that|some)\s+___/i;
/** The question itself names the form wanted: Past simple of "go". */
const NAMED_FORM =
  /\b(past simple|past participle|present simple|third person|plural|-ing form|comparative|superlative)\b/i;
/** Verbs whose past is the base form: their only -ed form is a learner error. */
const SAME_PAST = new Set("read,put,cut,set,let,hurt,hit,cost,shut,quit,spread".split(","));
const FRAME_HAVE = /(\b(have|has|had)|'ve)\s+(\w+\s+)?___/i;

function lemmaOf(word: string): string {
  const w = word
    .toLowerCase()
    .trim()
    .replace(/^(is|are|am|was|were|be|been|have|has|had|will|to|do|does|more|most) /, "");
  if (PAST_TO_BASE[w]) return PAST_TO_BASE[w]!;
  const strip = (x: string, re: RegExp, to = "") => {
    const y = x.replace(re, to);
    return y.length >= 3 ? y : x;
  };
  let y = strip(w, /(ied|ies)$/, "y");
  if (y === w) y = strip(w, /(ing|ed|es|s)$/);
  return y.replace(/(.)$/, "$1");
}
function pastKind(word: string): "past" | "ing" | "present" | "other" {
  const w = word.toLowerCase().trim();
  if (/\s/.test(w)) return "other";
  if (PAST_TO_BASE[w]) return "past";
  if (/ing$/.test(w)) return "ing";
  if (/ed$/.test(w)) return "past";
  return "present";
}
/** Is `option` a real, correctly formed alternative tense of the answer's verb? */
function validOtherTense(answer: string, option: string): "past" | "present" | null {
  const a = answer.toLowerCase().trim();
  const o = option.toLowerCase().trim();
  if (/\s/.test(a) || /\s/.test(o) || a === o) return null;
  const la = lemmaOf(a);
  if (SAME_PAST.has(la)) return null;
  const lo = lemmaOf(o);
  if (la.slice(0, 3) !== lo.slice(0, 3)) return null;
  const ka = pastKind(a);
  const ko = pastKind(o);
  if (ko === "past") {
    // A real past: the irregular form, or -ed on a regular verb. goed / knowed / readed are errors.
    const base = IRREG_PAST[la];
    if (base ? o === base : /ed$/.test(o) && !IRREG_PAST[la]) return ka === "past" ? null : "past";
    return null;
  }
  if (ko === "present" && ka === "past") {
    // Only the base form or its -s form is a present tense of the verb (attachment is a noun).
    const forms = [la, la + "s", la + "es", la.replace(/y$/, "ies")];
    return forms.includes(o) ? "present" : null;
  }
  return null;
}
/** True when another tense of the answer's verb also fits and nothing in the sentence rules it out. */
export function tenseRivalUnruledOut(prompt: string, answer: string, wrong: string[]): boolean {
  if (NAMED_FORM.test(prompt) || FRAME_NOUN.test(prompt) || FRAME_ING.test(prompt)) return false;
  if (FRAME_BASE.test(prompt) || FRAME_HAVE.test(prompt)) return false;
  // After a form of be a finite verb cannot follow; only a participle can, and a sentence that goes on
  // after the blank ("... in the price") leaves nothing for a second tense to fit.
  if (FRAME_BE.test(prompt) && (/ing$/i.test(answer.trim()) || /___\s*[\p{L}]/u.test(prompt)))
    return false;
  for (const w of wrong) {
    const rival = validOtherTense(answer, w);
    if (rival === "past" && !(PRESENT_ONLY.test(prompt) || FUTURE_ONLY.test(prompt))) return true;
    if (rival === "present" && !PAST_ONLY.test(prompt)) return true;
  }
  return false;
}

/** Everything wrong with a question's options under docs/distractor-policy.md. */
export function checkDistractors(q: QuestionShape): Issue[] {
  const slot = q.slot ?? inferSlot(q.prompt, q.answer, q.options, q.id);
  const wrong = q.options.filter((o) => o !== q.answer);
  if (!slot) return [{ kind: "unclassified" }];
  // A phrase slot is only trusted when someone read this very question (reviewed-phrases.ts);
  // a `reviewed` flag on its own, or a slot override, does not make it so.
  if (slot === "phrase" && !(q.reviewed && REVIEWED_PHRASES.has(q.key)))
    return [{ kind: "unclassified" }];
  const issues: Issue[] = [];
  const allow = new Set(
    // Only the reviewed table can allow an option outside the pool. A fix entry's own `allow` never
    // skips the pool, same-kind or same-part-of-speech checks (it used to, which let its own
    // replacement options through).
    (DISTRACTOR_ALLOW[q.key]?.options ?? []).map(norm),
  );
  const pack = packOf(q.id);
  const group = slot === "fixed-prep" ? fixedGroup(q.answer) : null;
  if (slot === "inflection") {
    // "Past simple of \"go\"": every wrong option contains the quoted lemma; otherwise the
    // wrong options must be forms of one verb (a 4+ letter shared stem).
    const lemma = /"([a-z]+)"/i.exec(q.prompt)?.[1]?.toLowerCase();
    // An irregular form (swam / swum, men / mens) shares only its first letters with the lemma
    // or the answer, so the quoted-lemma check is a two-letter prefix against either.
    const heads = lemma ? [lemma.slice(0, 2), norm(q.answer).slice(0, 2)] : [];
    const okForm = (w: string) =>
      !!lemma &&
      heads.some((h) =>
        norm(w)
          .replace(/^(more|most|is|are|am|was|were|do|does|did|will|to) /, "")
          .startsWith(h),
      );
    const sameVerb = (w: string) => {
      const x = lemmaOf(q.answer);
      const y = lemmaOf(w);
      const n = Math.min(3, x.length, y.length);
      return x.slice(0, n) === y.slice(0, n);
    };
    const bad = lemma
      ? wrong.filter((w) => !okForm(w))
      : shareLemma(wrong)
        ? []
        : wrong.filter((w) => !sameVerb(w));
    for (const w of bad)
      if (!allow.has(norm(w))) issues.push({ kind: "off-pool", option: w, slot });
  }
  for (const w of wrong) {
    const n = norm(w);
    let inPool: boolean;
    if (slot === "category") inPool = (q.packVocab ?? q.packAnswers)?.has(w) ?? true;
    else if (slot === "inflection" || slot === "phrase") inPool = true;
    else if (slot === "fixed-prep") inPool = group?.has(n) ?? false;
    else inPool = POOLS[slot].has(n);
    if (!inPool && !allow.has(n)) issues.push({ kind: "off-pool", option: w, slot });
    if (slot === "category" && pack === "a1p14") {
      const ak = TIME_KIND[norm(q.answer)];
      const wk = TIME_KIND[n];
      if (ak && wk && ak !== wk)
        issues.push({ kind: "pos-mismatch", option: w, answerPos: ak, optionPos: wk });
    }
    if (slot === "category" && inPool) {
      // Same kind of word: a noun slot takes nouns, an adverb slot takes adverbs.
      const ap = posOf(pack, q.answer);
      const wp = posOf(pack, w);
      if (ap && wp && ap !== wp)
        issues.push({ kind: "pos-mismatch", option: w, answerPos: ap, optionPos: wp });
    }
  }
  // A photo or a bracketed clue disambiguates; a reviewed context reason does too, but only a real one.
  const clue = hasClue(q.prompt, q.hasImage);
  const real = contextIsReal(q);
  // The also-correct check is skipped only for a specific bracketed clue or a photo, never for context.
  if (!(q.hasImage || clueIsSpecific(q.prompt)) && q.prompt.includes("___")) {
    for (const w of wrong) {
      const why = alsoCorrectReason(q.prompt, q.answer, w);
      if (why) issues.push({ kind: "also-correct", option: w, reason: why });
    }
  }
  if (slot === "category" && !clue && !real) issues.push({ kind: "needs-clue" });
  // A clue or reason only disambiguates; the old pack-neighbour options must also have been replaced.
  if (
    slot === "category" &&
    q.wrongReplaced !== true &&
    !q.hasImage &&
    (real || clueIsSpecific(q.prompt))
  )
    issues.push({ kind: "options-not-replaced" });
  // Every option of an inflection slot is a form of one verb, so another tense of it can also fit
  // unless the sentence fixes the time (or a photo, a specific clue or a real reason does).
  if (slot === "inflection" && tenseRivalUnruledOut(q.prompt, q.answer, wrong))
    issues.push({ kind: "tense-unanchored" });
  // A leftover context on a question that now has a photo or a specific clue is harmless.
  if (q.context && !real && !(q.hasImage || clueIsSpecific(q.prompt)))
    issues.push({ kind: "weak-context" });
  return issues;
}
