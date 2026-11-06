/**
 * The one source of truth for the voices Alphonso and Hector speak with: which Deepgram Aura-2 voices a learner
 * may choose per course, and each character's default. The server validates every requested voice against this
 * list (an arbitrary model id is a cost and abuse risk), and the Settings picker on every platform lists it.
 *
 * Mirrored on iOS (LearnWithAlphonsoKit/VoiceCatalog.swift) and Android (core/voice/VoiceCatalog.kt);
 * src/lib/voice-catalog-parity.test.ts fails when a mirror drifts. Every id here was synthesised on 2026-11-06;
 * aura-2-valentina-es is in Deepgram's catalogue but returns 400, so it is left out.
 *
 * Previews never call TTS: each voice has a static clip at /voices/<id>.mp3 (public/voices/).
 */
import { isCourse, type Course } from "@/data/courses";

export type VoiceCharacter = "alphonso" | "hector";
export const VOICE_CHARACTERS: readonly VoiceCharacter[] = ["alphonso", "hector"];
export type VoiceGender = "male" | "female";

export type VoiceOption = {
  id: string;
  course: Course;
  name: string;
  gender: VoiceGender;
  accent: string;
  descriptor: string;
};

/** Defaults per character and course. Edit here (and in the two mirrors) to change a default. */
export const DEFAULT_VOICES: Readonly<Record<VoiceCharacter, Readonly<Record<Course, string>>>> = {
  alphonso: { en: "aura-2-saturn-en", es: "aura-2-javier-es", fr: "aura-2-hector-fr" },
  hector: { en: "aura-2-hermes-en", es: "aura-2-alvaro-es", fr: "aura-2-hector-fr" },
};

