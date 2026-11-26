// The deterministic gates for the lesson-mix content (no model, no network). Run before every review
// and again after every fix. A "problem" fails the item; a "warning" is reported and measured but does
// not fail it (a rate the plan tracks, like the 75% distractor-overlap rule of lesson-bank-listening).
//
// Gates, per type:
//   all        schema, explanation quotes the answer, no duplicate of an existing item, target language
//   listening  the prompt never restates the audio; four distinct choices, the answer exactly once;
//              wrong choices are close variants (same length, one to three words apart) and none sounds
//              like the answer (homophones; Spanish seseo, yeísmo, b/v; French est/et, a/à)
//   speak      3 to 12 words, round-trips through the course's spoken-answer normaliser and its
//              speech-to-text variants, none of the hazards named in the packs
//   translate  2 to 9 distinct wordings, first is canonical, the prompt never contains the sentence,
//              every wording matches itself, no "(e)" gender trick, word counts for the level
// Pure.

import type { Course } from "../../data/course-meta";
import type { Level } from "../../data/levels";
import type { Question } from "../../data/curriculum";
import { choiceFormatProblems } from "../../data/question-variety-gate";
import { matchesSpokenAnswer, normaliseSpoken } from "../spoken-answer";
import { matchesSpokenAnswerFr, normaliseSpokenFr } from "../spoken-answer-fr";
import { matchesSpokenAnswerEs, normaliseSpokenEs } from "../spoken-answer-es";
import { matchesAcceptableAnswer, normaliseWritten } from "../translation-answer";
import type { ExtraType, LessonExtra } from "./extras";
import { EXTRA_TYPES, toQuestion } from "./extras";
import { homophonePairs, wordsIn } from "./homophones";
import { metaTextProblems } from "./meta-gate";
import { britishFindings } from "../american-english";

export type GateResult = { problems: string[]; warnings: string[] };

export type GateContext = {
  course: Course;
  level: Level;
  /** Normalised keys (normKey) of the course's existing listening, speak and translate texts. */
  existing: {
    listening: Set<string>;
    speak: Set<string>;
    translate: Set<string>;
    /** Every question's text as curriculum-consistency.test.ts compares it (see `dedupKey`). Optional in tests. */
    all?: Set<string>;
  };
};

/** The text curriculum-consistency.test.ts compares across packs: trimmed, no trailing blank, lower case. */
export const dedupKey = (s: string): string =>
  s
    .trim()
    .replace(/\s*___\s*$/, "")
    .toLowerCase();

/** American English (owner decision 2026-11-06): any British spelling or British-only word in learner-facing text. */
export function britishProblems(course: Course, texts: string[]): string[] {
  if (course !== "en") return [];
  const out: string[] = [];
  for (const t of texts)
    for (const w of britishFindings(t))
      out.push(`"${w}" is British English (the course is American)`);
  return out;
}

/** Another question in the course already has this text: the consistency test counts that as a repeat. */
const repeatProblem = (ctx: GateContext, text: string): string[] =>
  ctx.existing.all?.has(dedupKey(text))
    ? ["duplicate: another question in the course has this exact text (a repeat to the learner)"]
    : [];

/** Comparison key for "is this the same sentence": accents and case folded, punctuation removed. */
export const normKey = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9ñ' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** The keys of everything the course already says, listens to or asks to translate. */
export function existingKeys(
  units: { lessons: { questions: Question[] }[] }[],
): GateContext["existing"] {
  const out = {
    listening: new Set<string>(),
    speak: new Set<string>(),
    translate: new Set<string>(),
    all: new Set<string>(),
  };
  for (const u of units)
    for (const l of u.lessons)
      for (const q of l.questions) {
        out.all.add(
          dedupKey(
            q.type === "listening"
              ? q.audioText
              : q.type === "speak"
                ? q.answer
                : String(q.prompt ?? ""),
          ),
        );
        if (q.type === "listening") out.listening.add(normKey(q.audioText));
        else if (q.type === "speak") out.speak.add(normKey(q.answer));
        else if (q.type === "reorder") out.speak.add(normKey(q.answer));
        else if (q.type === "translate")
          for (const a of q.acceptableAnswers) out.translate.add(normKey(a));
      }
  return out;
}

