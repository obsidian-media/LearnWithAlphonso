import nlp from "compromise";
import type { Template } from "./templates";
import { PRONOUNS } from "./templates";

/**
 * Generative sentence-content pilot (English only) --
 * docs/superpowers/specs/2026-09-22-generative-sentence-content-design.md.
 *
 * VERIFIED 2026-09-22 via a hands-on spike, not assumed from docs:
 * querying `compromise` with a sentence's *actual* subject and trusting
 * its own agreement detection is unreliable -- it mis-conjugates "you"
 * as 3rd-person-singular ("you goes", "you is", "you has"), and a bare
 * isolated word fails to reach past tense with no context at all ("go"
 * alone stays "go", not "went"). The fix: never feed compromise the
 * real subject; always derive both needed forms from fixed,
 * known-correct contexts, and let the caller (compileLine, added in a
 * later task) pick the right one based on the actual subject -- not
 * compromise's own (buggy) subject detection.
 *
 * Verified against have/go/do/walk/run/eat/play with zero manual
 * overrides needed (see compile.test.ts). "be" is the one exception --
 * deliberately excluded from the pilot's vocab dataset rather than
 * special-cased, since it needs a full person-varying present paradigm
 * (am/are/is) this derivation doesn't produce.
 */
export function baseForm(verb: string): string {
  const doc = nlp(`I ${verb}`);
  doc.verbs().toPresentTense();
  return doc.text().replace(/^I /, "");
}

export function thirdPersonForm(verb: string): string {
  const doc = nlp(`he ${verb}`);
  doc.verbs().toPresentTense();
  return doc.text().replace(/^he /, "");
}

export function pastForm(verb: string): string {
  const doc = nlp(`I ${verb}`);
  doc.verbs().toPastTense();
  return doc.text().replace(/^I /, "");
}

/** Slot name -> the concrete word chosen for it (a pronoun's own word,
 *  or a VocabEntry's word). */
export type SlotAssignment = Record<string, string>;

/**
 * Article for a noun slot's value: "" for an uncountable noun (per
 * compromise's own tagging -- verified against water/music/clothes,
 * which do get tagged "Uncountable"), otherwise "a "/"an " by a plain
 * leading-vowel-sound heuristic. Found in the 2026-09-22 final review
 * (finding C3): the original compiler rendered nouns bare ("he ___
 * dog.", "it ___ shower."), which is ungrammatical for any ordinary
 * countable noun -- falsifying the pilot's own "grammar-correct-by-
 * construction" claim. This is an improvement, not a perfect fix:
 * compromise's Singular/Uncountable tagging doesn't capture every
 * idiomatic exception (e.g. "coffee" tags Singular, so this renders "a
 * coffee" even though "drinks coffee" is also natural; "go to school"
 * idiomatically drops the article compromise's tag says to add) --
 * documented as a known limitation, not silently assumed solved.
 */
function articleFor(noun: string): string {
  const doc = nlp(noun);
  const tags: string[] = doc.json()[0]?.terms?.[0]?.tags ?? [];
  if (tags.includes("Uncountable")) return "";
  return /^[aeiou]/i.test(noun) ? "an " : "a ";
}

/**
 * Compiles one Template + a concrete word-per-slot assignment into a
 * literal "sentence|answer" line -- the exact shape bank-engine.ts's
 * packQuestions() already parses from a Pack.data string. Only the verb
 * slot is blanked (the grammatically interesting part being tested);
 * other slots render as plain text, except noun slots which get an
 * article (see articleFor). The rendered sentence is capitalized.
 */
export function compileLine(template: Template, assignment: SlotAssignment): string {
  const verbSlot = template.slots.find((s) => s.pos === "verb");
  if (!verbSlot) throw new Error(`template "${template.id}" has no verb slot to test`);

  const subjectSlot = verbSlot.agreeWith
    ? template.slots.find((s) => s.name === verbSlot.agreeWith)
    : undefined;
  const subjectWord = subjectSlot ? assignment[subjectSlot.name] : undefined;
  const pronoun = subjectWord
    ? PRONOUNS.find((p) => p.word.toLowerCase() === subjectWord.toLowerCase())
    : undefined;

  const rawVerb = assignment[verbSlot.name];
  if (rawVerb === undefined) throw new Error(`missing assignment for slot "${verbSlot.name}"`);

  const answer =
    template.tense === "past"
      ? pastForm(rawVerb)
      : pronoun?.thirdPersonSingular
        ? thirdPersonForm(rawVerb)
        : baseForm(rawVerb);

  let prompt = template.render;
  template.slots.forEach((slot, i) => {
    const placeholder = `%${i + 1}`;
    if (slot.name === verbSlot.name) {
      prompt = prompt.replace(placeholder, "___");
      return;
    }
    const value = assignment[slot.name];
    if (value === undefined) throw new Error(`missing assignment for slot "${slot.name}"`);
    const rendered = slot.pos === "noun" ? `${articleFor(value)}${value}` : value;
    prompt = prompt.replace(placeholder, rendered);
  });
  prompt = prompt.charAt(0).toUpperCase() + prompt.slice(1);

  return `${prompt}|${answer}`;
}
