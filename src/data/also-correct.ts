// Detects wrong answers that are not wrong: a distractor that, dropped into the
// blank, makes a sentence a teacher would accept. See also-correct.test.ts for
// the hand-written verdicts this is graded against.
//
// This is a heuristic over grammatical families, not a parser. It is built to be
// CONSERVATIVE in the direction of removing a distractor: a false positive costs
// one swapped wrong answer, a false negative costs a learner a right answer
// marked wrong. It cannot see meaning ("Which verb goes with homework? have"),
// so it does not claim to find every case -- see docs/content-audit-2026-11.md.

const BE_SUBJECT: Record<string, "i" | "sg" | "pl"> = {
  am: "i",
  is: "sg",
  are: "pl",
};

type Num = "i" | "you" | "sg" | "pl";

const PLURAL_IRREGULAR = new Set([
  "people",
  "children",
  "men",
  "women",
  "police",
  "feet",
  "teeth",
  "mice",
  "friends",
  "parents",
]);
const SINGULAR_S = new Set([
  "news",
  "physics",
  "maths",
  "bus",
  "glass",
  "class",
  "boss",
  "dress",
  "business",
]);
const WH = new Set(["what", "where", "why", "how", "when", "who", "which", "whose"]);

const norm = (s: string) => s.toLowerCase().replace(/’/g, "'").trim();

