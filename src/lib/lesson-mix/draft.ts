// The drafting step of the lesson-mix pass: one request per lesson to Claude Sonnet 5.5 (Message
// Batches, the playbook rules cached as the system prompt). The reply is JSON with only the types the
// lesson needs; code, not the model, builds the learner-facing question (extras.ts). Pure.

import type { Course } from "../../data/course-meta";
import type { Lesson, Unit } from "../../data/curriculum";
import type { Level } from "../../data/levels";
import { renderQuestion } from "../content-panel/panel";
import { languageName } from "../content-review/inventory";
import { firstJsonObject } from "../content-review/review";
import { thinkingParams, type BatchRequest } from "../content-review/anthropic-batch";
import { EXTRA_TYPES, lessonNeed, type ExtraType, type LessonExtra } from "./extras";

export const DRAFT_MODEL = "claude-sonnet-5-5";

const LEVEL_NOTES: Record<Level, string> = {
  A1: "Beginner. Listening sentences 4 to 8 words, the most frequent words. Translate ideas are everyday basics.",
  A2: "Elementary. Listening sentences 5 to 10 words. Past, future and simple connectors are fine.",
  B1: "Intermediate. Listening sentences 8 to 12 words; the wrong choices are minimal pairs that differ in one word (tense, number, preposition).",
  B2: "Upper intermediate. Listening sentences 9 to 13 words with a subordinate clause; one-word minimal-pair differences.",
  C1: "Advanced. Listening sentences 10 to 14 words, precise register; one-word minimal-pair differences.",
};

const VARIETY: Record<Course, string> = {
  en: "English: American spelling and usage (color, favorite, apartment); everyday neutral register.",
  fr: "French: standard European French. Use vous for strangers, shops and officials, tu for friends and family, and never switch inside one item. Elide in writing (j'ai, l'ami). Put a space before ? ! : ; as in the course's existing lines.",
  es: "Spanish: Latin American (tú/usted/ustedes, never vosotros or vos; seseo and yeísmo are assumed). Opening marks ¿ ¡ and the tildes that change meaning are required.",
};

const HOMOPHONE_RULE: Record<Course, string> = {
  en: "No wrong choice may differ from the answer by a homophone or near-homophone (their/there, to/too, meet/meat, see/sea, hear/here, week/weak).",
  fr: "No wrong choice may differ from the answer by a word said the same (est/et/ai, a/à, ou/où, sa/ça, ces/ses/c'est/s'est, son/sont, on/ont, mes/mais, ma/m'a, la/là, verb endings -e/-es/-ent, noun plurals in -s, -er/-é/-ez). Differ by a word a listener can hear: a different tense with a different sound, another noun, another number.",
  es: "Under seseo, yeísmo and the b/v merger some spellings sound the same: a wrong choice must never differ from the answer by s/c/z (casa/caza), ll/y (pollo/poyo), b/v (tubo/tuvo), a silent h (hola/ola), or a tilde alone (él/el, tú/tu, sí/si). Differ by a word a listener can hear.",
};

/** What every request of one course shares: the rules, cached. */
export function draftSystem(course: Course): string {
  const lang = languageName(course);
  return [
    `You write extra practice questions for a ${lang} course for English speakers (CEFR A1 to C1), appended to lessons that already exist. Each request gives one lesson (its questions, with the answer KEY marked) and the question types to write. Write ONLY those types.`,
    VARIETY[course],
    "",
    "Use the lesson's own vocabulary and grammar, at the lesson's level, so every word is something this lesson taught or an easier word. Never use a sentence the lesson already shows. Never use a name of a real person.",
    "",
    "listening: the learner hears `audioText` read by a device voice (they cannot see it), then picks what they heard.",
    "- `audioText`: one natural sentence in the course language (the length for the level is below).",
    "- `prompt`: a short English instruction that does NOT repeat or paraphrase the sentence, for example 'What did you hear?' or 'Which sentence did you hear?'.",
    "- `wrong`: exactly three wrong sentences. Each has the SAME number of words as audioText and differs from it in one word (two words at most in a long sentence), by a word that sounds clearly different and has a different meaning. The wrong sentences are real, correctly spelled, grammatical sentences in the course language that a learner could mistake for the answer.",
    `- ${HOMOPHONE_RULE[course]}`,
    "- All four choices end in the same punctuation.",
    "",
    "speak: the learner reads `answer` aloud; speech recognition checks it. One natural phrase of 3 to 12 words from the lesson's vocabulary. Avoid, because each marked perfect speech wrong: digits and number words above twenty; ordinals; names; possessive 's (English); a contracted 'has'; two words that sound the same; foreign words.",
    "",
    "translate: the learner reads an English description of an idea and writes it in the course language. `prompt` describes the idea in English WITHOUT giving the sentence away (for example 'Ask where the station is.', not 'Where is the station?'). `acceptableAnswers`: every natural wording you would accept, most canonical first, in the course language, 2 to 3 wordings at A1 and A2 and 3 to 4 at B1 to C1. Each wording is a complete natural sentence and genuinely a different way to say the same thing. Never use the (e) or (s) trick for gender or number: write one form.",
    "",
    "explanation (every type): one or two plain English sentences on WHY this is the answer or what the phrase means, and it MUST quote the answer in double quotes exactly as written (for translate, the first wording; for listening, the audioText; for speak, the phrase). Never write a generic line such as '\"x\" is correct here.'.",
    "",
    "Reply with JSON only, no prose and no code fence, with only the types you were asked for:",
    '{"listening":{"prompt":"...","audioText":"...","wrong":["...","...","..."],"explanation":"..."},"speak":{"answer":"...","explanation":"..."},"translate":{"prompt":"...","acceptableAnswers":["...","..."],"explanation":"..."}}',
  ].join("\n");
}

