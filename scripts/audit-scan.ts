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
 * Checks:
 *   self-ref   a choice appears verbatim as a word in its own prompt
 *              (e.g. 'Opposite of "old":' offering "old" as a choice)
 *   pos        a distractor's coarse part of speech differs from the answer's
 *   dup-clue   two lines in one pack have near-identical prompts but different
 *              answers, so both answers are defensible for either prompt
 *
 * Usage: bun run scripts/audit-scan.ts [LEVEL]
 */
import fs from "node:fs";
import path from "node:path";
import nlp from "compromise";
import type { DumpedQuestion } from "../src/lib/english-content-dump";

type Flag = {
  key: string;
  packId: string;
  kind: "self-ref" | "pos" | "dup-clue";
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

function promptWords(prompt: string): Set<string> {
  return new Set(
    prompt
      .toLowerCase()
      .replace(/_+/g, " ")
      .replace(/[^a-z\s'-]/g, " ")
      .split(/\s+/)
      .filter(Boolean),
  );
}

function contentWords(prompt: string): string[] {
  const stop = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "to", "of", "and", "or",
    "in", "on", "at", "it", "its", "this", "that", "with", "has", "have", "for",
    "something", "someone", "you", "your", "i", "we", "they", "he", "she",
  ]);
  return [...promptWords(prompt)].filter((w) => !stop.has(w));
}

function packOf(q: DumpedQuestion): string {
  return q.questionId.replace(/q\d+$/, "");
}

function choicesOf(q: DumpedQuestion): string[] {
  return q.choices ?? q.bank ?? [];
}

function scan(questions: DumpedQuestion[]): Flag[] {
  const flags: Flag[] = [];

  for (const q of questions) {
    const choices = choicesOf(q);
    if (choices.length === 0) continue;
    const words = promptWords(q.prompt);

    for (const c of choices) {
      const lc = c.trim().toLowerCase();
      if (!lc.includes(" ") && words.has(lc) && lc !== q.answer.trim().toLowerCase()) {
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

    const answerPos = coarsePos(q.answer);
    const mismatched = choices
      .filter((c) => c.trim().toLowerCase() !== q.answer.trim().toLowerCase())
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

  const byPack = new Map<string, DumpedQuestion[]>();
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

const levels = process.argv[2] ? [process.argv[2]] : ["A1", "A2", "B1", "B2", "C1", "placement"];
const outDir = path.resolve(import.meta.dirname, "../.audit");

for (const level of levels) {
  const src = path.join(outDir, `english-${level}.json`);
  if (!fs.existsSync(src)) {
    console.log(`skip ${level}: ${src} missing (run scripts/dump-english-questions.ts first)`);
    continue;
  }
  const questions = JSON.parse(fs.readFileSync(src, "utf8")) as DumpedQuestion[];
  const flags = scan(questions);
  const out = path.join(outDir, `flags-${level}.json`);
  fs.writeFileSync(out, JSON.stringify(flags, null, 2));
  const counts = flags.reduce<Record<string, number>>((acc, f) => {
    acc[f.kind] = (acc[f.kind] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `${level}: ${questions.length} questions, ${flags.length} flags ` +
      `(self-ref ${counts["self-ref"] ?? 0}, pos ${counts.pos ?? 0}, dup-clue ${counts["dup-clue"] ?? 0}) -> ${out}`,
  );
}
