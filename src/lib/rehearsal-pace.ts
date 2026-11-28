import type { Course } from "@/data/course-meta";
import { measureReply } from "./practice-stars";

/**
 * Adaptive difficulty for a rehearsal turn. From the learner turns of the transcript the server already receives, one of
 * three FIXED, hand-written lines is added to the partner's prompt. Nothing is stored, nothing from the learner is ever
 * copied into the prompt (their words only decide which line), and the line never changes the brief or the stage.
 * Closed set: simplify, normal, faster.
 */
export type RehearsalPace = "simplify" | "normal" | "faster";

type Turn = { role: string; content: string };

/** The window the rule looks at, and the run of full replies that earns "faster". */
export const PACE_WINDOW = 3;

const strip = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .trim();

/**
 * Phrases that ask for repetition or a slower pace, per course language. Stored already stripped (no accents, lower
 * case). `whole` entries only count when they are the entire reply ("sorry?"), because "sorry I am late" is not a request.
 */
const ASKS: Record<Course, { anywhere: string[]; whole: string[] }> = {
  en: {
    anywhere: [
      "can you repeat",
      "could you repeat",
      "say that again",
      "say it again",
      "more slowly",
      "slower please",
      "speak slowly",
      "i don't understand",
      "i do not understand",
      "i didn't understand",
    ],
    whole: ["sorry", "pardon", "what", "again"],
  },
  fr: {
    anywhere: [
      "repetez",
      "pouvez vous repeter",
      "plus lentement",
      "plus doucement",
      "je ne comprends pas",
      "je n'ai pas compris",
      "je comprends pas",
    ],
    whole: ["pardon", "comment", "desole", "quoi"],
  },
  es: {
    anywhere: [
      "puede repetir",
      "puedes repetir",
      "repita",
      "repite",
      "mas despacio",
      "mas lento",
      "no entiendo",
      "no he entendido",
      "no comprendo",
    ],
    whole: ["perdon", "como", "disculpe", "que"],
  },
};

/** True when a learner reply asks the partner to repeat or slow down. Accent and case insensitive. */
export function asksForRepetition(text: string, course: Course): boolean {
  const s = strip(text);
  if (!s) return false;
  const lists = ASKS[course];
  if (lists.whole.includes(s)) return true;
  const padded = ` ${s.replace(/-/g, " ")} `;
  return lists.anywhere.some((p) => padded.includes(` ${p} `));
}

/**
 * The pace for the next partner turn. Only learner turns count; fewer than three of them is always "normal".
 * simplify: the latest reply asks for repetition, or 2 of the last 3 replies are short or in English.
 * faster: the last 3 replies are all full (not short, not English). normal: anything else.
 */
export function chooseRehearsalPace(messages: readonly Turn[], course: Course): RehearsalPace {
  const learner = messages.filter((m) => m.role === "user").map((m) => m.content);
  if (learner.length < PACE_WINDOW) return "normal";
  const last = learner.slice(-PACE_WINDOW);
  if (asksForRepetition(last[last.length - 1]!, course)) return "simplify";
  const weak = last.map((t) => measureReply(t, course)).filter((m) => m.short || m.english).length;
  if (weak >= 2) return "simplify";
  if (weak === 0) return "faster";
  return "normal";
}

/**
 * The line, per course (the rest of the rehearsal prompt is in the course language). Each says HOW to talk, never to
 * announce a change, and each says the brief and the stage stay exactly as they are.
 */
const LINES: Record<Course, Record<RehearsalPace, string>> = {
  en: {
    simplify:
      "Pace for your next turn: use shorter sentences and common everyday words, ask one question at a time, and if something needs saying again, put it differently rather than word for word. Never mention that you are doing this. Stay inside the brief and the stage you are in, and keep any hard moment as demanding as written.",
    normal:
      "Pace for your next turn: speak at the learner's level in natural, medium-length sentences. Stay inside the brief and the stage you are in, and keep any hard moment as demanding as written.",
    faster:
      "Pace for your next turn: speak a little more naturally, with slightly longer sentences, and now and then add a short follow-up question, while staying at the learner's level. Never mention that you are doing this. Stay inside the brief and the stage you are in, and keep any hard moment as demanding as written.",
  },
  fr: {
    simplify:
      "Rythme pour ton prochain tour : fais des phrases plus courtes avec des mots courants, pose une seule question à la fois, et si quelque chose doit être redit, reformule au lieu de répéter mot pour mot. Ne dis jamais que tu le fais. Reste dans le cadre du bloc et de l'étape en cours, et garde chaque moment difficile aussi exigeant que prévu.",
    normal:
      "Rythme pour ton prochain tour : parle au niveau de l'apprenant, avec des phrases naturelles de longueur moyenne. Reste dans le cadre du bloc et de l'étape en cours, et garde chaque moment difficile aussi exigeant que prévu.",
    faster:
      "Rythme pour ton prochain tour : parle un peu plus naturellement, avec des phrases un peu plus longues, et ajoute de temps en temps une courte question de relance, tout en restant au niveau de l'apprenant. Ne dis jamais que tu le fais. Reste dans le cadre du bloc et de l'étape en cours, et garde chaque moment difficile aussi exigeant que prévu.",
  },
  es: {
    simplify:
      "Ritmo para tu próximo turno: usa frases más cortas con palabras comunes, haz una sola pregunta a la vez y, si algo hay que decirlo otra vez, dilo de otra manera en lugar de repetirlo palabra por palabra. No digas nunca que lo haces. Quédate dentro del bloque y de la etapa en curso, y mantén cada momento difícil tan exigente como está escrito.",
    normal:
      "Ritmo para tu próximo turno: habla al nivel del aprendiz, con frases naturales de longitud media. Quédate dentro del bloque y de la etapa en curso, y mantén cada momento difícil tan exigente como está escrito.",
    faster:
      "Ritmo para tu próximo turno: habla con un poco más de naturalidad, con frases algo más largas, y de vez en cuando añade una pregunta corta de seguimiento, sin salirte del nivel del aprendiz. No digas nunca que lo haces. Quédate dentro del bloque y de la etapa en curso, y mantén cada momento difícil tan exigente como está escrito.",
  },
};

export const paceLine = (course: Course, pace: RehearsalPace): string => LINES[course][pace];

/** The system prompt with exactly one pace line appended. */
export function withRehearsalPace(
  prompt: string,
  messages: readonly Turn[],
  course: Course,
): { prompt: string; pace: RehearsalPace } {
  const pace = chooseRehearsalPace(messages, course);
  return { prompt: `${prompt}\n\n${paceLine(course, pace)}`, pace };
}
