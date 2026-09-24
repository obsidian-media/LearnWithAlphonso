/**
 * Phase 1 audit helper: flags CANDIDATE content problems for human review.
 *
 * This is a triage tool, not a judge. Every flag it raises is reviewed by a
 * person before any edit is made, and it never edits content itself. That
 * matters especially for the part-of-speech check: `compromise`'s tagging of
 * bare words out of context has documented false positives in this repo (see
 * docs/superpowers/specs/2026-09-22-generative-sentence-content-design.md), so
 * its output is a reading order, not a verdict.
 *
 * `compromise` is an English-only NLP library (spec
 * docs/superpowers/specs/2026-09-24-french-content-audit-design.md section
 * 2.1) -- the `pos` check only runs for course "en"; running it against
 * French or Spanish words would produce confidently wrong tags the same way
 * the first (bare-word) English tag map did.
 *
 * Checks:
 *   answer-leak the correct answer itself already appears in the prompt
 *               (e.g. a cloze hint showing the infinitive that's also the
 *               answer) -- spec section 6.3 item 4
 *   self-ref    a wrong choice appears verbatim as a word in its own prompt
 *               (e.g. 'Opposite of "old":' offering "old" as a distractor)
 *   pos         (English only) a distractor's coarse part of speech differs
 *               from the answer's
 *   dup-clue    two lines in one pack have near-identical prompts but different
 *               answers, so both answers are defensible for either prompt
 *
 * Usage: bun run scripts/audit-scan.ts [course] [LEVEL]
 * `course` is "en" (default), "fr", or "es".
 */
import fs from "node:fs";
import path from "node:path";
import nlp from "compromise";
import type { DumpedQuestion } from "../src/lib/english-content-dump";
import type { Course } from "../src/data/courses";

type Flag = {
  key: string;
  packId: string;
  kind: "answer-leak" | "self-ref" | "pos" | "dup-clue";
  prompt: string;
  answer: string;
  detail: string;
};

const CATEGORIES = [
  "Verb",
  "Adjective",
  "Adverb",
  "Preposition",
  "Pronoun",
  "Determiner",
  "Value",
  "Noun",
] as const;

function coarsePos(word: string): string {
  const doc = nlp(word);
  for (const c of CATEGORIES) {
    if (doc.has(`#${c}`)) return c;
  }
  return "Other";
}

// Keeps the 18 non-ASCII characters lesson-bank-fr.ts actually uses
// (À Ç Ê à â ç è é ê ë î ô ù û œ – — …) instead of stripping to [a-z] only --
// a strip-to-ASCII pattern silently makes every French self-ref instance
// with an accented word invisible to this scan.
function promptWords(prompt: string): Set<string> {
  return new Set(
    prompt
      .toLowerCase()
      .replace(/_+/g, " ")
      .replace(/[^a-z0-9àâäéèêëîïôöùûüçœ\s'-]/g, " ")
      .split(/\s+/)
      .filter(Boolean),
  );
}

function contentWords(prompt: string): string[] {
  const stop = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "to",
    "of",
    "and",
    "or",
    "in",
    "on",
    "at",
    "it",
    "its",
    "this",
    "that",
    "with",
    "has",
    "have",
    "for",
    "something",
    "someone",
    "you",
    "your",
    "i",
    "we",
    "they",
    "he",
    "she",
  ]);
  return [...promptWords(prompt)].filter((w) => !stop.has(w));
}

function packOf(q: DumpedQuestion): string {
  return q.questionId.replace(/q\d+$/, "");
}

function choicesOf(q: DumpedQuestion): string[] {
  return q.choices ?? q.bank ?? [];
}

