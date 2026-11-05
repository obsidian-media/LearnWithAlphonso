import type { Lesson, Question, Unit } from "./curriculum";
import type { Level } from "./levels";
import {
  EXTRA_DECOYS,
  ROMANCE_A1A2,
  bannedBecause,
  homophoneOnly,
  optionClass,
  type OptionClass,
} from "./romance-options";
import { ROMANCE_CLOZE } from "./romance-cloze-options";

/**
 * Shared content-bank engine. A pack holds ~25 terse lines that the
 * generator expands into 5-question lessons grouped into units. Used by
 * every course (English, French, …).
 */
export type Pack = {
  id: string;
  title: string;
  subtitle: string;
  note: string;
  /**
   * "pair" lines: "left|right" — prompt asks for the right side.
   * "cloze" lines: the left side carries the "___" blank.
   * "listening" lines: "audioText|answer" — the left side is spoken aloud and
   * the pack's own `prompt` is the stem shown after playback.
   * "speak" lines: "phrase|phrase" — the same text twice, because what is
   * shown is exactly what the learner must say. The pack's `prompt` is the
   * instruction ("Say this aloud:").
   * "translate" lines: "idea|phrasing;phrasing;phrasing" — the left side
   * describes what to express WITHOUT giving the sentence away, and the right
   * side is the semicolon-separated list of wordings that count, most
   * canonical first. Mirrors lesson-bank.ts's (English's) pack format exactly
   * — see that file's comment for the full authoring rationale.
   */
  kind: "pair" | "cloze" | "listening" | "speak" | "translate";
  /** prompt template for pair/listening packs, `%s` is the left side. */
  prompt?: string;
  data: string;
};

export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** The sentence with a short clue: it replaces a bracketed word the line already has, else follows the sentence. */
function withClue(sentence: string, clue: string): string {
  return /\([^)]*\)/.test(sentence)
    ? sentence.replace(/\([^)]*\)/, `(${clue})`)
    : `${sentence} (${clue})`;
}

