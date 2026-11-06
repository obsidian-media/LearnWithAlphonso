// What every reviewer in the full content review is told: a per-language "native teacher" checklist
// and the exact JSON verdict shape. The same checklist is printed in docs/CONTENT-PLAYBOOK.md for
// authors; rubric.test.ts holds the two in step (each checklist line appears in the playbook).
//
// The system prompt is identical for every request of one language and phase, so it is sent with a
// prompt-cache breakpoint; it is well over Sonnet 5.5's 512-token cache minimum.

import type { Course } from "../../data/courses";
import { languageName } from "./inventory";

export const CATEGORIES = [
  "grammar",
  "spelling",
  "naturalness",
  "register",
  "regional",
  "level",
  "wrong-key",
  "second-answer",
  "absurd-option",
  "giveaway",
  "explanation",
  "card",
  "english-leak",
  "instructions",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const SEVERITIES = ["blocker", "major", "minor"] as const;
export type Severity = (typeof SEVERITIES)[number];

/** The shared checklist, every language. Each line is quoted verbatim in the playbook. */
export const COMMON_CHECKLIST = [
  "One correct answer: exactly one option is right, and the sentence, a bracketed clue, the subject or a picture rules every other option out.",
  "The KEY is right: the marked answer is correct, natural and at the stated level.",
  "No absurd options: every wrong option is the same kind of word as the answer and something a real learner might pick.",
  "No giveaways: the answer cannot be found without the skill being tested (the only option matching a bracketed hint, the only option with the right ending, an English gloss that names it, a prompt that contains it).",
  "Level: vocabulary and grammar fit the stated CEFR level; an A1 item never needs B2 grammar.",
  "Explanation: says WHY this answer is right for THIS sentence (the rule or the clue), in plain English, in one or two sentences, and quotes the answer in double quotes. A generic line that would fit any question is a defect.",
  "Word cards: the meaning is a short, true English gloss of the term as used in the lesson; the example is a natural sentence that uses the term with that meaning.",
  "Instructions and titles: clear, short, correct; English UI text is plain and friendly.",
  "Conversation instructions (scenarios, story scenes): the persona, register and level they ask for are consistent with the opening line and with each other.",
  "Spelling and accents are correct, including capitals and punctuation in the target language.",
];

/** Language-specific checks. */
export const LANGUAGE_CHECKLIST: Record<Course, string[]> = {
  en: [
    "Variety: British English spelling and usage (colour, favourite, flat); flag a US-only form only when it is the key or the only natural option.",
    "Register: everyday neutral English unless the item sets a formal or casual scene.",
    "Phrasal verbs, articles and prepositions: the classic learner traps; a second preposition that is also idiomatic is a second answer.",
  ],
  fr: [
    "Variety: standard European French; Quebec-only or strongly regional usage is 'regional'.",
    "Register: tu or vous must fit the situation (a stranger, a shop, a customer: vous; a friend, family, a child: tu) and must not switch within one item or one conversation.",
    "Elision and liaison in writing: j'ai, l'ami, qu'il; never 'Je ai'.",
    "Agreement: gender and number on articles, adjectives and past participles (être verbs, preceding direct objects).",
    "Typography: a space before ? ! : ; and inside « » is accepted; do not flag spacing alone.",
  ],
  es: [
    "Variety: Latin American Spanish: ustedes, never vosotros or vos; seseo means s/z/c sound the same; flag Spain-only words when a Latin American learner would be misled.",
    "Register: tú or usted must fit the situation (a stranger, a shop, an official: usted; a friend, family: tú) and must not switch within one item or one conversation.",
    "Accents and opening marks: tildes that change meaning (él/el, tú/tu, sí/si, qué/que in questions) and ¿ ¡ are required.",
    "Agreement: gender and number on articles and adjectives; ser vs estar; the subjunctive where the trigger requires it.",
    "Listening: under seseo and yeísmo two spellings can sound the same; a listening option that sounds like the answer is a second answer.",
  ],
};

const VERDICT_SHAPE =
  '{"items":[{"key":"<the item key>","verdict":"ok"|"defect","category":"<category, defect only>","severity":"blocker"|"major"|"minor","problem":"<one sentence, defect only>","fix":"<the corrected text: the whole corrected option, prompt or explanation, defect only>","confidence":<0 to 1>}]}';

export type RubricRole = "review" | "verify";

/** The reviewer's system prompt for one course. Stable text: it is the prompt-cache prefix. */
export function rubric(course: Course, role: RubricRole = "review"): string {
  const lang = languageName(course);
  return [
    `You are an experienced native ${lang} teacher reviewing items from a language-learning app for English speakers (CEFR A1 to C1).`,
    role === "verify"
      ? "You are checking a random sample for a quality measurement. Judge each item on its own, exactly as a learner would meet it."
      : "Judge each item as you would before it reaches a learner, and say exactly what to change.",
    "",
    "Checklist, every language:",
    ...COMMON_CHECKLIST.map((l) => `- ${l}`),
    "",
    `Checklist, ${lang}:`,
    ...LANGUAGE_CHECKLIST[course].map((l) => `- ${l}`),
    "",
    "Categories: grammar, spelling, naturalness, register, regional, level, wrong-key, second-answer, absurd-option, giveaway, explanation, card, english-leak (English where target-language text belongs; bracketed clues and English UI text are intended), instructions, other.",
    "Severity: blocker = a learner is marked wrong for a right answer, or taught something false; major = misleading, unnatural or too easy; minor = polish.",
    "Wrong options are SUPPOSED to be wrong: never flag an option for being incorrect, only for being ALSO correct, absurd, or a giveaway.",
    "Some items carry 'known flags' found by an automatic check. generic-explanation, cloze-from-pool and drill-non-form are already scheduled for a rewrite: do NOT report the explanation or the wrong options for those; report any OTHER problem (a wrong key, a second answer, grammar in the prompt). known-second-answer must be confirmed or rejected.",
    "Only flag real problems a careful teacher would fix. When unsure, say ok with a lower confidence.",
    "",
    "Reply with JSON only, no prose and no code fence, in exactly this shape:",
    VERDICT_SHAPE,
    "Return one entry for every item key you were given, in the same order.",
  ].join("\n");
}