function scan(questions: DumpedQuestion[], course: Course): Flag[] {
  const flags: Flag[] = [];

  for (const q of questions) {
    const choices = choicesOf(q);
    if (choices.length === 0) continue;
    const words = promptWords(q.prompt);
    const answerLc = q.answer.trim().toLowerCase();

    // Spec item 4: the ANSWER itself already appears in the prompt (e.g. a
    // cloze hint literally showing the infinitive that's also the answer).
    // This is distinct from -- and more severe than -- a wrong choice
    // appearing in the prompt, so it gets its own flag kind.
    if (!answerLc.includes(" ") && words.has(answerLc)) {
      flags.push({
        key: q.key,
        packId: packOf(q),
        kind: "answer-leak",
        prompt: q.prompt,
        answer: q.answer,
        detail: `the answer "${q.answer}" already appears in the prompt`,
      });
    }

    for (const c of choices) {
      const lc = c.trim().toLowerCase();
      if (!lc.includes(" ") && words.has(lc) && lc !== answerLc) {
        flags.push({
          key: q.key,
          packId: packOf(q),
          kind: "self-ref",
          prompt: q.prompt,
          answer: q.answer,
          detail: `choice "${c}" already appears in the prompt`,
        });
      }
    }

    if (course === "en") {
      const answerPos = coarsePos(q.answer);
      const mismatched = choices
        .filter((c) => c.trim().toLowerCase() !== answerLc)
        .filter((c) => coarsePos(c) !== answerPos);
      if (mismatched.length > 0) {
        flags.push({
          key: q.key,
          packId: packOf(q),
          kind: "pos",
          prompt: q.prompt,
          answer: q.answer,
          detail: `answer is ${answerPos}; ${mismatched
            .map((m) => `"${m}" is ${coarsePos(m)}`)
            .join(", ")}`,
        });
      }
    }
  }

  // contentWords()'s stop-word list is English-only. Run against French/Spanish
  // it filters nothing (le/la/de/un... aren't stopped), so nearly every prompt
  // pair in a pack shares enough function words to cross the ratio threshold --
  // a mass false-positive explosion, not a real finding. Gate to English until
  // this check gets a per-language stop-word list; French's cross-pack exact
  // duplicates are covered separately (curriculum-consistency.test.ts).
  const byPack = new Map<string, DumpedQuestion[]>();
  if (course === "en")
    for (const q of questions) {
      const p = packOf(q);
      if (!byPack.has(p)) byPack.set(p, []);
      byPack.get(p)!.push(q);
    }

  for (const [packId, qs] of byPack) {
    for (let i = 0; i < qs.length; i++) {
      for (let j = i + 1; j < qs.length; j++) {
        const a = qs[i]!;
        const b = qs[j]!;
        if (a.answer.trim().toLowerCase() === b.answer.trim().toLowerCase()) continue;
        const wa = contentWords(a.prompt);
        const wb = contentWords(b.prompt);
        if (wa.length < 2 || wb.length < 2) continue;
        const shared = wa.filter((w) => wb.includes(w)).length;
        const ratio = shared / Math.min(wa.length, wb.length);
        if (ratio >= 0.6) {
          flags.push({
            key: a.key,
            packId,
            kind: "dup-clue",
            prompt: a.prompt,
            answer: a.answer,
            detail: `near-identical clue to ${b.key} ("${b.prompt}" -> "${b.answer}"); both answers may fit both prompts`,
          });
        }
      }
    }
  }

  return flags;
}

const PREFIXES: Record<Course, string> = { en: "english", fr: "french", es: "spanish" };
const course = (process.argv[2] ?? "en") as Course;
if (!(course in PREFIXES)) {
  console.error(`Unknown course "${course}" -- expected en, fr, or es.`);
  process.exit(1);
}
const prefix = PREFIXES[course];

const levels = process.argv[3] ? [process.argv[3]] : ["A1", "A2", "B1", "B2", "C1", "placement"];
const outDir = path.resolve(import.meta.dirname, "../.audit");

for (const level of levels) {
  const src = path.join(outDir, `${prefix}-${level}.json`);
  if (!fs.existsSync(src)) {
    console.log(
      `skip ${level}: ${src} missing (run scripts/dump-english-questions.ts ${course} first)`,
    );
    continue;
  }
  const questions = JSON.parse(fs.readFileSync(src, "utf8")) as DumpedQuestion[];
  const flags = scan(questions, course);
  const out = path.join(outDir, `flags-${prefix}-${level}.json`);
  fs.writeFileSync(out, JSON.stringify(flags, null, 2));
  const counts = flags.reduce<Record<string, number>>((acc, f) => {
    acc[f.kind] = (acc[f.kind] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `${level}: ${questions.length} questions, ${flags.length} flags ` +
      `(answer-leak ${counts["answer-leak"] ?? 0}, self-ref ${counts["self-ref"] ?? 0}, ` +
      `pos ${counts.pos ?? 0}, dup-clue ${counts["dup-clue"] ?? 0}) -> ${out}`,
  );
}
