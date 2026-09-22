import nlp from "compromise";

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
