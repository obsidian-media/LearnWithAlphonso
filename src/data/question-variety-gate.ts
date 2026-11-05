// Quality checks for the questions question-variety.ts appends. The generator uses them to choose
// what to emit and question-variety.test.ts re-checks the output, so a regression in either one
// shows up as a failing test.
//
// - movableAdverbial: a reorder sentence with a time, frequency, manner or place adverbial can be put
//   together in more than one natural order, and the grader accepts exactly one.
// - listening choices: a wrong choice must be real, correctly spelled English that does not sound
//   like the answer, otherwise the question cannot be solved by ear.

import type { Question, Unit } from "./curriculum";

/** Lower-case words of a sentence, punctuation removed, apostrophes kept. */
export const wordsOf = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

const DAYS = "monday|tuesday|wednesday|thursday|friday|saturday|sunday";
const MONTHS =
  "january|february|march|april|may|june|july|august|september|october|november|december";
const COP = String.raw`(?:\bis|\bare|\bwas|\bwere|\bam|\bbe|\bbeen|'s|'re|'m)`;
const DET = "the|a|an|my|your|his|her|our|their|this|that|these|those";
const PLACE_PREP =
  "in|at|on|near|outside|inside|around|beside|behind|under|over|next to|across from|opposite|across|with|beneath|among|between|along|through|against|above|below|towards|past";
/** A place phrase after a full verb ("... in the park"): a copula keeps its one place. */
const PLACE_RULE = new RegExp(
  String.raw`(?<!${COP} )(?<!${COP} (?:right |just |also |still |not )?)\b(${PLACE_PREP}) (?:(?:${DET}) )?\w+(?: \w+)?$`,
);
/** A relation that reads the same with its two noun phrases swapped ("X is next to Y" / "Y is next to X"). */
const SYMMETRIC_PREP = "next to|near|beside|opposite|between|close to|across from|far from";
const OBJ_PRONOUN = "(?:me|him|her|us|them)";
/**
 * "She is taller than him", "I am not as tall as her": a subject pronoun compared with an object pronoun.
 * The other way round needs other words ("He is taller than her"), so this whole-sentence shape keeps one
 * order. Nothing may stand between the verb and the comparison: in "He likes her more than me" the two
 * objects swap with the same words ("He likes me more than her").
 */
const PRONOUN_COMPARISON = String.raw`(?:i|you|he|she|it|we|they) \w+ (?:not )?(?:(?:more |less )?\w+ than|as \w+ as) ${OBJ_PRONOUN}`;
const SPATIAL_PREP = "under|above|over|behind|below|inside|outside|in front of";

