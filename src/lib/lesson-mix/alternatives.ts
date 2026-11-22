// The second-answer pass of the lesson mix: a translate question accepts only the wordings it lists, so
// a learner who writes another correct wording is marked wrong (the blind sample's worst defect).
// `acceptableAnswers` already holds alternatives (curriculum.ts: the first is canonical), so this pass
// ADDS wordings to it; it invents no field. A model proposes, the gates dispose. Pure.

import type { Course } from "../../data/course-meta";
import { languageName } from "../content-review/inventory";
import { firstJsonObject, localKey, type Chunk } from "../content-review/review";
import { matchesAcceptableAnswer } from "../translation-answer";
import type { TranslateExtra } from "./extras";
import { MAX_WORDINGS } from "./gates";

const VARIETY: Record<Course, string> = {
  en: "American English (color, apartment, the check, the line).",
  fr: "standard European French; a Quebec-only word is not an addition.",
  es: "Latin American Spanish (tú/usted/ustedes, never vosotros; mesera, carro, computadora are fine; a Spain-only word such as ordenador or vosotros is not an addition).",
};

const EXPLAIN_RULES = [
  'Rewrite each explanation so that it: (1) explains the PATTERN the answer shows (the grammar point, the meaning of the key word, or what to listen for), (2) says no more than the answer needs: one or two short sentences, at most 200 characters, (3) quotes the answer in double quotes exactly as given, (4) contains NO text about the exercise itself (never "the learner", "this item", "read aloud", "the lesson", "the first wording", a CEFR level), (5) does not just restate the sentence or its translation, (6) is correct: do not claim a rule the sentence does not show, and use American English for English.',
  'Write to the learner ("you"). Keep the facts of the old explanation that are right.',
];

export function explainSystem(course: Course): string {
  return [
    `You rewrite the explanations shown after a ${languageName(course)} course question (learners are English speakers).`,
    ...EXPLAIN_RULES,
    'Reply with JSON only: {"items":[{"key":"i1","explanation":"..."}]}, one entry per key, in order.',
  ].join("\n");
}

export function explainUser(c: Chunk): string {
  return [
    `Rewrite these ${c.items.length} explanations.`,
    ...c.items.map((it, i) => `\n### key: ${localKey(i)} (level ${it.level})\n${it.text}`),
  ].join("\n");
}

export function parseExplanations(
  c: Chunk,
  text: string,
): { byId: Record<string, string>; missing: string[] } {
  const byId: Record<string, string> = {};
  const json = firstJsonObject(text);
  if (json) {
    try {
      const parsed = JSON.parse(json) as { items?: { key?: unknown; explanation?: unknown }[] };
      const byKey = new Map(c.items.map((it, i) => [localKey(i), it.id]));
      for (const e of parsed.items ?? []) {
        const id = typeof e.key === "string" ? byKey.get(e.key) : undefined;
        if (id && typeof e.explanation === "string" && e.explanation.trim() && !byId[id])
          byId[id] = e.explanation.trim();
      }
    } catch {
      /* every key is missing */
    }
  }
  return { byId, missing: c.items.map((it) => it.id).filter((id) => !byId[id]) };
}

/** A second pass is told what the blind audit found still missing after the first. */
export const SECOND_PASS_NOTE =
  'SECOND PASS. The list may already hold additions from an earlier pass, and a blind audit still found correct answers rejected. Look hardest for: (1) the most LITERAL rendering of the English prompt (if the prompt says "someone" or "a curious person" or "is not", the literal word-for-word rendering), (2) the subject dropped or stated (yo, tú, il, they), (3) both common word orders and a fronted time phrase, (4) the other standard word for the same thing (por día / al día, mostrar / enseñar, concejo / ayuntamiento), (5) the feminine form when the speaker or the person is not fixed, (6) est-ce que or its absence, (7) the full or the contracted form. If a listed wording does NOT mean the same as the prompt (once a week vs every week), do not copy its pattern.';