/** Words that mark English where French or Spanish belongs (a cheap leak check; a hit is a warning). */
const ENGLISH_LEAK = /\b(the|and|is|are|you|your|with|this|that|have|what|where|there)\b/i;
/** Spanish and French words that look like these English ones are not hits (a/e/y are fine). */
const LEAK_OK = new Set<string>();

function leaks(course: Course, s: string): boolean {
  if (course === "en") return false;
  return wordsIn(s).some(
    (w) => ENGLISH_LEAK.test(w) && !LEAK_OK.has(w) && !(course === "fr" && w === "a"),
  );
}

// ---- Shared -----------------------------------------------------------------------------------------

const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

function quotes(explanation: string, answer: string): boolean {
  return explanation.includes(`"${answer}"`) || explanation.includes(`“${answer}”`);
}

export function explanationProblems(ex: unknown, answer: string): string[] {
  if (!isStr(ex)) return ["the explanation is empty"];
  const out: string[] = [];
  if (!quotes(ex, answer.trim()))
    out.push(`the explanation must quote the answer in double quotes: "${answer}"`);
  if (ex.length > 320) out.push("the explanation is over 320 characters (one or two sentences)");
  if (/"[^"]*" is correct here\./.test(ex))
    out.push("the explanation is the generic 'is correct here' line");
  out.push(...metaTextProblems(ex, "explanation", answer.trim()));
  // lesson-bank-listening.test.ts: no doubled terminal punctuation (an ellipsis counts).
  if (/[.?!]["']?\s*\./.test(ex))
    out.push("the explanation has doubled punctuation (or an ellipsis)");
  return out;
}

// ---- Listening ---------------------------------------------------------------------------------------

const LISTEN_WORDS: Record<Level, [number, number]> = {
  A1: [3, 8],
  A2: [4, 10],
  B1: [6, 13],
  B2: [7, 14],
  C1: [8, 15],
};

export function listeningGate(l: unknown, ctx: GateContext): GateResult {
  const problems: string[] = [];
  const warnings: string[] = [];
  const x = l as Record<string, unknown> | undefined;
  if (!x || typeof x !== "object") return { problems: ["listening: no record"], warnings };
  if (!isStr(x.prompt) || !isStr(x.audioText) || !Array.isArray(x.wrong) || !x.wrong.every(isStr))
    return {
      problems: ["listening: prompt, audioText, wrong[] and explanation are required strings"],
      warnings,
    };
  const audio = x.audioText.trim();
  const wrong = (x.wrong as string[]).map((w) => w.trim());
  const [lo, hi] = LISTEN_WORDS[ctx.level];
  const n = wordCount(audio);
  if (n < 3 || n > 16) problems.push(`the audio is ${n} words (3 to 16)`);
  else if (n < lo || n > hi)
    warnings.push(`the audio is ${n} words; ${ctx.level} usually uses ${lo} to ${hi}`);
  if (wrong.length !== 3)
    problems.push(`there must be exactly 3 wrong choices, not ${wrong.length}`);
  const keys = [audio, ...wrong].map(normKey);
  if (new Set(keys).size !== keys.length) problems.push("two choices are the same sentence");
  // The prompt never restates the audio: it must not contain the sentence, nor any wrong choice.
  const pk = normKey(String(x.prompt));
  for (const c of [audio, ...wrong])
    if (pk.includes(normKey(c))) problems.push("the prompt contains a choice");
  if (wordCount(String(x.prompt)) > 14) warnings.push("the prompt is long (over 14 words)");
  problems.push(...metaTextProblems(String(x.prompt), "prompt"));
  for (const w of wrong) {
    if (wordCount(w) !== n) problems.push(`"${w}" does not have the answer's ${n} words`);
    else {
      const a = wordsIn(audio);
      const b = wordsIn(w);
      const apart = b.filter((t, i) => t !== a[i]).length;
      if (apart < 1 || apart > (n >= 7 ? 3 : 2))
        problems.push(`"${w}" is not a close variant (${apart} words apart)`);
      const pairs = homophonePairs(ctx.course, audio, w);
      for (const [p, q] of pairs)
        problems.push(`"${w}" differs only by "${q}" for "${p}", which sound alike`);
    }
    if (leaks(ctx.course, w)) warnings.push(`"${w}" looks like English`);
  }
  // French writes a space before ? ! : ; (the standard), so the shared "space before punctuation" rule skips those.
  const fmt = choiceFormatProblems(
    [audio, ...wrong].map((c) => (ctx.course === "fr" ? c.replace(/\s+([?!;:])/g, "$1") : c)),
  );
  problems.push(...fmt);
  // A distractor sharing under half the answer's content words is easy to rule out without hearing.
  const aw = new Set(wordsIn(audio).filter((t) => t.length > 2));
  for (const w of wrong) {
    const shared = wordsIn(w).filter((t) => aw.has(t)).length;
    if (aw.size && shared / aw.size < 0.5)
      warnings.push(`"${w}" shares under half the answer's words`);
  }
  if (ctx.existing.listening.has(normKey(audio)))
    problems.push("duplicate: the course already has this listening sentence");
  if (leaks(ctx.course, audio))
    problems.push("the audio looks like English, not the course language");
  problems.push(...repeatProblem(ctx, audio));
  problems.push(
    ...britishProblems(ctx.course, [String(x.prompt), audio, ...wrong, String(x.explanation)]),
  );
  problems.push(...explanationProblems(x.explanation, audio));
  return { problems, warnings };
}

// ---- Speak -----------------------------------------------------------------------------------------

const POSSESSIVE_OK = new Set([
  "it",
  "he",
  "she",
  "that",
  "there",
  "here",
  "what",
  "who",
  "where",
  "let",
  "how",
  "when",
  "everyone",
  "everybody",
  "something",
]);
const ORDINAL =
  /\b(\d+(st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|primer[oa]?|segund[oa]|tercer[oa]?|cuart[oa]|quint[oa]|premier|première|deuxième|troisième)\b/i;
const COMPOUND_NUMBER =
  /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[ -](one|two|three|four|five|six|seven|eight|nine)\b|\bhundred\b|\bthousand\b|\btreinta y\b|\bcuarenta y\b|\bcincuenta y\b|\bsesenta y\b|\bsetenta y\b|\bochenta y\b|\bnoventa y\b|\bcien\b|\bciento\b|\bmil\b|\b(trente|quarante|cinquante|soixante|quatre-vingt)[ -]|\bcent\b|\bmille\b|\bdix[ -](sept|huit|neuf)\b|\bdieci(s[eé]is|siete|ocho|nueve)\b|\bveinti\w+|\b(un|une|deux|trois|uno|dos|tres|cuatro|cinco|one|two|three|four|five)\s*,\s*(un|une|deux|trois|uno|dos|tres|cuatro|cinco|one|two|three|four|five|six|seis)\s*,\s*(deux|trois|quatre|dos|tres|cuatro|cinco|two|three|four|five|six|seis|siete)\b/i;

export const spokenOf = {
  en: { norm: normaliseSpoken, match: matchesSpokenAnswer },
  fr: { norm: normaliseSpokenFr, match: matchesSpokenAnswerFr },
  es: { norm: normaliseSpokenEs, match: matchesSpokenAnswerEs },
} as const;

/** What a speech-to-text engine plausibly returns for a correct utterance of `answer`. */
export function transcriptVariants(answer: string): string[] {
  const noPunct = answer
    .replace(/[.,;:!?¿¡«»"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const noAccent = noPunct.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return [
    answer,
    noPunct,
    noPunct.toLowerCase(),
    noAccent.toLowerCase(),
    `${noPunct.toLowerCase()}.`,
  ];
}

export function speakGate(s: unknown, ctx: GateContext): GateResult {
  const problems: string[] = [];
  const warnings: string[] = [];
  const x = s as Record<string, unknown> | undefined;
  if (!x || typeof x !== "object" || !isStr(x.answer))
    return { problems: ["speak: answer and explanation are required strings"], warnings };
  const answer = x.answer.trim();
  const n = wordCount(answer);
  if (n < 3 || n > 12) problems.push(`the phrase is ${n} words (3 to 12)`);
  if (/\d/.test(answer))
    problems.push(
      "the phrase contains a digit: write number words, or avoid numbers (smart_format hazard)",
    );
  if (COMPOUND_NUMBER.test(answer))
    problems.push("the phrase has a compound number, hundred or thousand (smart_format hazard)");
  if (ORDINAL.test(answer)) problems.push("the phrase has an ordinal (smart_format hazard)");
  if (ctx.course === "en") {
    for (const m of answer.matchAll(/\b([A-Za-z]+)['’]s\b/g))
      if (!POSSESSIVE_OK.has(m[1]!.toLowerCase()))
        problems.push(`possessive 's in "${m[0]}" normalises to "is"`);
    if (
      /\b(?:he|she|it|that|there|who|what)['’]s\s+(?:already\s+|just\s+|never\s+|ever\s+)?\w+(?:ed|en)\b/i.test(
        answer,
      )
    )
      warnings.push(
        "a contracted 's before a participle may be 'has' (said as 's, graded as 'is')",
      );
    if (/\b(has|have|had)\b/i.test(answer) && /\b(has)\b/i.test(answer))
      warnings.push("'has' may be said contracted; check the phrase is natural either way");
  }
  // Names: a capitalised word inside the sentence (not the first, not "I") is a name or a homophone risk.
  const inner = answer.split(/\s+/).slice(1);
  if (
    inner.some(
      (w) => /^[A-ZÀ-Ý][a-zà-ÿ]+/.test(w) && w !== "I" && !/^I['’]/.test(w) && ctx.course === "en",
    )
  )
    warnings.push(
      "the phrase contains a capitalised word: a name is unpredictable in a transcript (a day, month or country is fine)",
    );
  // The round trip: every plausible transcript of a correct utterance must grade correct.
  const { norm, match } = spokenOf[ctx.course];
  if (!norm(answer)) problems.push("the phrase normalises to nothing");
  for (const t of transcriptVariants(answer))
    if (!match(t, answer)) {
      problems.push(`round trip fails: "${t}" does not match the phrase after normalising`);
      break;
    }
  if (ctx.existing.speak.has(normKey(answer)))
    problems.push("duplicate: the course already has this phrase");
  if (leaks(ctx.course, answer))
    problems.push("the phrase looks like English, not the course language");
  problems.push(...repeatProblem(ctx, answer));
  problems.push(...britishProblems(ctx.course, [answer, String(x.explanation)]));
  problems.push(...explanationProblems(x.explanation, answer));
  return { problems, warnings };
}

// ---- Translate -----------------------------------------------------------------------------------

/** The generated wordings plus the alternatives the second-answer pass adds. */
export const MAX_WORDINGS = 12;
const TRANSLATE_MAX_WORDS: Record<Level, number> = { A1: 10, A2: 12, B1: 16, B2: 20, C1: 24 };

export function translateGate(t: unknown, ctx: GateContext): GateResult {
  const problems: string[] = [];
  const warnings: string[] = [];
  const x = t as Record<string, unknown> | undefined;
  if (
    !x ||
    typeof x !== "object" ||
    !isStr(x.prompt) ||
    !Array.isArray(x.acceptableAnswers) ||
    !x.acceptableAnswers.every(isStr)
  )
    return {
      problems: ["translate: prompt, acceptableAnswers[] and explanation are required"],
      warnings,
    };
  const answers = (x.acceptableAnswers as string[]).map((a) => a.trim());
  const first = answers[0] ?? "";
  // Distinct by the grader's own rule (curriculum-consistency.test.ts): "What's" and "What is" are ONE wording.
  const distinct = new Set(answers.map((a) => normaliseWritten(a)));
  if (distinct.size !== answers.length)
    problems.push("two wordings are the same after normalising");
  if (answers.length < 2)
    problems.push(`only ${answers.length} wording(s): at least 2 are required`);
  else if (distinct.size < 3)
    problems.push(
      `only ${distinct.size} distinct wording(s) once normalised: at least 3 are required`,
    );
  if (answers.length > MAX_WORDINGS)
    problems.push(`${answers.length} wordings (at most ${MAX_WORDINGS})`);
  const wantMin = ctx.level === "A1" || ctx.level === "A2" ? 2 : 3;
  if (answers.length >= 2 && answers.length < wantMin)
    warnings.push(`${ctx.level} usually has ${wantMin} or more wordings`);
  const max = TRANSLATE_MAX_WORDS[ctx.level];
  for (const a of answers) {
    const n = wordCount(a);
    if (n < 1 || n > max + 6)
      problems.push(`"${a}" is ${n} words (at most ${max + 6} at ${ctx.level})`);
    else if (n > max)
      warnings.push(`"${a}" is ${n} words; ${ctx.level} usually stays within ${max}`);
    if (/\((e|s|es|a|o|x)\)/i.test(a))
      problems.push(`"${a}" uses the (e) gender trick: write one natural wording per form`);
    if (!matchesAcceptableAnswer(a, answers)) problems.push(`"${a}" does not match itself`);
    if (leaks(ctx.course, a)) problems.push(`"${a}" looks like English, not the course language`);
  }
  // The idea never contains the sentence it asks for.
  const pk = normKey(String(x.prompt));
  for (const a of answers)
    if (a && normKey(a).length > 3 && pk.includes(normKey(a)))
      problems.push("the prompt contains an accepted wording");
  if (wordCount(String(x.prompt)) > 22) warnings.push("the prompt is long (over 22 words)");
  problems.push(...metaTextProblems(String(x.prompt), "prompt"));
  // A wording far longer than the canonical one is usually a different sentence.
  const fn = wordCount(first);
  for (const a of answers.slice(1))
    if (fn && (wordCount(a) > fn * 2 + 2 || wordCount(a) * 2 + 2 < fn))
      warnings.push(`"${a}" differs a lot in length from "${first}"`);
  if (ctx.existing.translate.has(normKey(first)))
    problems.push("duplicate: the course already asks for this sentence");
  problems.push(...repeatProblem(ctx, String(x.prompt)));
  problems.push(
    ...britishProblems(ctx.course, [String(x.prompt), ...answers, String(x.explanation)]),
  );
  problems.push(...explanationProblems(x.explanation, first));
  return { problems, warnings };
}

// ---- Entry ---------------------------------------------------------------------------------------

export function gateExtra(type: ExtraType, extra: LessonExtra, ctx: GateContext): GateResult {
  if (type === "listening") return listeningGate(extra.listening, ctx);
  if (type === "speak") return speakGate(extra.speak, ctx);
  return translateGate(extra.translate, ctx);
}

/** The learner-facing question a passing record becomes (null when the record is absent). */
export function questionOf(lessonId: string, type: ExtraType, extra: LessonExtra): Question | null {
  return toQuestion(lessonId, type, extra);
}

/** Every type the record carries. */
export const typesOf = (extra: LessonExtra): ExtraType[] => EXTRA_TYPES.filter((t) => extra[t]);
