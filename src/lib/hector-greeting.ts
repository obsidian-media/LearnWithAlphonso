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
  /** A1, A2 or an unknown level. Variant 0 is the line iOS and Android say; the rest are web-only until they catch up. */
  simple: ((hi: string) => string)[];
  /** B1 and up. */
  warm: ((hi: string) => string)[];
  simpleTopic: ((hi: string, topic: string) => string)[];
  warmTopic: ((hi: string, topic: string) => string)[];
  hi: (name: string | null) => string;
};

/** French puts a no-break space before ! and ?. */
const NB = " ";

const LINES: Record<Course, Lines> = {
  en: {
    hi: (name) => (name ? `Hi ${name}!` : "Hi!"),
    simple: [
      (hi) => `${hi} I'm Hector. What do you want to talk about today?`,
      (hi) => `${hi} Hector here. Tell me one thing you did today.`,
      (hi) => `${hi} Nice to talk again. How are you feeling today?`,
    ],
    warm: [
      (hi) => `${hi} Good to see you. What's been happening lately? Tell me about it.`,
      (hi) => `${hi} Welcome back. What's one thing on your mind today?`,
      (hi) => `${hi} Let's talk. What did you get up to this week?`,
    ],
    simpleTopic: [
      (hi, t) => `${hi} Last time you had trouble with ${t}. Let's practice together. Ready?`,
      (hi, t) => `${hi} Last time we worked on ${t}. Let's try it again. Ready?`,
      (hi, t) => `${hi} Today let's practice ${t}, a little at a time. Ready?`,
    ],
    warmTopic: [
      (hi, t) => `${hi} Last time ${t} tripped you up. Want to practice that in conversation?`,
      (hi, t) => `${hi} Last time we worked on ${t}. Shall we pick it up where we left off?`,
      (hi, t) => `${hi} I remember ${t} was tricky. Let's use it in a real chat today.`,
    ],
  },
  fr: {
    hi: (name) => (name ? `Salut ${name}${NB}!` : `Salut${NB}!`),
    simple: [
      (hi) => `${hi} Moi, c'est Hector. De quoi tu veux parler aujourd'hui${NB}?`,
      (hi) => `${hi} C'est Hector. Dis-moi une chose que tu as faite aujourd'hui.`,
      (hi) => `${hi} Content de reparler avec toi. Comment tu te sens aujourd'hui${NB}?`,
    ],
    warm: [
      (hi) => `${hi} Content de te voir. Raconte-moi, quoi de neuf${NB}?`,
      (hi) => `${hi} Bon retour. Qu'est-ce qui te passe par la tête aujourd'hui${NB}?`,
      (hi) => `${hi} On discute${NB}? Qu'est-ce que tu as fait cette semaine${NB}?`,
    ],
    simpleTopic: [
      (hi, t) => `${hi} La dernière fois, tu as eu du mal avec ${t}. On s'entraîne ensemble${NB}?`,
      (hi, t) => `${hi} La dernière fois, on a travaillé ${t}. On reprend${NB}?`,
      (hi, t) => `${hi} Aujourd'hui, on s'entraîne sur ${t}, petit à petit. Prêt${NB}?`,
    ],
    warmTopic: [
      (hi, t) =>
        `${hi} La dernière fois, tu as eu du mal avec ${t}. Tu veux t'entraîner en conversation${NB}?`,
      (hi, t) =>
        `${hi} La dernière fois, on a travaillé ${t}. On reprend là où on s'était arrêtés${NB}?`,
      (hi, t) =>
        `${hi} Je me souviens que ${t} était difficile. Essayons-le dans une vraie discussion.`,
    ],
  },
  es: {
    hi: (name) => (name ? `¡Hola, ${name}!` : "¡Hola!"),
    simple: [
      (hi) => `${hi} Soy Hector. ¿De qué quieres hablar hoy?`,
      (hi) => `${hi} Aquí Hector. Cuéntame una cosa que hiciste hoy.`,
      (hi) => `${hi} Qué bueno hablar otra vez. ¿Cómo te sientes hoy?`,
    ],
    warm: [
      (hi) => `${hi} Qué gusto verte. Cuéntame, ¿qué hay de nuevo?`,
      (hi) => `${hi} Bienvenido de nuevo. ¿Qué tienes en la cabeza hoy?`,
      (hi) => `${hi} Vamos a conversar. ¿Qué hiciste esta semana?`,
    ],
    simpleTopic: [
      (hi, t) => `${hi} La última vez tuviste problemas con ${t}. ¿Practicamos juntos?`,
      (hi, t) => `${hi} La última vez trabajamos ${t}. ¿Lo retomamos?`,
      (hi, t) => `${hi} Hoy practicamos ${t}, poco a poco. ¿Listo?`,
    ],
    warmTopic: [
      (hi, t) =>
        `${hi} La última vez tuviste dificultades con ${t}. ¿Te animas a practicar conversando?`,
      (hi, t) => `${hi} La última vez trabajamos ${t}. ¿Seguimos donde lo dejamos?`,
      (hi, t) => `${hi} Recuerdo que ${t} fue difícil. Usémoslo hoy en una conversación de verdad.`,
    ],
  },
};