export function altsSystem(course: Course, secondPass = false): string {
  return [
    `You extend the accepted answers of translation questions for a ${languageName(course)} course for English speakers. The learner reads an English idea (the prompt) and WRITES it in ${languageName(course)}. An answer is accepted ONLY if it equals one of the listed wordings after case, punctuation and accent normalisation; otherwise the learner is marked wrong. Your job is to find the correct answers the list is missing.`,
    "",
    "For each item add every OTHER wording a competent learner would naturally write that is fully correct, natural, and says what the prompt asks:",
    "- the common synonym the prompt's English words map to (grande or grosse for big, habiter or vivre for to live, escuchar or oír for to hear, a word with and without a common prefix),",
    "- the other form of gender or number the prompt leaves open (the speaker or friend's gender when the prompt does not fix it: petit and petite, cansado and cansada),",
    "- tú or usted, tu or vous, ONLY where the prompt does not fix the register,",
    "- with or without an optional subject pronoun, a contraction or its full form, a different but equally common word order, the common regional-standard word,",
    "- the near-synonym verb or noun the item's own explanation hints at.",
    "",
    "Rules:",
    `- Variety: ${VARIETY[course]}`,
    "- Every addition is a complete, natural sentence in the course language with the same final punctuation as the listed ones, and means the SAME as the prompt: no added or missing information, no change of tense, person or politeness the prompt fixes.",
    "- If the prompt demands a specific structure or idiom, every addition uses it.",
    "- Never use (e) or (s) tricks, slashes, or alternatives inside one wording: one wording, one sentence.",
    "- Do not repeat a listed wording. Add at most 4 wordings per item; add none when the list already covers what learners naturally write. Quality over quantity: a doubtful wording is NOT added.",
    "",
    ...(secondPass ? [SECOND_PASS_NOTE, ""] : []),
    'Reply with JSON only: {"items":[{"key":"i1","add":["...","..."]}]}, one entry per key, in order ("add":[] when nothing is missing).',
  ].join("\n");
}

export function altsUser(c: Chunk): string {
  return [
    `Extend these ${c.items.length} translation questions.`,
    ...c.items.map((it, i) => {
      const d = it.data as { prompt?: string; acceptableAnswers?: string[]; explanation?: string };
      return `\n### key: ${localKey(i)} (level ${it.level})\nprompt: ${d.prompt ?? ""}\nlisted wordings: ${JSON.stringify(d.acceptableAnswers ?? [])}\nexplanation shown to the learner: ${d.explanation ?? ""}`;
    }),
  ].join("\n");
}

/** The proposals of one reply, by item id. A key the reply leaves out is `missing`, never "nothing to add". */
export function parseAlts(
  c: Chunk,
  text: string,
): { adds: Record<string, string[]>; missing: string[] } {
  const adds: Record<string, string[]> = {};
  const json = firstJsonObject(text);
  if (json) {
    try {
      const parsed = JSON.parse(json) as { items?: { key?: unknown; add?: unknown }[] };
      const byKey = new Map(c.items.map((it, i) => [localKey(i), it.id]));
      for (const e of parsed.items ?? []) {
        const id = typeof e.key === "string" ? byKey.get(e.key) : undefined;
        if (!id || !Array.isArray(e.add) || adds[id]) continue;
        adds[id] = e.add.filter((a): a is string => typeof a === "string" && !!a.trim());
      }
    } catch {
      /* every key is missing */
    }
  }
  return { adds, missing: c.items.map((it) => it.id).filter((id) => !adds[id]) };
}

/** Drops a wording the grader would treat as one already listed ("What's" and "What is"); the first stays. */
export function dedupeWordings(t: TranslateExtra): TranslateExtra {
  const kept: string[] = [];
  for (const a of t.acceptableAnswers) if (!matchesAcceptableAnswer(a, kept)) kept.push(a);
  return kept.length === t.acceptableAnswers.length ? t : { ...t, acceptableAnswers: kept };
}

/**
 * Appends the proposed wordings one at a time. A wording is kept only when it is new (not the same
 * after the grader's own normalisation), the list stays within MAX_WORDINGS, and `check` (the gates)
 * reports no problem the list did not already have.
 */
export function mergeAlternatives(
  t: TranslateExtra,
  proposed: string[],
  check: (answers: string[]) => string[],
): { translate: TranslateExtra; added: string[]; rejected: string[] } {
  let answers = [...t.acceptableAnswers];
  const base = new Set(check(answers));
  const added: string[] = [];
  const rejected: string[] = [];
  for (const raw of proposed) {
    const a = raw.trim();
    if (!a) continue;
    if (answers.length >= MAX_WORDINGS || matchesAcceptableAnswer(a, answers)) {
      rejected.push(a);
      continue;
    }
    const next = [...answers, a];
    if (check(next).some((p) => !base.has(p))) {
      rejected.push(a);
      continue;
    }
    answers = next;
    added.push(a);
  }
  return { translate: { ...t, acceptableAnswers: answers }, added, rejected };
}