function classify(word: string): Num {
  const w = norm(word).replace(/[^a-z']/g, "");
  if (w === "i") return "i";
  if (w === "you") return "you";
  if (w === "he" || w === "she" || w === "it") return "sg";
  if (w === "we" || w === "they") return "pl";
  if (/^(every|any|some|no)(one|body|thing)$/.test(w)) return "sg";
  if (PLURAL_IRREGULAR.has(w)) return "pl";
  if (SINGULAR_S.has(w)) return "sg";
  if (/[^s']s$/.test(w) && !/(us|is)$/.test(w)) return "pl";
  return "sg";
}

/** Grammatical number/person of the subject of the blank, or null if unclear. */
function subjectOf(prompt: string): Num | null {
  const idx = prompt.indexOf("___");
  if (idx < 0) return null;
  const before = prompt
    .slice(0, idx)
    .replace(/[^\p{L}' ]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const after = prompt
    .slice(idx + 3)
    .replace(/[^\p{L}' ]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const last = before[before.length - 1];
  // After a modal, "to" or 'll the slot takes a bare verb: there is no subject to agree with.
  if (last && (SLOT_MODALS.has(norm(last)) || norm(last) === "to" || /'(ll|d)$/.test(norm(last))))
    return null;
  if (last && !WH.has(norm(last)) && !/^(how much|how many)$/.test(norm(last))) {
    // "How much ___ this cost?" style: wh-phrase then blank.
    if (before.length >= 2 && WH.has(norm(before[before.length - 2]!)))
      return classify(after[0] ?? "");
    return classify(last);
  }
  // Inverted question ("___ you help me?", "What ___ you doing?"): subject follows.
  const next = after[0];
  if (!next) return null;
  if (/^(the|my|your|his|her|our|their|this|that|these|those|a|an)$/.test(norm(next))) {
    const noun = after[1];
    return noun ? classify(noun) : null;
  }
  return classify(next);
}

const PAST_CUE =
  /\b(yesterday|last (night|week|month|year|summer|winter|time)|ago|when (i|he|she|we|they|you|it) (was|were|\w+ed|arrived|came|left|called|got|saw|went)|then|used to|before|born|in (1|2)\d{3}|once|earlier|at the time|while|already|never (been|before)|this morning)\b/i;
const PRESENT_CUE =
  /\b(now|today|every|always|usually|often|sometimes|at the moment|these days|currently|nowadays|right now|tonight)\b/i;
const FUTURE_CUE =
  /\b(tomorrow|next (week|month|year)|tonight|soon|later|will|going to|by (june|friday|monday))\b/i;

type Family = "be" | "do" | "have";

const FAMILY: Record<string, { family: Family; tense: "past" | "present"; neg: boolean }> = {};
function reg(forms: string[], family: Family, tense: "past" | "present", neg = false) {
  for (const f of forms) FAMILY[f] = { family, tense, neg };
}
reg(["am", "is", "are"], "be", "present");
reg(["was", "were"], "be", "past");
reg(["isn't", "aren't"], "be", "present", true);
reg(["wasn't", "weren't"], "be", "past", true);
reg(["do", "does"], "do", "present");
reg(["did"], "do", "past");
reg(["don't", "doesn't"], "do", "present", true);
reg(["didn't"], "do", "past", true);
reg(["have", "has"], "have", "present");
reg(["had"], "have", "past");
reg(["haven't", "hasn't"], "have", "present", true);
reg(["hadn't"], "have", "past", true);

/** Does this family form agree with the subject? Past forms: only be varies. */
function agrees(form: string, subj: Num): boolean {
  if (form === "am") return subj === "i";
  if (form === "is" || form === "isn't") return subj === "sg";
  if (form === "are" || form === "aren't") return subj === "pl" || subj === "you";
  if (form === "was" || form === "wasn't") return subj === "i" || subj === "sg";
  if (form === "were" || form === "weren't") return subj === "pl" || subj === "you";
  if (form === "do" || form === "don't") return subj !== "sg";
  if (form === "does" || form === "doesn't") return subj === "sg";
  if (form === "have" || form === "haven't") return subj !== "sg";
  if (form === "has" || form === "hasn't") return subj === "sg";
  return true; // did, had, didn't, hadn't: any subject
}

const MODAL_GROUPS: string[][] = [
  ["can", "could", "may", "might"],
  ["will", "would", "shall"],
  // Deduction / advice: "She must / should / might / may / could / needn't be at work now".
  ["must", "should", "need", "might", "may", "could", "will", "would"],
];
const MODAL_NEG_BASE: Record<string, string> = {
  "mustn't": "must",
  "shouldn't": "should",
  "needn't": "need",
  "won't": "will",
  "wouldn't": "would",
  "can't": "can",
  "couldn't": "could",
  "mightn't": "might",
  "shan't": "shall",
};

const PP_START =
  /^\s*(at|in|on|from|with|by|near|every|each|during|after|before|around|here|there|together|today|now|again|often|always|usually|sometimes|outside|inside|upstairs|downstairs|alone)\b/i;

/** Verbs that read fine with only an adverbial after them ("They study at home"). */
const NEEDS_OBJECT = new Set([
  "have",
  "has",
  "had",
  "need",
  "needs",
  "want",
  "wants",
  "like",
  "likes",
  "take",
  "takes",
  "make",
  "makes",
  "give",
  "gives",
  "bring",
  "brings",
  "get",
  "gets",
  "put",
  "puts",
  "keep",
  "keeps",
  "hold",
  "holds",
  "find",
  "finds",
  "leave",
  "leaves",
  "show",
  "shows",
  "tell",
  "tells",
  "send",
  "sends",
  "buy",
  "buys",
  "carry",
  "carries",
  "wash",
  "washes",
  "brush",
  "brushes",
  "drive",
  "drives",
]);
const VERB_BASES = new Set([
  "study",
  "work",
  "live",
  "play",
  "sleep",
  "fly",
  "go",
  "run",
  "walk",
  "stay",
  "wait",
  "eat",
  "drink",
  "read",
  "cook",
  "sit",
  "stand",
  "meet",
  "swim",
  "sing",
  "arrive",
  "start",
  "finish",
  "open",
  "close",
  "rest",
  "relax",
  "travel",
  "speak",
  "talk",
  "learn",
  "teach",
  "write",
  "dance",
  "shop",
  "train",
  "exercise",
  "wake",
  "smile",
  "laugh",
  "rain",
  "snow",
  "begin",
  "end",
  "stop",
  "sell",
  "paint",
  "drive",
]);
function lexicalVerbShape(w: string): "base" | "s" | null {
  if (NEEDS_OBJECT.has(w)) return null;
  if (VERB_BASES.has(w)) return "base";
  if (w === "goes") return "s";
  if (w.endsWith("ies") && VERB_BASES.has(w.slice(0, -3) + "y")) return "s";
  if (w.endsWith("es") && VERB_BASES.has(w.slice(0, -2))) return "s";
  if (w.endsWith("s") && VERB_BASES.has(w.slice(0, -1))) return "s";
  return null;
}

function tenseCue(prompt: string): "past" | "present" | "none" {
  if (PAST_CUE.test(prompt)) return "past";
  if (PRESENT_CUE.test(prompt) || FUTURE_CUE.test(prompt)) return "present";
  return "none";
}

/**
 * Why `candidate` would make a correct sentence in the blank of `prompt` (whose
 * intended answer is `answer`), or null if it is genuinely wrong there.
 */
export function alsoCorrectReason(
  prompt: string,
  answer: string,
  candidate: string,
): string | null {
  if (!prompt.includes("___")) return null;
  const a = norm(answer);
  const c = norm(candidate);
  if (a === c) return null;
  const subj = subjectOf(prompt);
  const cue = tenseCue(prompt);
  const after = prompt.slice(prompt.indexOf("___") + 3);

  // 1. Same family (be / do / have): another tense or polarity that agrees with the subject.
  // A tag question ("..., ___ they?") must echo the main verb: one auxiliary fits.
  if (/,\s*___\s+\w+\s*\?\s*$/.test(prompt)) return null;
  const fa = FAMILY[a];
  const fc = FAMILY[c];
  if (fa && fc && fa.family === fc.family && subj) {
    if (!agrees(c, subj)) return null;
    // A cue that fixes the tense rules the other tense out.
    if (fc.tense !== fa.tense && cue !== "none") return null;
    // A negative/positive pair where the sentence already carries "not"/"never" is fixed.
    if (fc.neg !== fa.neg && /\b(not|never|n't)\b/i.test(prompt)) return null;
    // "not" after the blank: only a positive form can sit before it.
    if (fc.neg && /\bnot\b/i.test(after)) return null;
    return `${c} agrees with the subject and nothing in the sentence fixes the tense or polarity`;
  }

  // 2. Interchangeable modals (can/could/may/might, will/would/shall) and their
  //    negatives. A past or future cue fixes the form, so those are left alone.
  const baseOf = (w: string) => MODAL_NEG_BASE[w] ?? w;
  // In a conditional or a wish the tense of the other clause picks will or would,
  // so that pair is not interchangeable there.
  const conditional = /\b(if|wish)\b/i.test(prompt);
  const sameGroup = MODAL_GROUPS.some(
    (g) => g.includes(baseOf(a)) && g.includes(baseOf(c)) && !(conditional && g.includes("would")),
  );
  // A bracketed clue ("(asking for permission)") already picks the one that fits.
  const hasClue = /\([^)]{4,}\)\s*$/.test(prompt);
  // The result clause of a conditional takes a weaker modal as well as will/would.
  if (
    !hasClue &&
    conditional &&
    ["will", "would"].includes(baseOf(a)) &&
    ["could", "might", "may", "should", "can"].includes(baseOf(c)) &&
    !/\bnot\b|n't/i.test(prompt)
  ) {
    return `${c} is an acceptable modal in the result clause`;
  }
  if (sameGroup && !hasClue && !PAST_CUE.test(prompt) && !FUTURE_CUE.test(prompt)) {
    // A sentence that already says "not" cannot take a positive or a negative modal freely.
    if (/\bnot\b|n't/i.test(prompt)) return null;
    return `${c} is an acceptable modal here`;
  }

  // 2b. Place prepositions before a definite object ("sitting ___ the table"):
  //     under / behind / beside / next to / near ... all make a correct sentence.
  //     Only when an article or possessive follows, so fixed phrases ("in cash",
  //     "by bus") are left alone.
  if (
    !hasClue &&
    LOCATIVE.has(a) &&
    (LOCATIVE.has(c) || (LOCATIVE_CANDIDATE_ONLY.has(c) && !TIME_OBJECT.test(after))) &&
    /^\s*(the|a|an|my|your|his|her|their|our|this|that)\b/i.test(after)
  ) {
    return `${c} is another place preposition that fits before "${after.trim().split(/[.?!]/)[0]}"`;
  }

  // 2c. After "I wish" / "if only" a past-perfect "had been" is a correct sentence
  //     before an adjective ("I wish my neighbours had been so noisy").
  if (c === "had been" && fa?.family === "be" && /\b(wish|if only)\b/i.test(prompt)) {
    return `"had been" is a correct past-perfect wish here`;
  }

  // 3. A lexical verb in a be/aux slot, where the rest of the sentence is only an
  //    adverbial ("They ___ at home"): any agreeing intransitive verb fits.
  if (fa && fa.family === "be" && subj && PP_START.test(after)) {
    const shape = lexicalVerbShape(c);
    if (shape) {
      const wantS = subj === "sg";
      if ((shape === "s") === wantS)
        return `${c} is a verb that agrees with the subject and fits "${after.trim().split(/[.?!]/)[0]}"`;
    }
  }
  return null;
}

// A place-preposition ANSWER from this set makes any other member (and any word in
// LOCATIVE_CANDIDATE_ONLY) a correct wrong answer before a definite place noun.
// in/on/at/by/along are candidate-only: they carry fixed phrases ("in a larger
// size", "at the weekend") and are the contrast a preposition lesson teaches, so
// they are not flagged when THEY are the answer.
const LOCATIVE = new Set([
  "next to",
  "in front of",
  "close to",
  "around",
  "round",
  "against",
  "under",
  "behind",
  "beside",
  "next",
  "near",
  "opposite",
  "inside",
  "outside",
  "above",
  "below",
  "beneath",
  "between",
  "among",
  "over",
  "across",
  "towards",
  "toward",
]);
const TIME_OBJECT =
  /\b(period|week|month|year|day|hour|minute|morning|evening|night|time|weekend|season|century)\b/i;
const LOCATIVE_CANDIDATE_ONLY = new Set(["in", "on", "at", "by", "along"]);
/** Time prepositions: clearly wrong where a place is needed. */
const WRONG_LOCATIVE = ["during", "since", "for", "until"];

const WRONG_BE: Record<Num, string[]> = {
  i: ["is", "are"],
  you: ["am", "is"],
  sg: ["am", "are"],
  pl: ["is", "am"],
};
const WRONG_DO: Record<Num, string[]> = {
  i: ["does"],
  you: ["does"],
  sg: ["do"],
  pl: ["does"],
};
const WRONG_HAVE: Record<Num, string[]> = {
  i: ["has"],
  you: ["has"],
  sg: ["have"],
  pl: ["has"],
};

/**
 * Wrong answers that are clearly wrong in the blank of `prompt`, for slots whose
 * answer is a be/do/have form or a modal. Each is verified against
 * alsoCorrectReason before it is returned.
 */
export function clearlyWrongFor(prompt: string, answer: string): string[] {
  const a = norm(answer);
  const subj = subjectOf(prompt);
  const fa = FAMILY[a];
  const cap = (w: string) =>
    answer[0] === answer[0]?.toUpperCase() && /^[A-Z]/.test(answer)
      ? w[0]!.toUpperCase() + w.slice(1)
      : w;
  let raw: string[] = [];
  const mbase = MODAL_NEG_BASE[a] ?? a;
  const before = prompt.slice(0, Math.max(0, prompt.indexOf("___"))).trim();
  const prev = norm(before.split(/\s+/).pop() ?? "");
  const afterModal = SLOT_MODALS.has(prev) || prev === "to" || /'(ll|d)$/.test(prev);
  if (fa && afterModal && (fa.family === "do" || fa.family === "have")) {
    // "We should ___ this again": the slot takes a bare verb, so any inflected
    // do/have/be form is wrong there.
    raw = ["does", "is", "has"];
  } else if (fa && subj) {
    const table = fa.family === "be" ? WRONG_BE : fa.family === "do" ? WRONG_DO : WRONG_HAVE;
    raw = [...table[subj]];
    if (fa.family === "be") raw.push("be");
    if (fa.family === "do") raw.push("to", "doing");
    if (fa.family === "have") raw.push("having", "to");
  } else if (LOCATIVE.has(a)) {
    raw = WRONG_LOCATIVE;
  } else if (MODAL_GROUPS.some((g) => g.includes(mbase))) {
    // Before a bare verb "ought" and "used" need a "to", and "<modal> to" is the
    // classic learner error: all three look like modals and are wrong. "does" and
    // "is" were the old fillers; "does" is correct before a bare verb ("She does
    // speak ..."), and all of them left the answer as the only modal on screen.
    const base = mbase;
    raw = [];
    if (/\bif\b/i.test(prompt) && (base === "would" || base === "will"))
      raw.push(base === "would" ? "will" : "would");
    raw.push("ought", "used", `${answer} to`);
  }
  return raw.map(cap).filter((w) => norm(w) !== a && alsoCorrectReason(prompt, answer, w) === null);
}

const SLOT_MODALS = new Set(
  "can could may might will would shall should must can't couldn't won't wouldn't needn't mustn't shouldn't ought".split(
    " ",
  ),
);

/**
 * "modal" or "aux" when `word` is a modal or a be/do/have form, else null. A cloze
 * question whose answer has one of these classes must keep a second option of the
 * same class on screen, or the answer is the only modal/auxiliary among the
 * choices and gives itself away.
 */
export function slotClassOf(word: string): "modal" | "aux" | null {
  const w = norm(word);
  if (SLOT_MODALS.has(w)) return "modal";
  if (FAMILY[w]) return "aux";
  return null;
}

const TWINS: [string, string][] = [
  ["round", "around"],
  ["toward", "towards"],
  ["among", "amongst"],
];

/** True when two options are two spellings of one word, so showing both is noise. */
export function isTwinSpelling(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  return TWINS.some(([p, q]) => (x === p && y === q) || (x === q && y === p));
}
