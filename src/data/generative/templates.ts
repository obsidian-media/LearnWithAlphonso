import type { Level } from "../levels";

/** One filled-in-order piece of a Template's sentence. */
export type Slot = {
  name: string;
  pos: "pronoun" | "noun" | "verb" | "adjective";
  /**
   * For verb slots: which other slot's word this one must agree with
   * (English: 3rd-person-singular -s). Undefined for non-verb slots.
   *
   * NOTE: the pilot's compiler (compile.ts, added in a later task) only
   * implements the one concrete rule svo-present actually needs --
   * subject-pronoun -> 3rd-person-singular-or-not. This field is typed
   * generically because the concept generalizes, but a *general*
   * agreement-resolution engine (arbitrary slot-to-slot rules) is
   * explicitly NOT built in this pilot -- a future template with a
   * different agreement shape needs the compiler's own resolution logic
   * extended, not just a new Template entry.
   */
  agreeWith?: string;
};

export type Template = {
  id: string;
  level: Level;
  tense: "present" | "past";
  /** Slots in left-to-right sentence order. */
  slots: Slot[];
  /** `%1`, `%2`, ... index into `slots`, one placeholder per slot. */
  render: string;
};

export type PronounEntry = {
  word: string;
  /** true only for he/she/it -- the sole English pronouns that trigger
   *  3rd-person-singular verb agreement in the present tense. */
  thirdPersonSingular: boolean;
};

/**
 * A fixed, closed 7-word class -- NOT LLM-proposed vocabulary. Consulted
 * directly by the compiler; never grows, never goes through the
 * LLM-propose-then-validate pipeline `vocab.ts` uses for open word
 * classes (noun/verb/adjective).
 */
export const PRONOUNS: PronounEntry[] = [
  { word: "I", thirdPersonSingular: false },
  { word: "you", thirdPersonSingular: false },
  { word: "he", thirdPersonSingular: true },
  { word: "she", thirdPersonSingular: true },
  { word: "it", thirdPersonSingular: true },
  { word: "we", thirdPersonSingular: false },
  { word: "they", thirdPersonSingular: false },
];

/** Pilot ships exactly 2 templates -- proving the architecture, not
 *  building a grammar library. See the design doc's "Explicitly out of
 *  scope" section. */
export const TEMPLATES: Template[] = [
  {
    id: "svo-present",
    level: "A1",
    tense: "present",
    slots: [
      { name: "subject", pos: "pronoun" },
      { name: "verb", pos: "verb", agreeWith: "subject" },
      { name: "object", pos: "noun" },
    ],
    render: "%1 %2 %3.",
  },
  {
    id: "svo-past",
    level: "A1",
    tense: "past",
    slots: [
      { name: "subject", pos: "pronoun" },
      { name: "verb", pos: "verb" },
      { name: "object", pos: "noun" },
    ],
    render: "%1 %2 %3.",
  },
];