export type DraftInput = {
  course: Course;
  unitTitle: string;
  level: Level;
  lesson: Lesson;
  need: ExtraType[];
  /** Feedback from a failed first attempt (the gate problems), when redrafting. */
  feedback?: string[];
};

export function draftUser(d: DraftInput): string {
  const qs = d.lesson.questions
    .filter((q) => q.type === "mc" || q.type === "fill")
    .slice(0, 12)
    .map((q, i) => `(${i + 1}) ${renderQuestion(q)}`);
  return [
    `Course: ${languageName(d.course)}. Level: ${d.level} (${LEVEL_NOTES[d.level]})`,
    `Unit: ${d.unitTitle}. Lesson: ${d.lesson.title}${d.lesson.subtitle ? ` (${d.lesson.subtitle})` : ""}.`,
    `Write these types only: ${d.need.join(", ")}.`,
    "",
    "The lesson's questions:",
    ...qs,
    ...(d.feedback?.length
      ? [
          "",
          "Your previous attempt failed these automatic checks; fix every one:",
          ...d.feedback.map((f) => `- ${f}`),
        ]
      : []),
  ].join("\n");
}

/** A reply is large only by the types asked for: about 150 tokens per type, thinking included. */
export const draftMaxTokens = (need: ExtraType[]) => 700 + need.length * 450;

export function buildDraftRequest(customId: string, d: DraftInput): BatchRequest {
  return {
    custom_id: customId,
    params: {
      model: DRAFT_MODEL,
      max_tokens: draftMaxTokens(d.need),
      system: [
        {
          type: "text",
          text: draftSystem(d.course),
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
      ],
      messages: [{ role: "user", content: draftUser(d) }],
      ...thinkingParams(DRAFT_MODEL, "low"),
    },
  };
}

/** A custom_id the Anthropic API accepts (^[a-zA-Z0-9_-]{1,64}$) and that names the lesson. */
export const draftCustomId = (course: Course, lessonId: string, round = 0) =>
  `draft${round}-${course}-${lessonId}`.slice(0, 64);

export function parseDraftCustomId(
  id: string,
): { course: Course; lessonId: string; round: number } | null {
  const m = /^draft(\d+)-(en|fr|es)-([a-z0-9]+)$/.exec(id);
  return m ? { round: Number(m[1]), course: m[2] as Course, lessonId: m[3]! } : null;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

/** The record a reply holds, only for the types asked for. Anything malformed is an error, never a guess. */
export function parseDraft(
  text: string,
  need: ExtraType[],
): { extra: LessonExtra; errors: string[] } {
  const errors: string[] = [];
  const json = firstJsonObject(text);
  if (!json) return { extra: {}, errors: ["no JSON object in the reply"] };
  let raw: Record<string, Record<string, unknown> | undefined>;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return { extra: {}, errors: [`invalid JSON: ${(e as Error).message}`] };
  }
  const extra: LessonExtra = {};
  for (const t of EXTRA_TYPES) {
    if (!need.includes(t)) continue;
    const r = raw[t];
    if (!r || typeof r !== "object") {
      errors.push(`missing ${t}`);
      continue;
    }
    if (t === "listening")
      extra.listening = {
        prompt: str(r.prompt),
        audioText: str(r.audioText),
        wrong: strs(r.wrong),
        explanation: str(r.explanation),
      };
    else if (t === "speak")
      extra.speak = { answer: str(r.answer), explanation: str(r.explanation) };
    else
      extra.translate = {
        prompt: str(r.prompt),
        acceptableAnswers: strs(r.acceptableAnswers),
        explanation: str(r.explanation),
      };
  }
  return { extra, errors };
}

// ---- Pilot selection ----------------------------------------------------------------------------------

export type PilotLesson = {
  course: Course;
  level: Level;
  unitId: string;
  lessonId: string;
  indexInUnit: number;
  need: ExtraType[];
};

const LEVELS: Level[] = ["A1", "A2", "B1", "B2", "C1"];

/**
 * A spread: `perLevel` lessons at every level, drawn deterministically from the lessons that need the
 * most (listening, translate and, on lessons 1, 3 and 5 of a unit, speak), and always including both a
 * speak lesson and a no-speak lesson per level. `order` breaks ties (a seeded hash of the lesson id).
 */
export function selectPilot(
  units: Unit[],
  course: Course,
  perLevel: number,
  order: (lessonId: string) => number,
): PilotLesson[] {
  const out: PilotLesson[] = [];
  for (const level of LEVELS) {
    const pool: PilotLesson[] = [];
    for (const u of units.filter((x) => x.level === level))
      u.lessons.forEach((lesson, i) => {
        const need = lessonNeed(lesson, i);
        if (need.length)
          pool.push({ course, level, unitId: u.id, lessonId: lesson.id, indexInUnit: i, need });
      });
    pool.sort((a, b) => b.need.length - a.need.length || order(a.lessonId) - order(b.lessonId));
    const speak = pool.filter((p) => p.need.includes("speak"));
    const noSpeak = pool.filter((p) => !p.need.includes("speak"));
    const picks: PilotLesson[] = [];
    for (const from of [speak, noSpeak]) if (from[0]) picks.push(from[0]);
    for (const p of [...speak, ...noSpeak])
      if (picks.length < perLevel && !picks.includes(p)) picks.push(p);
    out.push(...picks.slice(0, perLevel));
  }
  return out;
}
