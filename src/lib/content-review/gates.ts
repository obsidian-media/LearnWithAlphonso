// Deterministic findings folded into the full review before any model reads an item (phase 2 of
// docs/CONTENT-PLAYBOOK.md, "The full review"). They cost nothing, and each one is either a defect
// class a test already ratchets (so the model does not need to find it) or a known open item from a
// review. A flag travels with the item into every prompt, so the reviewer is told about it and the
// judge must resolve it.
//
// The vitest gates themselves (romance-options, romance-conjugation, distractor-gate, ...) stay the
// source of truth for pass/fail; this file only names WHICH items carry a ratcheted defect.

import { BANK_ES } from "../../data/lesson-bank-es";
import { BANK_FR } from "../../data/lesson-bank-fr";
import { packQuestions, type Pack } from "../../data/bank-engine";
import type { Question } from "../../data/curriculum";
import { isFormOf } from "../../data/conjugation-form-check";
import { ROMANCE_CLOZE } from "../../data/romance-cloze-options";
import { bracketedVerb } from "../../data/romance-conjugation";
import type { ReviewItem } from "./inventory";
import { withReviewFix } from "../../data/review-fixes";

/** The pack's questions as learners get them (review fixes applied). */
const built = (p: Pack) =>
  packQuestions(p).map((q) => withReviewFix(p.id.startsWith("fr") ? "fr" : "es", q));

export const FLAG = {
  /** The explanation is the generated '"x" is correct here. <pack note>' (says nothing about this line). */
  genericExplanation: "generic-explanation",
  /** A B1-C1 conjugation drill offers a wrong option that is not a form of the bracketed verb. */
  drillNonForm: "drill-non-form",
  /** A B1-C1 French/Spanish fill-in line whose wrong options are all other lines' answers. */
  clozeFromPool: "cloze-from-pool",
  /** Named by a reviewer as still having a second correct answer. */
  knownSecondAnswer: "known-second-answer",
} as const;

/** Matches the generator's text in bank-engine.ts and lesson-bank.ts exactly. */
export const GENERIC_EXPLANATION = /^"[^"]*" is correct here\. /;

/**
 * Items a reviewer named that are not fixed yet (review of #428, 2026-11-06), keyed
 * "<course>:<question id>" (pack question ids are unique within a course; lesson ids are not stable
 * names for this, "frc1p19l1").
 */
export const KNOWN_SECOND_ANSWER: Record<string, string> = {
  "fr:frc1p19q4": "review of #428: still has a second correct answer",
  "fr:frc1p19q15": "review of #428: still has a second correct answer",
};

// ---- Conjugation drills (same detector as romance-conjugation.test.ts) -------------------------------

const INFINITIVE = {
  fr: /^(se\s+|s')?[\p{L}]+(er|ir|re)$/u,
  es: /^[\p{L}]*(ar|er|ir|ír)(se)?$/u,
};
const MIN_DRILL_LINES = 5;

const optionsOf = (q: Question) => (q.type === "mc" ? q.choices : q.type === "fill" ? q.bank : []);
const answerOf = (q: Question) =>
  q.type === "mc" ? q.choices[q.answer]! : q.type === "fill" ? q.answer : "";

/** Question ids (pack-unique) of B1-C1 drill lines that offer a non-form of the bracketed verb. */
export function drillNonFormIds(packs: Pack[]): Set<string> {
  const out = new Set<string>();
  for (const p of packs) {
    if (p.kind !== "cloze" || /^(fr|es)g/.test(p.id)) continue;
    const lang = p.id.startsWith("fr") ? "fr" : "es";
    const inPack: { id: string; bad: boolean }[] = [];
    for (const q of built(p)) {
      if (q.type !== "mc" && q.type !== "fill") continue;
      const verb = bracketedVerb(q.prompt);
      if (!verb || !INFINITIVE[lang].test(verb)) continue;
      const answer = answerOf(q);
      if (!isFormOf(answer, verb)) continue;
      const wrong = optionsOf(q).filter((o) => o !== answer);
      inPack.push({ id: q.id, bad: wrong.some((w) => !isFormOf(w, verb)) });
    }
    if (inPack.length >= MIN_DRILL_LINES) for (const d of inPack) if (d.bad) out.add(d.id);
  }
  return out;
}

/**
 * Question ids of B1-C1 hand-written cloze lines with no authored options whose wrong options are
 * all answers of other lines in the same pack (the reviewer's "distractors from other lines").
 * Drill lines are left to drillNonFormIds.
 */
export function clozeFromPoolIds(packs: Pack[], drills: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const p of packs) {
    if (p.kind !== "cloze" || /^(fr|es)g/.test(p.id) || ROMANCE_CLOZE[p.id]) continue;
    const qs = built(p).filter((q) => q.type === "mc" || q.type === "fill");
    const answers = new Set(qs.map(answerOf));
    for (const q of qs) {
      if (drills.has(q.id)) continue;
      const answer = answerOf(q);
      const wrong = optionsOf(q).filter((o) => o !== answer);
      if (wrong.length && wrong.every((w) => answers.has(w))) out.add(q.id);
    }
  }
  return out;
}

const B1C1 = [BANK_FR, BANK_ES].flatMap((b) => [...b.B1, ...b.B2, ...b.C1]);

/** The item's question id (the part after the lesson id), or null for non-questions. */
const questionIdOf = (it: ReviewItem) =>
  it.kind === "question" ? (it.id.split("/").pop() ?? null) : null;

/** Attaches every deterministic flag. Returns new items; the input is not changed. */
export function withGateFlags(items: ReviewItem[]): ReviewItem[] {
  const drills = drillNonFormIds(B1C1);
  const pool = clozeFromPoolIds(B1C1, drills);
  return items.map((it) => {
    const flags: string[] = [];
    if (
      it.kind === "question" &&
      /explanation shown after: "[^"]*" is correct here\. /.test(it.text)
    )
      flags.push(FLAG.genericExplanation);
    const qid = questionIdOf(it);
    if (qid && it.course !== "en") {
      if (drills.has(qid)) flags.push(FLAG.drillNonForm);
      if (pool.has(qid)) flags.push(FLAG.clozeFromPool);
    }
    if (qid && KNOWN_SECOND_ANSWER[`${it.course}:${qid}`]) flags.push(FLAG.knownSecondAnswer);
    return flags.length ? { ...it, flags } : it;
  });
}

export function flagCounts(items: ReviewItem[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const it of items)
    for (const f of it.flags ?? []) {
      out[f] = out[f] ?? { en: 0, fr: 0, es: 0 };
      out[f][it.course] = (out[f][it.course] ?? 0) + 1;
    }
  return out;
}
