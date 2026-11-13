import { z } from "zod";
import type { NATIVE_LANGUAGES } from "./learner-profile";

/**
 * "Explain in my language" (BACKLOG 0.0-bc). The lesson stays wholly in the course language; only the WHY is offered
 * in the learner's own language, and only when asked. Pure rules shared by the server route, the web client and the
 * tests; the apps keep their own copies of the same rules (ExplainRules.swift, ExplainRules.kt).
 */

/** Its own daily budget, like `define`. Must agree with consume_ai_quota (20261112100000_explain_in_my_language.sql). */
export const EXPLAIN_DAILY_LIMIT = 40;

/** A generous bound for a 3-sentence explanation in any script; also the length the cache table accepts. */
export const EXPLANATION_MAX_CHARS = 700;

export type NativeLanguage = (typeof NATIVE_LANGUAGES)[number];

/**
 * Scripts written right to left among the languages a learner can choose. Kurdish "ku" stays left to right: the
 * Latin-script Kurmanji form is the common one.
 */
const RTL_LANGUAGES: ReadonlySet<string> = new Set(["ar", "fa", "he", "ur", "ps"]);

export function languageDirection(code: string): "rtl" | "ltr" {
  return RTL_LANGUAGES.has(code) ? "rtl" : "ltr";
}

export const EXPLAIN_MODES = ["tap", "always", "off"] as const;
export type ExplainMode = (typeof EXPLAIN_MODES)[number];

/** Anything else, including nothing, is the mock's default: tap to explain. */
export function explainModeOf(raw: unknown): ExplainMode {
  return (EXPLAIN_MODES as readonly unknown[]).includes(raw) ? (raw as ExplainMode) : "tap";
}

export type ExplainOffer = "chip" | "auto" | "hidden";

/**
 * What a screen shows: a chip to tap, the explanation straight away, or nothing. Nothing when the learner chose
 * "Target language only", has no native language on file, or their native language IS the course's.
 */
export function explainOffer(args: {
  mode: ExplainMode;
  nativeLanguage: string | undefined | null;
  course: string;
}): ExplainOffer {
  if (args.mode === "off") return "hidden";
  if (!args.nativeLanguage || args.nativeLanguage === args.course) return "hidden";
  return args.mode === "always" ? "auto" : "chip";
}

/** The language's name in English ("Persian"): the chip says "Explain in Persian", the prompt names it. */
export function explainLanguageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

const COURSES = ["en", "fr", "es"] as const;
const text = (max: number) => z.string().trim().min(1).max(max);
const surface = z.enum(["app", "hector"]).optional();

/**
 * The item to explain. The language is NOT here: the server reads it from the account, so a client cannot ask for
 * another language or smuggle one into a prompt. `surface: "hector"` spends Hector's own Pro allowance.
 */
export const explainRequestSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("wrong-answer"),
      course: z.enum(COURSES),
      question: text(400),
      wrongAnswer: text(400),
      correctAnswer: text(400),
      surface,
    })
    .strict(),
  z
    .object({
      kind: z.literal("word"),
      course: z.enum(COURSES),
      word: text(80),
      sentence: text(400).optional(),
      surface,
    })
    .strict(),
  z
    .object({ kind: z.literal("message"), course: z.enum(COURSES), text: text(1000), surface })
    .strict(),
]);

export type ExplainRequest = z.infer<typeof explainRequestSchema>;

/** Model output to what is shown: plain text, trimmed, never longer than the cache accepts; empty is a failure. */
export function parseExplanation(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  return Array.from(t).slice(0, EXPLANATION_MAX_CHARS).join("");
}

export type DirectionRun = { text: string; ltr: boolean };

const LATIN_RUN =
  /\p{Script=Latin}[\p{Script=Latin}\p{N}'’]*(?:[ ,.!?'’-]+\p{Script=Latin}[\p{Script=Latin}\p{N}'’]*)*[.!?]?/gu;

/**
 * A right-to-left explanation quotes the course language ("I live here."). Those quotes must stay left to right
 * and isolated from the surrounding sentence, so the learner sees the pattern whole: the client renders each `ltr`
 * run in its own `<bdi dir="ltr">`. The pieces always join back to exactly the input.
 */
export function splitDirectionRuns(text: string): DirectionRun[] {
  const runs: DirectionRun[] = [];
  let last = 0;
  for (const m of text.matchAll(LATIN_RUN)) {
    const at = m.index ?? 0;
    if (at > last) runs.push({ text: text.slice(last, at), ltr: false });
    runs.push({ text: m[0], ltr: true });
    last = at + m[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), ltr: false });
  return runs;
}