/** How many greetings each kind has: the same in every course and level. */
export const GREETING_VARIANTS = LINES.en.simple.length;

/**
 * Which variant to say. Never the one said last (when known), so two calls in a row never open with the same words;
 * `random` is a number in [0, 1).
 */
export function pickGreetingVariant(last: number | null | undefined, random: number): number {
  const pool = Array.from({ length: GREETING_VARIANTS }, (_, i) => i).filter((i) => i !== last);
  return pool[Math.min(pool.length - 1, Math.floor(random * pool.length))] ?? 0;
}

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
    "gender-agreement": "le genre et l'accord",
    "verb-conjugation": "la conjugaison",
    "partitive-articles": "les articles partitifs",
    "tense-choice": "le choix du temps",
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
    "ser-estar": "ser y estar",
    "gender-agreement": "el género y la concordancia",
    "verb-conjugation": "la conjugación",
    "por-para": "por y para",
    "small-words": "las palabras pequeñas como con, de, a",
    "tense-choice": "la elección del tiempo",
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
  /** Which of the GREETING_VARIANTS to say (0 when omitted, the line native clients say). */
  variant?: number;
}): string {
  const lines = LINES[input.course];
  const hi = lines.hi(safeLearnerName(input.name));
  const level = (input.cefr ?? "").trim().toUpperCase();
  const simple = !level || SIMPLE_LEVELS.has(level);
  const topic = hectorTopicLabel(input.course, input.weakSpot);
  const v = Number.isInteger(input.variant) ? Math.abs(input.variant as number) : 0;
  const pick = <T>(list: T[]): T => list[v % list.length]!;
  if (topic) return simple ? pick(lines.simpleTopic)(hi, topic) : pick(lines.warmTopic)(hi, topic);
  return simple ? pick(lines.simple)(hi) : pick(lines.warm)(hi);
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

/**
 * Every greeting Hector can say that has no learner name in it: each course, each of the two level wordings, and the
 * plain line plus one for every weakness label we own. A finite list of our own fixed sentences, so the text-to-speech
 * route may keep their audio for every learner (src/lib/tts-cache.ts); a greeting with a name is never in it.
 */
export function namelessHectorGreetings(): string[] {
  const out = new Set<string>();
  for (const course of Object.keys(LINES) as Course[]) {
    for (const cefr of ["A1", "B1"]) {
      for (let variant = 0; variant < GREETING_VARIANTS; variant++) {
        out.add(buildHectorGreeting({ course, cefr, name: null, weakSpot: null, variant }));
        for (const category of Object.keys(TOPICS[course])) {
          out.add(buildHectorGreeting({ course, cefr, name: null, weakSpot: category, variant }));
        }
      }
    }
  }
  return [...out];
}