/** The person a French reflexive form is in: me/m' (je), te/t', se/s', nous, vous. */
function clitic(form: string): string {
  const w = form.toLowerCase().split(/[\s']/)[0] ?? "";
  return w === "m" ? "me" : w === "t" ? "te" : w === "s" ? "se" : w;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * The candidates in a seeded order that visits every one of them once. The step was a flat 7, which
 * only visits every candidate when 7 does not divide the count: a 15-line pack (14 others) walked
 * between two of them, so its questions had two wrong options instead of three.
 */
function hashedWalk<T>(others: T[], seed: string, coprime = true): T[] {
  const n = others.length;
  const start = hash(seed) % Math.max(1, n);
  const step = coprime ? ([7, 5, 3, 1].find((k) => gcd(k, n) === 1) ?? 1) : 7;
  const walk: T[] = [];
  for (let i = 0; i < n; i++) {
    const cand = others[(start + i * step) % n];
    if (cand) walk.push(cand);
  }
  return walk;
}

/**
 * Wrong options for a pair line of an A1/A2 French or Spanish pack: never the answer's own words
 * or a synonym the pack also teaches, and the same kind of word as the answer (a verb for a verb,
 * a noun for a noun) before any other. Falls back to other classes only when the pack has fewer
 * than three of the answer's class.
 */
function pickPairDistractors(
  index: number,
  entries: { text: string; cls: OptionClass }[],
  seed: string,
  extra: { text: string; cls: OptionClass }[] = [],
): string[] {
  const me = entries[index]!;
  const others = [...entries.filter((_, i) => i !== index), ...extra].filter(
    (e) => !bannedBecause(me.text, e.text),
  );
  const seen = new Set<string>([me.text.toLowerCase()]);
  const unique = hashedWalk(others, seed).filter((e) => {
    const k = e.text.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const same = unique.filter((e) => e.cls === me.cls);
  const rest = unique.filter((e) => e.cls !== me.cls);
  return [...same, ...rest].slice(0, 3).map((e) => e.text);
}

function pickDistractors(
  answer: string,
  pool: string[],
  seed: string,
  preferConfusable = false,
  coprime = true,
  soundAlike = false,
  samePerson = false,
) {
  const others = pool.filter(
    (o) => o.toLowerCase() !== answer.toLowerCase() && !(soundAlike && homophoneOnly(answer, o)),
  );
  const walk = hashedWalk(others, seed, coprime);
  // Listening ranks by confusability instead of the hashed walk's raw order:
  // the whole sentence is the answer, so a good distractor is one the learner
  // might mishear it as, not one that could grammatically fill a blank (there
  // is no blank). This is deliberately NOT `src/lib/distractor-affinity.ts`'s
  // `orderDistractorCandidates` -- that ranks by part-of-speech affinity via
  // `compromise`, an English-only NLP library (spec
  // docs/superpowers/specs/2026-09-24-french-content-audit-design.md section
  // 2.1), and stays out of this shared engine until the morphology decision in
  // that spec's section 8.3 is made. `orderByLexicalSimilarity` there is a
  // *different*, language-neutral function (pure content-word overlap, no POS
  // tagging) -- reimplemented here with a Unicode-aware tokenizer instead of
  // its `[a-z]`-only one, which would otherwise silently drop every accented
  // French/Spanish content word from the comparison.
  const ordered = preferConfusable
    ? orderByContentWordOverlap(answer, walk)
    : samePerson
      ? [
          ...walk.filter((c) => clitic(c) === clitic(answer)),
          ...walk.filter((c) => clitic(c) !== clitic(answer)),
        ]
      : walk;
  const out: string[] = [];
  // Dedupe case-insensitively -- a cloze pack legitimately reuses the same
  // word as the correct answer for two different lines with different
  // capitalization (e.g. sentence-initial "May ...?" vs mid-sentence
  // "... may have ..."). A case-sensitive `out.includes` check let both
  // land as separate distractors, producing two choices that read as
  // identical to the learner. Found via an automated content-consistency
  // scan (2026-09-22) across all 3 course content banks.
  const seen = new Set<string>([answer.toLowerCase()]);
  for (let i = 0; out.length < 3 && i < ordered.length; i++) {
    const cand = ordered[i];
    const key = cand?.toLowerCase();
    if (cand && key && !seen.has(key)) {
      out.push(cand);
      seen.add(key);
    }
  }
  return out;
}

// English never reaches this function -- it has its own generator and its
// own full-English stopword list in distractor-affinity.ts's contentWords.
// This engine currently serves French and Spanish, so the list is theirs;
// extend it if/when a third language's content flows through `listening`.
const STOP_WORDS = new Set([
  // French
  "le",
  "la",
  "les",
  "l'",
  "un",
  "une",
  "des",
  "de",
  "du",
  "et",
  "à",
  "en",
  "est",
  "sont",
  "il",
  "elle",
  "ils",
  "elles",
  "je",
  "tu",
  "nous",
  "vous",
  "que",
  "qui",
  "pas",
  "ne",
  "pour",
  "avec",
  "sur",
  "dans",
  "ce",
  "cette",
  "ces",
  "son",
  "sa",
  "ses",
  "au",
  "aux",
  // Spanish
  "el",
  "los",
  "las",
  "unos",
  "unas",
  "del",
  "y",
  "a",
  "es",
  "son",
  "yo",
  "él",
  "ella",
  "ellos",
  "ellas",
  "tú",
  "nosotros",
  "vosotros",
  "no",
  "para",
  "con",
  "sobre",
  "este",
  "esta",
  "estos",
  "estas",
  "su",
  "sus",
]);

/**
 * `\p{L}`/`\p{N}` (Unicode property escapes) match any letter/number in any
 * script, so this tokenizer works unchanged for French, Spanish, or a future
 * language, unlike an `[a-z]`-only pattern that silently strips accented
 * content words before they can ever be compared.
 */
function contentWordsUnicode(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/_+/g, " ")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  return words.filter((w) => !STOP_WORDS.has(w));
}

/**
 * Orders candidates so the sentence most easily confused with `answer` comes
 * first, measured by shared content words. Used only for `listening` (see
 * `pickDistractors`'s `preferConfusable`) -- reorders and never drops, so it
 * cannot change a question's choice count.
 */
function orderByContentWordOverlap(answer: string, candidates: string[]): string[] {
  const target = contentWordsUnicode(answer);
  if (target.length === 0) return candidates;
  return candidates
    .map((candidate, index) => {
      const words = contentWordsUnicode(candidate);
      const shared = target.filter((w) => words.includes(w)).length;
      return { candidate, index, shared };
    })
    .sort((a, b) => b.shared - a.shared || a.index - b.index)
    .map((entry) => entry.candidate);
}

export function packQuestions(pack: Pack): Question[] {
  const lines = pack.data
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split("|").map((p) => p.trim()));
  const pool = lines.map((l) => l[1]!);
  const romance = ROMANCE_A1A2.test(pack.id);
  // The generated sentence packs ("frga2p1") pick their own lines by running this function, so their
  // walk stays as it was; every other A1/A2 pack gets the walk that reaches all its candidates.
  const wideWalk = romance && !/^(fr|es)g/.test(pack.id);
  const classed =
    romance && pack.kind === "pair"
      ? lines.map(([gloss, text], i) => ({
          text: text!,
          cls: optionClass(pack.id, i, gloss!, text!),
        }))
      : null;
  const extra = (EXTRA_DECOYS[pack.id] ?? []).flatMap((g) =>
    g.words.map((text) => ({ text, cls: g.cls })),
  );
  const authored = romance && pack.kind === "cloze" ? ROMANCE_CLOZE[pack.id] : undefined;
  return lines.map(([left, right], i) => {
    const answer = right!;
    const seed = `${pack.id}-${i}`;
    // Returned before any distractor work: a speaking question has no choices
    // and no word bank, so picking distractors would be effort whose result is
    // discarded, and the mc/fill split below does not apply to it either.
    if (pack.kind === "speak") {
      return {
        id: `${pack.id}q${i}`,
        type: "speak",
        prompt: pack.prompt ?? "Say this aloud:",
        answer: left!,
        explanation: `Target phrase: "${left}" ${pack.note}`,
      };
    }
    // Same reasoning as speak: a translate question has no choices and no word
    // bank, so the distractor work below is effort whose result is discarded.
    if (pack.kind === "translate") {
      const answers = right!
        .split(";")
        .map((a) => a.trim())
        .filter(Boolean);
      return {
        id: `${pack.id}q${i}`,
        type: "translate",
        prompt: left!,
        acceptableAnswers: answers,
        explanation: `One way to say it: "${answers[0]}" ${pack.note}`,
      };
    }
    // Built before the distractors so they can be ranked against it -- a
    // candidate already present in the prompt makes a poor wrong answer.
    const prompt =
      pack.kind === "cloze" && authored?.[i]?.hint
        ? withClue(left!, authored[i]!.hint!)
        : pack.kind === "pair"
          ? (pack.prompt ?? "%s").replace("%s", left!)
          : pack.kind === "listening"
            ? // Substituted like a pair prompt so a template reused from one does
              // not ship a literal "%s" on screen. The audio is heard, not read,
              // so the sentence is only ever the fallback for a template that
              // asks for it explicitly.
              (pack.prompt ?? "What did you hear?").replace("%s", left!)
            : left!;
    const line = authored?.[i];
    const distractors = classed
      ? pickPairDistractors(i, classed, seed, extra)
      : line
        ? line.wrong
        : pickDistractors(
            answer,
            pool,
            seed,
            pack.kind === "listening",
            wideWalk,
            romance && pack.kind === "listening",
            pack.id === "fra2p6",
          );
    const explanation =
      pack.kind === "pair"
        ? `${left} → ${answer}. ${pack.note}`
        : pack.kind === "listening"
          ? // The audio sentence already ends in its own punctuation, so quoting
            // it and adding a full stop produced `"... rise.". note`.
            `The audio says "${left}" ${pack.note}`
          : `"${answer}" is correct here. ${pack.note}`;
    if (pack.kind === "listening") {
      // Order is cosmetic here: `answer` is the choice text, so there is no
      // index to keep in sync with the shuffle.
      const choices = [answer, ...distractors].sort((a, b) => hash(a + seed) - hash(b + seed));
      return {
        id: `${pack.id}q${i}`,
        type: "listening",
        prompt,
        audioText: left!,
        choices,
        answer,
        explanation,
      };
    }
    const useMc = (hash(seed) & 1) === 0 || distractors.length < 3;
    if (useMc) {
      const choices = [answer, ...distractors];
      const at = hash(seed + "x") % choices.length;
      choices[0] = choices[at]!;
      choices[at] = answer;
      return {
        id: `${pack.id}q${i}`,
        type: "mc",
        prompt,
        choices,
        answer: at,
        explanation,
      };
    }
    return {
      id: `${pack.id}q${i}`,
      type: "fill",
      prompt: pack.kind === "cloze" ? prompt : `${prompt} ___`,
      bank: [answer, ...distractors].sort((a, b) => hash(a + seed) - hash(b + seed)),
      answer,
      explanation,
    };
  });
}

/**
 * Re-shuffles a question's answer-order presentation (MC choice order, or
 * fill-bank word order) using a fresh seed, leaving the underlying prompt/
 * answer/explanation untouched. Since the curriculum is built once at
 * module load (not per-attempt), this is what makes replaying the same
 * lesson feel different each time: call it with a new per-attempt seed
 * when a lesson mounts, rather than relying on packQuestions()'s
 * one-time-at-load seed.
 */
export function reshuffleQuestion(q: Question, seed: string): Question {
  if (q.type === "mc") {
    const order = q.choices
      .map((_, i) => i)
      .sort((a, b) => hash(`${seed}-${a}`) - hash(`${seed}-${b}`));
    const choices = order.map((i) => q.choices[i]!);
    return { ...q, choices, answer: order.indexOf(q.answer) };
  }
  if (q.type === "reorder") {
    const tokens = [...q.tokens].sort((a, b) => hash(seed + a) - hash(seed + b));
    return { ...q, tokens };
  }
  // A speaking question has no choices, bank or tokens -- there is nothing to
  // reshuffle, so it is returned untouched.
  if (q.type === "speak") return q;
  // Nor does a translate question, and its acceptableAnswers are a grading
  // list rather than a display order -- shuffling them would be pointless as
  // well as wrong. This branch must stay ABOVE the `bank` fallthrough below,
  // which would otherwise spread a property this variant does not have.
  if (q.type === "translate") return q;
  if (q.type === "listening") {
    // Reshuffling the choices is safe here precisely because `answer` is the
    // choice text rather than an index -- there is nothing to keep in sync.
    const choices = [...q.choices].sort((a, b) => hash(seed + a) - hash(seed + b));
    return { ...q, choices };
  }
  const bank = [...q.bank].sort((a, b) => hash(seed + a) - hash(seed + b));
  return { ...q, bank };
}

const QUESTIONS_PER_LESSON = 5;
const LESSONS_PER_UNIT = 5;

export function buildLevel(level: Level, packs: Pack[], startUnitIndex: number): Unit[] {
  const units: Unit[] = [];
  packs.forEach((pack) => {
    const qs = packQuestions(pack);
    const lessons: Lesson[] = [];
    for (let i = 0; i < qs.length; i += QUESTIONS_PER_LESSON) {
      const slice = qs.slice(i, i + QUESTIONS_PER_LESSON);
      if (slice.length < 3) break;
      const n = lessons.length + 1;
      lessons.push({
        id: `${pack.id}l${n}`,
        title: `${pack.title} ${n}`,
        subtitle: pack.subtitle,
        questions: slice,
      });
    }
    for (let i = 0; i < lessons.length; i += LESSONS_PER_UNIT) {
      const group = lessons.slice(i, i + LESSONS_PER_UNIT);
      const idx = startUnitIndex + units.length + 1;
      units.push({
        id: `${pack.id}u${i / LESSONS_PER_UNIT + 1}`,
        level,
        eyebrow: `Unit ${idx}`,
        title: pack.title,
        description: `${pack.subtitle} — ${pack.note}`,
        lessons: group,
      });
    }
  });
  return units;
}

export function unitsFromBank(
  bank: Record<Level, Pack[]>,
  existingCountByLevel: Record<Level, number>,
): Unit[] {
  const levels: Level[] = ["A1", "A2", "B1", "B2", "C1"];
  return levels.flatMap((l) => buildLevel(l, bank[l] ?? [], existingCountByLevel[l] ?? 0));
}

/**
 * V3 pkg 4b -- "in-lesson reinforcement." Picks one extra question testing
 * the same concept as a question the learner just missed, for immediate
 * retrieval practice, right there in the lesson rather than only later in
 * spaced review. Reuses existing curriculum data outright -- no new
 * content, no difficulty tagging (none exists).
 *
 * `doingWell` implements "skew toward easier or harder based on how
 * you're doing" without inventing a difficulty score this data doesn't
 * have: `siblingQuestions` (the same unit/pack -- same exact grammar or
 * vocab point, tightly scaffolded) is the default, "easier" pool;
 * `levelQuestions` (everything else at this CEFR level -- broader, less
 * predictable) is drawn from instead once the learner is doing well this
 * session. Falls back to the other pool if the preferred one is empty
 * (e.g. a hand-authored unit with no other lessons), and returns `null`
 * only if both are empty.
 *
 * Callers are responsible for excluding the current lesson's own
 * questions from both pools before calling this -- `Question.id` is only
 * unique *within* a lesson (hand-authored English lessons reuse "q1".."q8"),
 * so filtering by id here would risk wrongly excluding a legitimate
 * sibling question that happens to share an id with one in this lesson.
 */
export function pickReinforcementQuestion(params: {
  siblingQuestions: Question[];
  levelQuestions: Question[];
  doingWell: boolean;
  seed: string;
}): Question | null {
  const primary = params.doingWell ? params.levelQuestions : params.siblingQuestions;
  const fallback = params.doingWell ? params.siblingQuestions : params.levelQuestions;
  const pool = primary.length > 0 ? primary : fallback;
  if (pool.length === 0) return null;
  return pool[hash(params.seed) % pool.length]!;
}