type Rule = { name: string; re: RegExp };
/** Checked against the lower-case sentence without its final punctuation. Each rule has a fixture only it catches (question-variety-gates.test.ts). */
export const MOVABLE_RULES: Rule[] = [
  // when
  {
    name: "time-adverb",
    re: /\b(today|tonight|tomorrow|yesterday|now|then|soon|later|already|still|yet|again|instead|suddenly|please)\b/,
  },
  {
    name: "time-clause",
    re: /\b(before|after|when|while|because|if|until|since|during|although|as soon as)\b/,
  },
  {
    name: "this-next-every",
    re: /(?<!\bthe )\b(this|last|next|each) (morning|afternoon|evening|night|weekend|week|year|month|summer|winter|spring|autumn|day|time)\b/,
  },
  { name: "on-day", re: new RegExp(String.raw`\b(on|this|next|last) (${DAYS})s?\b`) },
  { name: "in-month", re: new RegExp(String.raw`\bin (${MONTHS}|\d{4})\b`) },
  {
    name: "on-days",
    re: /\bon (rainy|sunny|cold|hot|summer|winter|week|weekend)?\s*(days?|weekdays|weekends|holidays)\b/,
  },
  {
    name: "at-night",
    re: /\b(at|in|by) (the )?(night|noon|dawn|midnight|weekends?|the weekend|the morning|the evening|the afternoon|summer|winter|spring|autumn|the end)\b/,
  },
  { name: "oclock", re: /\bo'clock\b|\bsharp\b/ },
  {
    name: "at-time",
    re: /\bat (one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\b/,
  },
  { name: "for-day", re: new RegExp(String.raw`\b(for|by) (${DAYS})\b`) },
  {
    name: "for-duration",
    re: /\bfor (\w+ ){1,2}(seconds|minutes|hours|days|weeks|months|years)\b/,
  },
  { name: "early-late", re: /\b(early|late)$/ },
  {
    name: "all-day",
    re: /\ball (day|night|morning|afternoon|evening|week|year|summer|winter|the time)\b/,
  },
  { name: "for-meal", re: /\bfor (breakfast|lunch|dinner|supper|dessert)\b/ },
  { name: "due-to", re: /\b(due to|because of)\b/ },
  // how often (always, never, rarely, seldom and hardly ever stay in the middle: fronting them changes the words)
  {
    name: "frequency-adverb",
    re: /\b(usually|often|sometimes|normally|generally|frequently|regularly|routinely|occasionally|periodically|constantly|continually|repeatedly)\b/,
  },
  { name: "frequency-phrase", re: /\b(now and then|from time to time|once|twice|every)\b/ },
  { name: "times-a", re: /\b(times|once|twice|per) (a )?(day|week|month|year)\b/ },
  // where
  {
    name: "place-adverb",
    re: /\b(nearby|downtown|upstairs|downstairs|abroad|at home|in class|at school|at work|in town|in bed|on tv|in american english|in british english)\b/,
  },
  { name: "place-phrase", re: PLACE_RULE },
  // two clauses that can swap places ("Take an umbrella - it might rain") or a trailing "sorry"
  { name: "clause-swap", re: /—|,(?! so\b)(?! not\b)|\bsorry$/ },
  // a particle that can sit before or after the object ("try this on", "set up a plan", "rolled up his sleeves")
  {
    name: "particle",
    re: new RegExp(
      String.raw`\b(try|put|take|turn|switch|let|pick|hand|fill|throw|give|bring|roll|rolled|set|check|write|work|sort)\b (up|down|out|off|on|in|away|back) (${DET}|some|any)\b|\b(try|put|take|turn|switch|let|pick|hand|fill|throw|give|bring|roll|set|check|write|sort) (this|that|these|those|it|them) (up|down|out|off|on|in|away|back)\b|\blet some \w+ in$`,
    ),
  },
  // a purpose clause ("... to save lives", "... to erase mistakes") can come first
  {
    name: "purpose-clause",
    re: /\b(?<!\b(?:want|wants|need|needs|like|likes|love|loves|going|used|have|has|had|ready|able|asked|told|allowed|how|try|tries|trying|forward|rather|about|promise|expect|decided|manage|supposed|time|nice|good|hard|easy|ought|learn|hate|start|begin|enough|too) )to (save|relax|let|stay|erase|help|check|find|see|buy|cook|get|make|share|practise|practice|keep|pay|win|clean|wash|carry|cut|protect|travel|reach|show|stop|watch) /,
  },
  // two things the sentence can put either way round: "A is next to B", "A is as big as B", "A is bigger than B", "X and Y", "X but Y"
  {
    name: "symmetric-relation",
    // "match(es)": "X matches Y" reads the same the other way round. A comparison is exempt only as a
    // whole PRONOUN_COMPARISON sentence ("taller than him"), where swapping the sides needs other words.
    re: new RegExp(
      String.raw`\b(${SYMMETRIC_PREP})\b|\bmatch(?:es|ed)?\b|^(?!${PRONOUN_COMPARISON}$).*\b(?:as \w+ as|than)\b|\b(and|but|or)\b`,
    ),
  },
  // "Gardening is her hobby" / "Her hobby is gardening"
  { name: "gerund-subject", re: /^\w+ing (is|are|was) / },
  // "The car park is under the shopping centre": two definite things and a spatial relation
  {
    name: "two-things-spatial",
    re: new RegExp(
      String.raw`^the [\w ]+? (?:is|are|was|were) (?:just |right )?(?:${SPATIAL_PREP}) the \w+`,
    ),
  },
];
const LY_OK = new Set(
  "really friendly lovely lonely ugly silly family lively early only july italy jelly belly bully supply apply reply fly rely assembly butterfly".split(
    " ",
  ),
);

/** The names of the rules a sentence trips (empty: one natural order). */
export function movableRuleHits(sentence: string): string[] {
  const original = sentence.trim().replace(/[.!?]+$/, "");
  // "How often ...?" is a fixed question phrase, not a movable adverbial.
  const s = original.toLowerCase().replace(/\bhow often\b/g, "how");
  const hits: string[] = [];
  // "X is Y" with two noun phrases swaps ("The shortest month is February" / "February is the shortest month").
  if (/ is [A-Z][a-z]+$/.test(original)) hits.push("is-proper-noun");
  for (const { name, re } of MOVABLE_RULES) {
    // put/place/bring + object + place keep the one place their verb needs
    if (name === "place-phrase" && /^(put|place|bring|hang|leave) /.test(s)) continue;
    if (re.test(s)) hits.push(name);
  }
  if (wordsOf(s).some((w) => /..ly$/.test(w) && !LY_OK.has(w))) hits.push("ly-adverb");
  return hits;
}

/** The movable adverbial (or swappable part) a sentence contains, or null when the sentence has one natural order. */
export function movableAdverbial(sentence: string): string | null {
  const hits = movableRuleHits(sentence);
  return hits.length ? hits[0]! : null;
}

/** Words that sound the same or nearly so but are spelled differently, which the spelling rules above miss. */
const HOMOPHONES: string[][] = [
  ["their", "there", "they're"],
  ["to", "too", "two"],
  ["for", "four", "fore"],
  ["right", "write", "rite"],
  ["see", "sea"],
  ["know", "no"],
  ["new", "knew"],
  ["buy", "by", "bye"],
  ["hear", "here"],
  ["wear", "where", "ware"],
  ["weak", "week"],
  ["meet", "meat"],
  ["one", "won"],
  ["son", "sun"],
  ["which", "witch"],
  ["whose", "who's"],
  ["its", "it's"],
  ["your", "you're"],
  ["be", "bee"],
  ["eight", "ate"],
  ["wait", "weight"],
  ["road", "rode"],
  ["tail", "tale"],
  ["plane", "plain"],
  ["mail", "male"],
  ["hour", "our"],
  ["bored", "board"],
  ["wood", "would"],
  ["whole", "hole"],
  ["pair", "pear", "pare"],
  ["bear", "bare"],
  ["dear", "deer"],
  ["flour", "flower"],
  ["steal", "steel"],
  ["peace", "piece"],
  ["break", "brake"],
  ["sail", "sale"],
  ["passed", "past"],
  ["fair", "fare"],
  ["close", "clothes"],
];

/** A rough spoken form: silent letters dropped, look-alike spellings merged, every vowel run one vowel. */
export function soundKey(word: string): string {
  let w = word.toLowerCase().replace(/[^a-z]/g, "");
  w = w
    .replace(/^kn/, "n")
    .replace(/^wr/, "r")
    .replace(/^wh/, "w")
    .replace(/igh/g, "i")
    .replace(/ough/g, "o")
    .replace(/gh/g, "")
    .replace(/ph/g, "f")
    .replace(/ck/g, "k")
    .replace(/tch/g, "ch")
    .replace(/dge/g, "j")
    .replace(/x/g, "ks")
    .replace(/q/g, "k")
    .replace(/c(?=[eiy])/g, "s")
    .replace(/c/g, "k")
    .replace(/z/g, "s");
  if (w.length > 3) w = w.replace(/e$/, "");
  w = w.replace(/(.)\1+/g, "$1").replace(/[aeiouy]+/g, "a");
  return w;
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    prev = cur;
  }
  return prev[b.length]!;
}

/** True when two different words are easy to confuse by ear or in spelling (homophones, near spellings, one inflection apart). */
export function soundsAlike(a: string, b: string): boolean {
  const x = a.toLowerCase().replace(/[^a-z']/g, "");
  const y = b.toLowerCase().replace(/[^a-z']/g, "");
  if (x === y) return false;
  if (soundKey(x) === soundKey(y)) return true;
  if (HOMOPHONES.some((g) => g.includes(x) && g.includes(y))) return true;
  // fifteen / fifty, thirteen / thirty: only the stress tells them apart.
  const teen = (n: string, m: string) =>
    n.endsWith("teen") && m.endsWith("ty") && n.slice(0, 3) === m.slice(0, 3);
  if (teen(x, y) || teen(y, x)) return true;
  const limit = Math.min(x.length, y.length) <= 3 ? 1 : 2;
  if (editDistance(x, y) <= limit) return true;
  const [s, l] = x.length < y.length ? [x, y] : [y, x];
  return s.length >= 3 && l.startsWith(s) && l.length - s.length <= 3;
}

/** Every word the course already spells correctly: prompts, right answers, examples, meanings. Wrong options are left out. */
export function knownWordsOf(units: Unit[], reviewed: Iterable<string> = []): Set<string> {
  const known = new Set<string>(reviewed);
  const add = (s: unknown) => {
    if (typeof s === "string") for (const w of wordsOf(s.replace(/_+/g, " "))) known.add(w);
  };
  for (const u of units)
    for (const l of u.lessons)
      for (const q of l.questions) {
        const x = q as Record<string, unknown>;
        add(q.explanation);
        add(x.prompt);
        add(x.example);
        add(x.meaning);
        if (q.type === "mc") add(q.choices[q.answer]);
        else if (q.type === "listening") add(q.audioText);
        else if (q.type === "translate") (q.acceptableAnswers ?? []).forEach(add);
        else if ("answer" in q) add(q.answer);
      }
  return known;
}

/** Why a wrong listening choice is not fair (empty: fine). */
export function listeningChoiceProblems(
  answer: string,
  wrong: string,
  known: Set<string>,
): string[] {
  const problems: string[] = [];
  const a = wordsOf(answer);
  const w = wordsOf(wrong);
  for (const word of w)
    if (!known.has(word)) problems.push(`"${word}" is not a word the course spells`);
  // Confusable, not unrelated: the same length, one or two words apart (three in a long sentence).
  const apart = w.filter((x, i) => x !== a[i]).length;
  if (w.length !== a.length || apart < 1 || apart > (a.length >= 7 ? 3 : 2))
    problems.push("not a close variant of the answer");
  const onlyWrong = w.filter((x) => !a.includes(x));
  const onlyAnswer = a.filter((x) => !w.includes(x));
  for (const x of onlyWrong)
    for (const y of onlyAnswer)
      if (soundsAlike(x, y)) problems.push(`"${x}" sounds or looks like "${y}"`);
  return problems;
}

export type ListeningQuestion = Extract<Question, { type: "listening" }>;

const IRREGULAR_GROUPS: string[][] = [
  ["am", "is", "are", "was", "were", "be", "been", "being"],
  ["do", "does", "did", "done", "doing"],
  ["have", "has", "had", "having"],
  ["go", "goes", "went", "gone", "going"],
  ["take", "takes", "took", "taken", "taking"],
  ["write", "writes", "wrote", "written", "writing"],
  ["know", "knows", "knew", "known", "knowing"],
  ["buy", "buys", "bought", "buying"],
  ["see", "sees", "saw", "seen", "seeing"],
  ["swim", "swims", "swam", "swum", "swimming"],
  ["sit", "sits", "sat", "sitting"],
  ["get", "gets", "got", "getting"],
  ["will", "would", "won't", "wouldn't"],
  ["can", "could"],
  ["much", "more", "most", "many"],
  ["good", "better", "best"],
  ["bad", "worse", "worst"],
];

/** Two forms of the same word (am/is/are, go/going, tidy/tidies): swapping one for the other is a grammar slip, not a different sentence. */
export function sameWordForms(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return true;
  if (IRREGULAR_GROUPS.some((g) => g.includes(x) && g.includes(y))) return true;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  if (s.length >= 2 && l.startsWith(s) && l.length - s.length <= 3) return true;
  let p = 0;
  while (p < s.length && s[p] === l[p]) p++;
  return p >= 3 && editDistance(x, y) <= 3;
}

/** True when a wrong choice differs from the answer only by word forms (a grammar error a learner can spot without hearing it). */
export function isGrammarSlip(answer: string, wrong: string): boolean {
  const a = wordsOf(answer);
  const w = wordsOf(wrong);
  const onlyWrong = w.filter((x) => !a.includes(x));
  const onlyAnswer = a.filter((x) => !w.includes(x));
  if (!onlyWrong.length) return false;
  return onlyWrong.every((x) => onlyAnswer.some((y) => sameWordForms(x, y)));
}

/** Problems with how a listening question's choices are written: they must look alike. */
export function choiceFormatProblems(choices: string[]): string[] {
  const out: string[] = [];
  const end = (c: string) => /[.?!]$/.exec(c.trim())?.[0] ?? "";
  if (new Set(choices.map(end)).size > 1) out.push("the choices end in different punctuation");
  for (const c of choices) {
    if (/\s[?.!,;]/.test(c)) out.push(`"${c}" has a space before punctuation`);
    if (/\bcan not\b/i.test(c)) out.push(`"${c}" writes "cannot" as two words`);
    if (/\s{2,}/.test(c)) out.push(`"${c}" has a double space`);
  }
  return out;
}

/** Why the wrong choices of a listening question can be ruled out by grammar alone (empty: at least one is grammatical). */
export function grammarOnlyProblems(answer: string, wrongs: string[]): string[] {
  return wrongs.length && wrongs.every((w) => isGrammarSlip(answer, w))
    ? ["every wrong choice is a grammar slip, so grammar alone solves it"]
    : [];
}
