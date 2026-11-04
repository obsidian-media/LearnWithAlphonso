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
];
const MODAL_NEG_BASE: Record<string, string> = {
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
  const sameGroup = MODAL_GROUPS.some((g) => g.includes(baseOf(a)) && g.includes(baseOf(c)));
  if (sameGroup && !PAST_CUE.test(prompt) && !FUTURE_CUE.test(prompt)) {
    // A sentence that already says "not" cannot take a positive or a negative modal freely.
    if (/\bnot\b|n't/i.test(prompt)) return null;
    return `${c} is an acceptable modal here`;
  }

  // 2b. Place prepositions before a definite object ("sitting ___ the table"):
  //     under / behind / beside / next to / near ... all make a correct sentence.
  //     Only when an article or possessive follows, so fixed phrases ("in cash",
  //     "by bus") are left alone.
  if (
    LOCATIVE.has(a) &&
    LOCATIVE.has(c) &&
    /^\s*(the|a|an|my|your|his|her|their|our|this|that)\b/i.test(after)
  ) {
    return `${c} is another place preposition that fits before "${after.trim().split(/[.?!]/)[0]}"`;
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

// Deliberately NOT in/on/at/by/around/along: those carry fixed phrases ("in a larger
// size", "at the weekend") and are the contrast a preposition lesson teaches.
const LOCATIVE = new Set([
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
  if (fa && subj) {
    const table = fa.family === "be" ? WRONG_BE : fa.family === "do" ? WRONG_DO : WRONG_HAVE;
    raw = [...table[subj]];
    if (fa.family === "be") raw.push("be");
    if (fa.family === "do") raw.push("to", "doing");
    if (fa.family === "have") raw.push("having", "to");
  } else if (LOCATIVE.has(a)) {
    raw = WRONG_LOCATIVE;
  } else if (MODAL_GROUPS.some((g) => g.includes(a)) || a === "won't") {
    raw = ["to", "is", "does"];
  }
  return raw.map(cap).filter((w) => norm(w) !== a && alsoCorrectReason(prompt, answer, w) === null);
}