export const VOICE_CATALOG: readonly VoiceOption[] = [
  {
    id: "aura-2-andromeda-en",
    course: "en",
    name: "Andromeda",
    gender: "female",
    accent: "American",
    descriptor: "Casual, expressive",
  },
  {
    id: "aura-2-apollo-en",
    course: "en",
    name: "Apollo",
    gender: "male",
    accent: "American",
    descriptor: "Confident, comfortable",
  },
  {
    id: "aura-2-arcas-en",
    course: "en",
    name: "Arcas",
    gender: "male",
    accent: "American",
    descriptor: "Natural, smooth",
  },
  {
    id: "aura-2-aries-en",
    course: "en",
    name: "Aries",
    gender: "male",
    accent: "American",
    descriptor: "Warm, energetic",
  },
  {
    id: "aura-2-asteria-en",
    course: "en",
    name: "Asteria",
    gender: "female",
    accent: "American",
    descriptor: "Clear, confident",
  },
  {
    id: "aura-2-athena-en",
    course: "en",
    name: "Athena",
    gender: "female",
    accent: "American",
    descriptor: "Calm, smooth",
  },
  {
    id: "aura-2-atlas-en",
    course: "en",
    name: "Atlas",
    gender: "male",
    accent: "American",
    descriptor: "Enthusiastic, confident",
  },
  {
    id: "aura-2-aurora-en",
    course: "en",
    name: "Aurora",
    gender: "female",
    accent: "American",
    descriptor: "Cheerful, expressive",
  },
  {
    id: "aura-2-callista-en",
    course: "en",
    name: "Callista",
    gender: "female",
    accent: "American",
    descriptor: "Clear, energetic",
  },
  {
    id: "aura-2-cora-en",
    course: "en",
    name: "Cora",
    gender: "female",
    accent: "American",
    descriptor: "Smooth, melodic",
  },
  {
    id: "aura-2-cordelia-en",
    course: "en",
    name: "Cordelia",
    gender: "female",
    accent: "American",
    descriptor: "Approachable, warm",
  },
  {
    id: "aura-2-delia-en",
    course: "en",
    name: "Delia",
    gender: "female",
    accent: "American",
    descriptor: "Casual, friendly",
  },
  {
    id: "aura-2-draco-en",
    course: "en",
    name: "Draco",
    gender: "male",
    accent: "British",
    descriptor: "Warm, approachable",
  },
  {
    id: "aura-2-electra-en",
    course: "en",
    name: "Electra",
    gender: "female",
    accent: "American",
    descriptor: "Professional, engaging",
  },
  {
    id: "aura-2-helena-en",
    course: "en",
    name: "Helena",
    gender: "female",
    accent: "American",
    descriptor: "Caring, natural",
  },
  {
    id: "aura-2-hera-en",
    course: "en",
    name: "Hera",
    gender: "female",
    accent: "American",
    descriptor: "Smooth, warm",
  },
  {
    id: "aura-2-hermes-en",
    course: "en",
    name: "Hermes",
    gender: "male",
    accent: "American",
    descriptor: "Expressive, engaging",
  },
  {
    id: "aura-2-hyperion-en",
    course: "en",
    name: "Hyperion",
    gender: "male",
    accent: "Australian",
    descriptor: "Caring, warm",
  },
  {
    id: "aura-2-iris-en",
    course: "en",
    name: "Iris",
    gender: "female",
    accent: "American",
    descriptor: "Cheerful, positive",
  },
  {
    id: "aura-2-juno-en",
    course: "en",
    name: "Juno",
    gender: "female",
    accent: "American",
    descriptor: "Natural, engaging",
  },
  {
    id: "aura-2-jupiter-en",
    course: "en",
    name: "Jupiter",
    gender: "male",
    accent: "American",
    descriptor: "Expressive, knowledgeable",
  },
  {
    id: "aura-2-luna-en",
    course: "en",
    name: "Luna",
    gender: "female",
    accent: "American",
    descriptor: "Friendly, natural",
  },
  {
    id: "aura-2-mars-en",
    course: "en",
    name: "Mars",
    gender: "male",
    accent: "American",
    descriptor: "Smooth, patient",
  },
  {
    id: "aura-2-neptune-en",
    course: "en",
    name: "Neptune",
    gender: "male",
    accent: "American",
    descriptor: "Professional, patient",
  },
  {
    id: "aura-2-orpheus-en",
    course: "en",
    name: "Orpheus",
    gender: "male",
    accent: "American",
    descriptor: "Professional, clear",
  },
  {
    id: "aura-2-pandora-en",
    course: "en",
    name: "Pandora",
    gender: "female",
    accent: "British",
    descriptor: "Smooth, calm",
  },
  {
    id: "aura-2-phoebe-en",
    course: "en",
    name: "Phoebe",
    gender: "female",
    accent: "American",
    descriptor: "Energetic, warm",
  },
  {
    id: "aura-2-pluto-en",
    course: "en",
    name: "Pluto",
    gender: "male",
    accent: "American",
    descriptor: "Smooth, calm",
  },
  {
    id: "aura-2-saturn-en",
    course: "en",
    name: "Saturn",
    gender: "male",
    accent: "American",
    descriptor: "Knowledgeable, confident",
  },
  {
    id: "aura-2-selene-en",
    course: "en",
    name: "Selene",
    gender: "female",
    accent: "American",
    descriptor: "Expressive, engaging",
  },
  {
    id: "aura-2-thalia-en",
    course: "en",
    name: "Thalia",
    gender: "female",
    accent: "American",
    descriptor: "Clear, confident",
  },
  {
    id: "aura-2-vesta-en",
    course: "en",
    name: "Vesta",
    gender: "female",
    accent: "American",
    descriptor: "Natural, expressive",
  },
  {
    id: "aura-2-agustina-es",
    course: "es",
    name: "Agustina",
    gender: "female",
    accent: "Spain",
    descriptor: "Calm, clear",
  },
  {
    id: "aura-2-alvaro-es",
    course: "es",
    name: "Alvaro",
    gender: "male",
    accent: "Spain",
    descriptor: "Calm, professional",
  },
  {
    id: "aura-2-antonia-es",
    course: "es",
    name: "Antonia",
    gender: "female",
    accent: "Argentine",
    descriptor: "Approachable, enthusiastic",
  },
  {
    id: "aura-2-aquila-es",
    course: "es",
    name: "Aquila",
    gender: "male",
    accent: "Latin American",
    descriptor: "Casual, comfortable",
  },
  {
    id: "aura-2-carina-es",
    course: "es",
    name: "Carina",
    gender: "female",
    accent: "Spain",
    descriptor: "Professional, raspy",
  },
  {
    id: "aura-2-celeste-es",
    course: "es",
    name: "Celeste",
    gender: "female",
    accent: "Colombian",
    descriptor: "Clear, energetic",
  },
  {
    id: "aura-2-diana-es",
    course: "es",
    name: "Diana",
    gender: "female",
    accent: "Spain",
    descriptor: "Professional, confident",
  },
  {
    id: "aura-2-gloria-es",
    course: "es",
    name: "Gloria",
    gender: "female",
    accent: "Colombian",
    descriptor: "Casual, clear",
  },
  {
    id: "aura-2-javier-es",
    course: "es",
    name: "Javier",
    gender: "male",
    accent: "Latin American",
    descriptor: "Approachable, calm",
  },
  {
    id: "aura-2-nestor-es",
    course: "es",
    name: "Nestor",
    gender: "male",
    accent: "Spain",
    descriptor: "Calm, professional",
  },
  {
    id: "aura-2-olivia-es",
    course: "es",
    name: "Olivia",
    gender: "female",
    accent: "Mexican",
    descriptor: "Breathy, calm",
  },
  {
    id: "aura-2-selena-es",
    course: "es",
    name: "Selena",
    gender: "female",
    accent: "Latin American",
    descriptor: "Approachable, calm",
  },
  {
    id: "aura-2-silvia-es",
    course: "es",
    name: "Silvia",
    gender: "female",
    accent: "Spain",
    descriptor: "Charismatic, clear",
  },
  {
    id: "aura-2-sirio-es",
    course: "es",
    name: "Sirio",
    gender: "male",
    accent: "Mexican",
    descriptor: "Breathy, confident",
  },
  {
    id: "aura-2-valerio-es",
    course: "es",
    name: "Valerio",
    gender: "male",
    accent: "Mexican",
    descriptor: "Deep, knowledgeable",
  },
  {
    id: "aura-2-agathe-fr",
    course: "fr",
    name: "Agathe",
    gender: "female",
    accent: "French",
    descriptor: "Charismatic, cheerful",
  },
  {
    id: "aura-2-hector-fr",
    course: "fr",
    name: "Hector",
    gender: "male",
    accent: "French",
    descriptor: "Confident, empathetic",
  },
];

