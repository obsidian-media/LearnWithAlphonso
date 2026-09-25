import { describe, expect, it } from "vitest";
import { BANK_ES } from "./lesson-bank-es";
import { packQuestions } from "./bank-engine";

/**
 * Measures the exact failure mode
 * docs/superpowers/specs/2026-09-25-spanish-content-audit-design.md §5
 * flags: `bank-engine.ts`'s `pickDistractors` pools a cloze pack's answers
 * with no ranking at all (Spanish inherits zero ordering, unlike English's
 * `orderDistractorCandidates`), so a verb-conjugation drill can offer
 * conjugations of a completely different verb as distractors -- testing
 * vocabulary recognition rather than conjugation, and trivially easy either
 * way. This is a Phase 1 FINDING to measure and report, not to fix: porting
 * a ranking layer needs a Spanish morphology decision (spec §5) that is not
 * this session's to make unilaterally.
 *
 * No morphology library and no POS tagger are used here. The signal is
 * mechanical and already present in the content itself: a cloze line's own
 * parenthetical hint -- "Yo ___ (hacer) mi tarea." -- names the verb its
 * answer conjugates. Restricted to hints that are themselves plausible
 * Spanish infinitives (end in -ar/-er/-ir, optionally reflexive -arse/
 * -erse/-irse), which excludes the ~55% of cloze lines whose hint is a
 * vocabulary word or an English gloss rather than a verb (spec's folded-in
 * appendix A.3 / the French audit's §8.5.1 classification: cloze packs are
 * a mix of verb-conjugation drills and non-verb vocabulary fill).
 *
 * distractor-affinity.ts's warning about untagged candidates (an absent tag
 * is a PROMOTION, not an abstention -- English lost 12 tags once and 43
 * questions degraded while its own ratio metric improved, because untagged
 * candidates were silently skipped from the denominator) is the reason this
 * file counts "unresolved" candidates separately rather than folding them
 * into either bucket. A candidate whose answer text cannot be traced back to
 * a verb-hinted line in the same pack is neither confirmed same-verb nor
 * confirmed cross-verb -- it is unmeasured, and reported as such.
 */

const INFINITIVE_RE = /^[a-zà-ÿ]+(?:ar|er|ir)(?:se)?$/i;

function parseHint(left: string): string | null {
  const m = /\(([^)]+)\)/.exec(left);
  if (!m) return null;
  const hint = m[1]!.trim().toLowerCase();
  return INFINITIVE_RE.test(hint) ? hint : null;
}

describe("Spanish cloze distractor cross-verb measurement", () => {
  it("measures how many mc/fill distractors in verb-conjugation cloze questions come from a different verb", () => {
    let sameVerb = 0;
    let crossVerb = 0;
    let unresolved = 0;
    let verbHintedQuestions = 0;

    for (const packs of Object.values(BANK_ES)) {
      for (const pack of packs) {
        if (pack.kind !== "cloze") continue;

        const lines = pack.data
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => l.split("|").map((p) => p.trim()) as [string, string]);

        // answer text (lowercased) -> set of hints that produced it in this
        // pack. A Set, not a single value, because two different verbs can
        // legitimately share a conjugated surface form (e.g. present-tense
        // "es" from ser); ambiguous mappings are conservatively treated as
        // unresolved rather than guessed at.
        const hintsFor = new Map<string, Set<string>>();
        for (const [left, right] of lines) {
          const hint = parseHint(left);
          if (!hint) continue;
          const key = right.toLowerCase();
          if (!hintsFor.has(key)) hintsFor.set(key, new Set());
          hintsFor.get(key)!.add(hint);
        }
        if (hintsFor.size === 0) continue; // no verb-hinted lines in this pack

        for (const question of packQuestions(pack)) {
          // A cloze pack only ever produces mc or fill (see packQuestions in
          // bank-engine.ts) -- narrowed explicitly rather than asserted, so
          // the type checker confirms it rather than trusting a comment.
          if (question.type !== "mc" && question.type !== "fill") continue;
          const answerText =
            question.type === "mc" ? question.choices[question.answer]! : question.answer;
          const correctHints = hintsFor.get(answerText.toLowerCase());
          // Only measuring questions whose own correct answer is unambiguously
          // traced to one verb -- the same conservatism as above.
          if (!correctHints || correctHints.size !== 1) continue;
          const [correctHint] = correctHints;

          const offered =
            question.type === "mc"
              ? question.choices.filter((c) => c !== answerText)
              : question.bank.filter((c) => c !== answerText);
          if (offered.length === 0) continue;

          verbHintedQuestions++;
          for (const candidate of offered) {
            const candidateHints = hintsFor.get(candidate.toLowerCase());
            if (!candidateHints || candidateHints.size === 0) {
              unresolved++;
            } else if (candidateHints.has(correctHint!)) {
              sameVerb++;
            } else {
              crossVerb++;
            }
          }
        }
      }
    }

    // Measured 2026-09-25 on `main` at a4aca47. Not a quality target -- a
    // baseline for a finding, matching english-distractor-quality.test.ts's
    // own UNTAGGED_CANDIDATE_BUDGET pattern (set AT the measured value, not
    // above it, so any future change to this metric -- a content edit or a
    // ranking layer landing -- has to touch this file deliberately rather
    // than drifting silently).
    //
    // The finding: of 1,695 distractors this could confidently trace to a
    // specific verb (sameVerb + crossVerb), 1,611 -- 95.0% -- come from a
    // DIFFERENT verb than the one the question asks about. §5's hypothesis
    // (inherited from the French audit's §8.1/8.5.1) is confirmed, not just
    // plausible: for the 645 mc/fill questions sourced from a verb-hinted
    // cloze line, distractor pooling is overwhelmingly cross-verb, so these
    // questions test "recognize this conjugated word" rather than "conjugate
    // this verb correctly" for the large majority of cases. Fixing this
    // needs a Spanish morphology decision (generate the answer verb's OTHER
    // forms as distractors, mirroring French's own recommendation) that is
    // explicitly not this session's to make -- see spec §5 and §9.
    expect(verbHintedQuestions).toBe(645);
    expect(sameVerb).toBe(84);
    expect(crossVerb).toBe(1611);
    expect(unresolved).toBe(103);
  });
});
