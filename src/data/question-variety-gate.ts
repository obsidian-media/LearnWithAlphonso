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
  "in|at|on|near|outside|inside|around|beside|behind|under|over|next to|across from|opposite|across|with|beneath|among|between|along|through|against";
/** A place phrase after a full verb ("... in the park"): a copula keeps its one place. */
const PLACE_RULE = new RegExp(
  String.raw`(?<!${COP} )(?<!${COP} (?:right |just |also |still |not )?)\b(${PLACE_PREP}) (?:(?:${DET}) )?\w+(?: \w+)?$`,
);
/** Checked against the lower-case sentence without its final punctuation. */
const MOVABLE: RegExp[] = [
  // when
  /\b(today|tonight|tomorrow|yesterday|now|then|soon|later|already|still|yet|again|instead|suddenly|please)\b/,
  /\b(before|after|when|while|because|if|until|since|during|although|as soon as)\b/,
  /(?<!\bthe )\b(this|last|next|every|each) (morning|afternoon|evening|night|weekend|week|year|month|summer|winter|spring|autumn|day|time|sunday|saturday|monday|tuesday|wednesday|thursday|friday)\b/,
  new RegExp(String.raw`\b(every|each|on) (${DAYS})s?\b`),
  new RegExp(String.raw`\bin (${MONTHS}|\d{4})\b`),
  /\bon (rainy|sunny|cold|hot|summer|winter|week|weekend)?\s*(days?|weekdays|weekends|holidays)\b/,
  /\b(at|in|by) (the )?(night|noon|dawn|midnight|weekends?|the weekend|the morning|the evening|the afternoon|summer|winter|spring|autumn|the end)\b/,
  /\bat \w+ (o'clock|sharp)\b|\bo'clock\b|\bsharp\b/,
  /\bat (one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\b/,
  new RegExp(String.raw`\b(for|on|by) (${DAYS})\b`),
  /\bfor (\w+ ){1,2}(seconds|minutes|hours|days|weeks|months|years)\b/,
  /\b(early|late)$/,
  /\ball (day|night|morning|afternoon|evening|week|year|summer|winter|the time)\b/,
  /\bfor (breakfast|lunch|dinner|supper|dessert)\b/,
  /\b(due to|because of)\b/,
  // how often (always, never, rarely, seldom and hardly ever stay in the middle: fronting them changes the words)
  /\b(usually|often|sometimes|normally|generally|frequently|regularly|routinely|occasionally|periodically|constantly|continually|repeatedly)\b/,
  /\b(now and then|from time to time|once|twice|every)\b/,
  /\b(times|once|twice|per) (a )?(day|week|month|year)\b/,
  // where
  /\b(nearby|downtown|upstairs|downstairs|abroad|at home|in class|at school|at work|in town|in bed|on tv|in american english|in british english)\b/,
  PLACE_RULE,
  // two clauses that can swap places ("Take an umbrella - it might rain") or a trailing "sorry"
  /—|,(?! so\b)(?! not\b)|\bsorry$/,
  // a particle that can sit before or after the object ("try this on", "set up a plan", "rolled up his sleeves")
  new RegExp(
    String.raw`\b(try|put|take|turn|switch|let|pick|hand|fill|throw|give|bring|roll|rolled|set|check|write|work|sort)\b (up|down|out|off|on|in|away|back) (${DET}|some|any)\b|\b(try|put|take|turn|switch|let|pick|hand|fill|throw|give|bring|roll|set|check|write|sort) (this|that|these|those|it|them) (up|down|out|off|on|in|away|back)\b|\blet some \w+ in$`,
  ),
  // a purpose clause ("... to save lives", "... to erase mistakes") can come first
  /\b(?<!\b(?:want|wants|need|needs|like|likes|love|loves|going|used|have|has|had|ready|able|asked|told|allowed|how|try|tries|trying|forward|rather|about|promise|expect|decided|manage|supposed|time|nice|good|hard|easy|ought|learn|hate|start|begin|enough|too) )to (save|relax|let|stay|erase|help|check|find|see|buy|cook|get|make|share|practise|practice|keep|pay|win|clean|wash|carry|cut|protect|travel|reach|show|stop|watch|erase) /,
];
const LY_OK = new Set(
  "really friendly lovely lonely ugly silly family lively early only july italy jelly belly bully supply apply reply fly rely assembly butterfly".split(
    " ",
  ),
);

/** The movable adverbial a sentence contains, or null when the sentence has one natural order. */
export function movableAdverbial(sentence: string): string | null {
  const original = sentence.trim().replace(/[.!?]+$/, "");
  // "How often ...?" is a fixed question phrase, not a movable adverbial.
  const s = original.toLowerCase().replace(/\bhow often\b/g, "how");
  // "X is Y" with two noun phrases swaps ("The shortest month is February" / "February is the shortest month").
  if (/ is [A-Z][a-z]+$/.test(original)) return "is " + original.split(" ").pop()!.toLowerCase();
  for (const re of MOVABLE) {
    // put/place/bring + object + place keep the one place their verb needs
    if (re === PLACE_RULE && /^(put|place|bring|hang|leave) /.test(s)) continue;
    const m = re.exec(s);
    if (m) return m[0];
  }
  for (const w of wordsOf(s)) if (/..ly$/.test(w) && !LY_OK.has(w)) return w;
  return null;
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