/** Where a voice's preview clip is served (a static file, never a TTS call). */
export function voicePreviewPath(id: string): string {
  return `/voices/${id}.mp3`;
}

export function voicesForCourse(course: Course): VoiceOption[] {
  return VOICE_CATALOG.filter((v) => v.course === course);
}

export function findVoice(id: string): VoiceOption | undefined {
  return VOICE_CATALOG.find((v) => v.id === id);
}

/** True only for a voice on the allow-list for exactly this course. */
export function isAllowedVoice(course: Course, id: unknown): id is string {
  return typeof id === "string" && VOICE_CATALOG.some((v) => v.id === id && v.course === course);
}

export function isVoiceCharacter(value: unknown): value is VoiceCharacter {
  return value === "alphonso" || value === "hector";
}

/** The learner's choices: per character, per course. Missing entries mean "the default". */
export type VoicePrefs = { [C in VoiceCharacter]?: { [K in Course]?: string } };

/**
 * The key in the account's Supabase auth `user_metadata` that holds VoicePrefs. The auth record is the account's
 * existing per-user store (it already holds the Apple given name), follows the learner to every device, and is
 * deleted with the account, so voices need no table or migration.
 */
export const VOICE_PREFS_METADATA_KEY = "voices";

/** Reads VoicePrefs out of untrusted JSON, keeping only allow-listed voices for the right course. */
export function parseVoicePrefs(raw: unknown): VoicePrefs {
  const prefs: VoicePrefs = {};
  if (!raw || typeof raw !== "object") return prefs;
  for (const character of VOICE_CHARACTERS) {
    const perCourse = (raw as Record<string, unknown>)[character];
    if (!perCourse || typeof perCourse !== "object") continue;
    for (const [course, id] of Object.entries(perCourse as Record<string, unknown>)) {
      if (isCourse(course) && isAllowedVoice(course, id)) {
        (prefs[character] ??= {})[course] = id;
      }
    }
  }
  return prefs;
}

/** The learner's voice for a character and course: their stored choice if allowed, else the default. */
export function chosenVoice(prefs: VoicePrefs, character: VoiceCharacter, course: Course): string {
  const id = prefs[character]?.[course];
  return isAllowedVoice(course, id) ? id : DEFAULT_VOICES[character][course];
}

/** Returns new prefs with one choice set; choosing the default removes the entry. */
export function withVoiceChoice(
  prefs: VoicePrefs,
  character: VoiceCharacter,
  course: Course,
  id: string,
): VoicePrefs {
  if (!isAllowedVoice(course, id)) return prefs;
  const next: VoicePrefs = { alphonso: { ...prefs.alphonso }, hector: { ...prefs.hector } };
  if (id === DEFAULT_VOICES[character][course]) delete next[character]![course];
  else next[character]![course] = id;
  return next;
}

/**
 * The server's single decision: the requested voice when it is on this course's allow-list, else the account's
 * stored choice when that is allowed, else the character's default. Never an arbitrary model id.
 */
export function resolveServerVoice(input: {
  character: VoiceCharacter;
  course: Course;
  requested?: unknown;
  stored?: VoicePrefs;
}): string {
  if (isAllowedVoice(input.course, input.requested)) return input.requested;
  return chosenVoice(input.stored ?? {}, input.character, input.course);
}

/**
 * /api/tts's voice: the conversation's course (or, from clients that send only a voice, the voice's own language)
 * picks the allow-list; anything not on it falls back to the character's default for that course. No course and no
 * recognisable voice keeps English, which every earlier client relies on.
 */
export function resolveTtsVoice(body: {
  voice?: unknown;
  course?: unknown;
  character?: unknown;
}): string {
  const character: VoiceCharacter = isVoiceCharacter(body.character) ? body.character : "alphonso";
  let course: Course = "en";
  if (typeof body.course === "string" && isCourse(body.course)) course = body.course;
  else if (typeof body.voice === "string") {
    const fromVoice = /^aura-2-[a-z]+-(en|fr|es)$/.exec(body.voice)?.[1];
    if (fromVoice && isCourse(fromVoice)) course = fromVoice;
  }
  return resolveServerVoice({ character, course, requested: body.voice });
}
