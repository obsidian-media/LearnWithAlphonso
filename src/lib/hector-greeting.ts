/**
 * Hector speaks first (BACKLOG 0.0-bp): the short greeting he says when a Hector call opens. Built here from fixed
 * templates, with no LLM call, so it costs only its speech (/api/tts, cached like Alphonso's openers).
 *
 * Mirrored on iOS (LearnWithAlphonsoKit/HectorGreeting.swift) and Android (core/logic/HectorGreeting.kt); keep the
 * three in step. Nothing the learner typed is ever spoken: the name must look like a first name, and the weak spot
 * is only ever one of our own labels below, looked up by its taxonomy key (WEAKNESS_TAXONOMY).
 */
import type { Course } from "@/data/courses";

type Lines = {
  /** A1, A2 or an unknown level. */
  simple: (hi: string) => string;
  /** B1 and up. */
  warm: (hi: string) => string;
  simpleTopic: (hi: string, topic: string) => string;
  warmTopic: (hi: string, topic: string) => string;
  hi: (name: string | null) => string;
};

/** French puts a no-break space before ! and ?. */
const NB = " ";

const LINES: Record<Course, Lines> = {
  en: {
    hi: (name) => (name ? `Hi ${name}!` : "Hi!"),
    simple: (hi) => `${hi} I'm Hector. What do you want to talk about today?`,
    warm: (hi) => `${hi} Good to see you. What's been happening lately? Tell me about it.`,
    simpleTopic: (hi, t) =>
      `${hi} Last time you had trouble with ${t}. Let's practise together. Ready?`,
    warmTopic: (hi, t) =>
      `${hi} Last time ${t} tripped you up. Want to practise that in conversation?`,
  },
  fr: {
    hi: (name) => (name ? `Salut ${name}${NB}!` : `Salut${NB}!`),
    simple: (hi) => `${hi} Moi, c'est Hector. De quoi tu veux parler aujourd'hui${NB}?`,
    warm: (hi) => `${hi} Content de te voir. Raconte-moi, quoi de neuf${NB}?`,
    simpleTopic: (hi, t) =>
      `${hi} La dernière fois, tu as eu du mal avec ${t}. On s'entraîne ensemble${NB}?`,
    warmTopic: (hi, t) =>
      `${hi} La dernière fois, tu as eu du mal avec ${t}. Tu veux t'entraîner en conversation${NB}?`,
  },
  es: {
    hi: (name) => (name ? `¡Hola, ${name}!` : "¡Hola!"),
    simple: (hi) => `${hi} Soy Hector. ¿De qué quieres hablar hoy?`,
    warm: (hi) => `${hi} Qué gusto verte. Cuéntame, ¿qué hay de nuevo?`,
    simpleTopic: (hi, t) => `${hi} La última vez tuviste problemas con ${t}. ¿Practicamos juntos?`,
    warmTopic: (hi, t) =>
      `${hi} La última vez tuviste dificultades con ${t}. ¿Te animas a practicar conversando?`,
  },
};

/**
 * Our own words for each weakness category (src/lib/weakness-detection.server.ts WEAKNESS_TAXONOMY), per course.
 * A category with no label here (an unknown one, or English-only grammar in French or Spanish) is never named.
 */
const TOPICS: Record<Course, Readonly<Record<string, string>>> = {
  en: {
    "past-tense": "the past tense",
    articles: "articles",
    prepositions: "prepositions",
    "subject-verb-agreement": "subject-verb agreement",
    plurals: "plurals",
    "question-formation": "asking questions",
    "modal-verbs": "modal verbs",
    "word-order": "word order",
    pronouns: "pronouns",
    comparatives: "comparing things",
    conditionals: "conditionals",
    "phrasal-verbs": "phrasal verbs",
    negation: "negative sentences",
    "vocabulary-choice": "choosing the right word",
    spelling: "spelling",
  },
  fr: {
    "past-tense": "le passé",
    articles: "les articles",
    prepositions: "les prépositions",
    "subject-verb-agreement": "l'accord du verbe",
    plurals: "le pluriel",
    "question-formation": "les questions",
    "modal-verbs": "les verbes comme pouvoir et devoir",
    "word-order": "l'ordre des mots",
    pronouns: "les pronoms",
    comparatives: "les comparaisons",
    conditionals: "le conditionnel",
    negation: "la négation",
    "vocabulary-choice": "le choix des mots",
    spelling: "l'orthographe",
  },
  es: {
    "past-tense": "el pasado",
    articles: "los artículos",
    prepositions: "las preposiciones",
    "subject-verb-agreement": "la concordancia del verbo",
    plurals: "el plural",
    "question-formation": "las preguntas",
    "modal-verbs": "verbos como poder y deber",
    "word-order": "el orden de las palabras",
    pronouns: "los pronombres",
    comparatives: "las comparaciones",
    conditionals: "el condicional",
    negation: "la negación",
    "vocabulary-choice": "la elección de palabras",
    spelling: "la ortografía",
  },
};

/** Taxonomy keys are short; anything longer is not one of ours. */
const MAX_CATEGORY_LENGTH = 40;

/** The label for a weakness category in this course, or null when it is not one of ours. */
export function hectorTopicLabel(course: Course, category: unknown): string | null {
  if (typeof category !== "string" || category.length > MAX_CATEGORY_LENGTH) return null;
  const key = category.trim().toLowerCase();
  return Object.hasOwn(TOPICS[course], key) ? TOPICS[course][key] : null;
}

const MAX_NAME_LENGTH = 20;
/** Letters, with an inner apostrophe or hyphen (O'Neil, Mary-Jane). */
const FIRST_NAME = /^\p{L}+(?:['’-]\p{L}+)*$/u;

/**
 * The first word of a name, when it looks like a first name; otherwise null and Hector greets without one. A
 * generated public handle ("Learner-4F2A") is not a name.
 */
export function safeLearnerName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const first = raw.trim().split(/\s+/)[0] ?? "";
  if (!first || first.length > MAX_NAME_LENGTH) return null;
  if (/^learner-/i.test(first)) return null;
  return FIRST_NAME.test(first) ? first : null;
}

const SIMPLE_LEVELS = new Set(["A1", "A2"]);

export function buildHectorGreeting(input: {
  course: Course;
  cefr: string | null | undefined;
  name: unknown;
  weakSpot: unknown;
}): string {
  const lines = LINES[input.course];
  const hi = lines.hi(safeLearnerName(input.name));
  const level = (input.cefr ?? "").trim().toUpperCase();
  const simple = !level || SIMPLE_LEVELS.has(level);
  const topic = hectorTopicLabel(input.course, input.weakSpot);
  if (topic) return simple ? lines.simpleTopic(hi, topic) : lines.warmTopic(hi, topic);
  return simple ? lines.simple(hi) : lines.warm(hi);
}

export type WeakSpotEntry = { category: string; openCount: number; lastEventAt: string };

const RECENT_MS = 30 * 86_400_000;

/** The open weakness seen most recently, if that was in the last 30 days. */
export function recentWeakSpot(entries: readonly WeakSpotEntry[], now: number): string | null {
  let best: { category: string; at: number } | null = null;
  for (const e of entries) {
    const at = Date.parse(e.lastEventAt);
    if (e.openCount <= 0 || Number.isNaN(at) || now - at > RECENT_MS) continue;
    if (!best || at > best.at) best = { category: e.category, at };
  }
  return best?.category ?? null;
}
