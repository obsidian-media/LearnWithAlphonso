import type { Course } from "@/data/course-meta";
import type { HectorCorrection } from "@/lib/hector-correction";

/**
 * Server-side refinement of a model-made correction card, so two rules hold deterministically (the live checks showed
 * the model does not follow them reliably). Governing principle: NEVER suppress a real fix; when in doubt, keep the
 * card.
 *
 *  1. Minimal span: the common leading and trailing tokens of slip and fix are dropped, so the card shows only the
 *     words that changed. A pure insertion or deletion gets ONE neighbouring common token on both sides.
 *  2. Omitting a Spanish subject pronoun ("Ayer yo comí" -> "Ayer comí") is style, not an error: no card.
 *
 * A capitalisation- or punctuation-only difference is no card either (the card rules already forbid it).
 * shared/hector-correction-refine.json is the fixture; there is deliberately no typo filter.
 */

const SUBJECT_PRONOUNS: Partial<Record<Course, ReadonlySet<string>>> = {
  es: new Set([
    "yo",
    "tú",
    // No bare "tu": it is also the possessive ("tu libro"), and dropping a stray one is a real fix.
    "él",
    "ella",
    "usted",
    "nosotros",
    "nosotras",
    "vosotros",
    "vosotras",
    "ellos",
    "ellas",
    "ustedes",
  ]),
};

const SENTENCE_PUNCT_END = /[.,!?;:]+$/;

function tokenize(text: string): string[] {
  // French puts a space before ! ? : ; : it is not a word of its own.
  return text
    .replace(/\s+([!?:;])/g, "$1")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function norm(token: string): string {
  return token.toLowerCase().replace(SENTENCE_PUNCT_END, "");
}

function stripEnd(text: string): string {
  return text.replace(SENTENCE_PUNCT_END, "");
}

export function refineCorrection(c: HectorCorrection, course: Course): HectorCorrection | null {
  const s = tokenize(c.slip);
  const f = tokenize(c.fix);
  const sn = s.map(norm);
  const fn = f.map(norm);

  let p = 0;
  while (p < sn.length && p < fn.length && sn[p] === fn[p]) p++;
  let t = 0;
  while (
    t < sn.length - p &&
    t < fn.length - p &&
    sn[sn.length - 1 - t] === fn[fn.length - 1 - t]
  ) {
    t++;
  }
  // Identical apart from case or punctuation: a capitalisation or punctuation card.
  if (p === sn.length && p === fn.length) return null;

  let sStart = p;
  let fStart = p;
  let sEnd = s.length - t;
  let fEnd = f.length - t;

  // Subject-pronoun omission is style. Before any extension, so the removed words are the pure diff. Only the
  // "pronoun + verb" shape: exactly one pronoun dropped, a word still follows it, and it is not a doubled pronoun
  // ("Yo yo quiero" is a real fix). Anything else keeps the card.
  const pronouns = SUBJECT_PRONOUNS[course];
  const dropped = norm(s[sStart] ?? "");
  if (
    pronouns &&
    fStart === fEnd &&
    sEnd - sStart === 1 &&
    t > 0 &&
    pronouns.has(dropped) &&
    norm(s[sStart - 1] ?? "") !== dropped &&
    norm(s[sEnd] ?? "") !== dropped
  ) {
    return null;
  }

  // A pure insertion or deletion: borrow ONE neighbouring common token, the following word first.
  if (sStart === sEnd || fStart === fEnd) {
    if (t > 0) {
      sEnd++;
      fEnd++;
    } else if (p > 0) {
      sStart--;
      fStart--;
    }
  }

  const slip = stripEnd(s.slice(sStart, sEnd).join(" "));
  const fix = stripEnd(f.slice(fStart, fEnd).join(" "));
  if (!slip || !fix || slip.toLowerCase() === fix.toLowerCase()) return c.slip === c.fix ? null : c;
  return c.note ? { slip, fix, note: c.note } : { slip, fix };
}
