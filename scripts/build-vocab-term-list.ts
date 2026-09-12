/**
 * One-off analysis script: computes the exact set of vocab terms missing
 * an image, split by course (English / French), so the next
 * fetch-vocab-images.ts run has a ready term list once a PEXELS_API_KEY
 * is available. Not part of the app build — run manually with tsx.
 *
 * Usage: node_modules/.bin/tsx scripts/build-vocab-term-list.ts
 */
import { curriculum } from "../src/data/curriculum";
import { curriculumFr } from "../src/data/curriculum-fr";
import { VOCAB_IMAGES } from "../src/data/vocab-images";
import type { Question } from "../src/data/curriculum";
import fs from "node:fs";

function answerOf(q: Question): string {
  return q.type === "mc" ? (q.choices[q.answer] ?? "") : q.answer;
}

// Same heuristic as the manual English batch: skip pure function words /
// grammar particles that never get a meaningful stock photo regardless of
// fetch volume, plus anything too short or non-alphabetic to search well.
const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "am",
  "be",
  "been",
  "being",
  "do",
  "does",
  "did",
  "have",
  "has",
  "had",
  "will",
  "would",
  "shall",
  "should",
  "can",
  "could",
  "may",
  "might",
  "must",
  "to",
  "of",
  "in",
  "on",
  "at",
  "by",
  "for",
  "with",
  "about",
  "against",
  "between",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "up",
  "down",
  "out",
  "off",
  "over",
  "under",
  "again",
  "further",
  "then",
  "once",
  "here",
  "there",
  "when",
  "where",
  "why",
  "how",
  "all",
  "any",
  "both",
  "each",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "no",
  "nor",
  "not",
  "only",
  "own",
  "same",
  "so",
  "than",
  "too",
  "very",
  "just",
  "and",
  "but",
  "or",
  "if",
  "because",
  "as",
  "until",
  "while",
  "i",
  "you",
  "he",
  "she",
  "it",
  "we",
  "they",
  "me",
  "him",
  "her",
  "us",
  "them",
  "my",
  "your",
  "his",
  "its",
  "our",
  "their",
  "this",
  "that",
  "these",
  "those",
  "who",
  "whom",
  "which",
  "what",
]);

function isCandidate(term: string): boolean {
  const t = term.trim();
  if (t.length < 3) return false;
  if (!/[a-zA-ZÀ-ſ]/.test(t)) return false;
  // Drop anything that's clearly an instructional fragment or full sentence
  // (quotes/commas/periods, or long phrases) rather than a searchable noun.
  if (/["“”,.]/.test(t)) return false;
  const words = t.trim().split(/\s+/);
  if (words.length > 3) return false;
  const lower = t.toLowerCase();
  const firstWord = words[0].toLowerCase();
  // Single-word terms that are pure function words -> skip.
  if (words.length === 1 && STOPWORDS.has(firstWord)) return false;
  return true;
}

function collect(units: typeof curriculum): Map<string, string> {
  // key (lowercased) -> original-cased term, first occurrence wins
  const map = new Map<string, string>();
  for (const unit of units) {
    for (const lesson of unit.lessons) {
      for (const q of lesson.questions) {
        const term = answerOf(q).trim();
        if (!term) continue;
        const key = term.toLowerCase();
        if (!map.has(key)) map.set(key, term);
      }
    }
  }
  return map;
}

const enTerms = collect(curriculum);
const frTerms = collect(curriculumFr);

const missingEn: string[] = [];
for (const [key, original] of enTerms) {
  if (VOCAB_IMAGES[key]) continue;
  if (!isCandidate(original)) continue;
  missingEn.push(original);
}

const missingFr: string[] = [];
for (const [key, original] of frTerms) {
  if (VOCAB_IMAGES[key]) continue;
  if (!isCandidate(original)) continue;
  missingFr.push(original);
}

missingEn.sort((a, b) => a.localeCompare(b));
missingFr.sort((a, b) => a.localeCompare(b));

fs.writeFileSync(
  "scripts/vocab-terms-missing-en.json",
  JSON.stringify(missingEn, null, 2) + "\n",
  "utf-8",
);
fs.writeFileSync(
  "scripts/vocab-terms-missing-fr.json",
  JSON.stringify(missingFr, null, 2) + "\n",
  "utf-8",
);

console.log(
  `English: ${enTerms.size} total unique terms, ${enTerms.size - missingEn.length - (enTerms.size - [...enTerms.keys()].filter((k) => !VOCAB_IMAGES[k]).length)} skipped by filter or already covered`,
);
console.log(
  `English: ${missingEn.length} candidate terms missing images -> scripts/vocab-terms-missing-en.json`,
);
console.log(`French: ${frTerms.size} total unique terms`);
console.log(
  `French: ${missingFr.length} candidate terms missing images -> scripts/vocab-terms-missing-fr.json`,
);
