// The full content review (docs/CONTENT-PLAYBOOK.md, "The full review"): every learner-facing item in
// the English, French and Spanish courses, each with a stable id, its source file and the text a
// reviewer reads. Pure: no network, no file writes. The runner (scripts/content-review/run.ts) uses it.
//
// Ids are stable across runs as long as the content's own ids are: a question is keyed by course,
// lesson id and question id (English unit lessons reuse "q1" in every lesson, so the lesson id is
// part of the key); a word card by course, lesson id and the card's lower-cased term.

import { campaignsFor } from "../../data/campaigns";
import { getCourse, type Course } from "../../data/courses";
import type { Question, Unit } from "../../data/curriculum";
import { hash } from "../../data/bank-engine";
import { PODCAST_QUIZZES } from "../../data/podcast-quizzes";
import { scenariosFor } from "../../data/scenarios";
import { deriveVocab } from "../../data/vocab";
import { renderPlacement, renderQuestion } from "../content-panel/panel";

export const COURSES_REVIEWED: readonly Course[] = ["en", "fr", "es"];

export const ITEM_KINDS = [
  "question",
  "card",
  "lesson-meta",
  "unit-meta",
  "placement",
  "campaign",
  "campaign-scene",
  "scenario",
  "podcast-quiz",
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export type ReviewItem = {
  /** Stable id, e.g. "fr:question:fra2p6/fra2p6q3", "en:card:u1l1/good morning". */
  id: string;
  course: Course;
  kind: ItemKind;
  /** Question type for questions and placement ("mc", "fill", ...); absent otherwise. */
  subtype?: string;
  /** CEFR level, or the scenario level ("Beginner"), or "" when the item has none. */
  level: string;
  /** Repo-relative file the item's text comes from (the overlay a fix lands in may differ). */
  source: string;
  /** What the reviewer reads: the item as a learner meets it, the key marked. */
  text: string;
  /** Short content hash of `text`: a changed hash means the item changed since a verdict. */
  hash: string;
  /** Deterministic findings attached before any model reads the item (gates.ts). */
  flags?: string[];
  /** The structured source object (a Question, a card, a scene...): what a fix is checked against. */
  data: Record<string, unknown>;
};

const contentHash = (s: string) => (hash(s) >>> 0).toString(36);

const LANG_NAME: Record<Course, string> = { en: "English", fr: "French", es: "Spanish" };
export const languageName = (c: Course) => LANG_NAME[c];

/**
 * Where a lesson's questions are written. Ids follow the pack naming the banks use: English unit
 * lessons are "u<N>l<N>" in curriculum.ts, English packs "a1p3" in lesson-bank.ts, French and
 * Spanish packs "fra1p3"/"esa1p3" in their banks, generated packs "frg..."/"esg...".
 */
export function lessonSource(course: Course, lessonId: string): string {
  if (course === "en")
    return /^u\d+l\d+$/.test(lessonId) ? "src/data/curriculum.ts" : "src/data/lesson-bank.ts";
  if (/^(fr|es)g/.test(lessonId)) return "src/data/generative/romance-packs.ts";
  return course === "fr" ? "src/data/lesson-bank-fr.ts" : "src/data/lesson-bank-es.ts";
}

const PLACEMENT_SOURCE: Record<Course, string> = {
  en: "src/data/placement.ts",
  fr: "src/data/placement-fr.ts",
  es: "src/data/placement-es.ts",
};

function item(base: Omit<ReviewItem, "hash">): ReviewItem {
  return { ...base, hash: contentHash(base.text) };
}

function questionItems(course: Course, units: Unit[]): ReviewItem[] {
  return units.flatMap((u) =>
    u.lessons.flatMap((l) =>
      l.questions.map((q: Question) =>
        item({
          id: `${course}:question:${l.id}/${q.id}`,
          course,
          kind: "question",
          subtype: q.type,
          level: u.level,
          source: lessonSource(course, l.id),
          text: `lesson: ${l.title} (${u.level})\n${renderQuestion(q)}`,
          data: q as unknown as Record<string, unknown>,
        }),
      ),
    ),
  );
}

/** Word cards with something authored or derived beyond the bare answer (meaning or example). */
function cardItems(course: Course, units: Unit[]): ReviewItem[] {
  return units.flatMap((u) =>
    u.lessons.flatMap((l) =>
      deriveVocab(l)
        .filter((c) => c.meaning || c.example)
        .map((c) =>
          item({
            id: `${course}:card:${l.id}/${c.term.trim().toLowerCase()}`,
            course,
            kind: "card",
            level: u.level,
            source: lessonSource(course, l.id),
            text: [
              `word card in lesson: ${l.title} (${u.level})`,
              `term: ${c.term}`,
              `meaning (English gloss): ${c.meaning || "(none)"}`,
              `example: ${c.example || "(none)"}`,
            ].join("\n"),
            data: { term: c.term, meaning: c.meaning, example: c.example },
          }),
        ),
    ),
  );
}

function metaItems(course: Course, units: Unit[]): ReviewItem[] {
  const src = course === "en" ? "src/data/curriculum.ts" : `src/data/curriculum-${course}.ts`;
  return units.flatMap((u) => [
    item({
      id: `${course}:unit-meta:${u.id}`,
      course,
      kind: "unit-meta",
      level: u.level,
      source: src,
      text: `unit (${u.level}): ${u.eyebrow}\ntitle: ${u.title}\ndescription: ${u.description}`,
      data: { title: u.title, description: u.description },
    }),
    ...u.lessons.map((l) =>
      item({
        id: `${course}:lesson-meta:${l.id}`,
        course,
        kind: "lesson-meta",
        level: u.level,
        source: lessonSource(course, l.id),
        text: `lesson (${u.level}) in unit "${u.title}"\ntitle: ${l.title}\nsubtitle: ${l.subtitle}`,
        data: { title: l.title, subtitle: l.subtitle },
      }),
    ),
  ]);
}

function placementItems(course: Course): ReviewItem[] {
  return getCourse(course).placementPool.map((q) =>
    item({
      id: `${course}:placement:${q.id}`,
      course,
      kind: "placement",
      subtype: q.type,
      level: q.level,
      source: PLACEMENT_SOURCE[course],
      text: `band: ${q.level}\n${renderPlacement(q)}`,
      data: q as unknown as Record<string, unknown>,
    }),
  );
}

function campaignItems(course: Course): ReviewItem[] {
  return campaignsFor(course).flatMap((c) => [
    item({
      id: `${course}:campaign:${c.id}`,
      course,
      kind: "campaign",
      level: c.level,
      source: "src/data/campaigns*.ts",
      text: [
        `story campaign (${c.level})`,
        `title (target language): ${c.title}`,
        `blurb (English UI text): ${c.blurb}`,
        `premise the conversation partner follows: ${c.premise}`,
      ].join("\n"),
      data: { title: c.title, blurb: c.blurb, premise: c.premise },
    }),
    ...c.scenes.map((s) =>
      item({
        id: `${course}:campaign-scene:${c.id}/${s.id}`,
        course,
        kind: "campaign-scene",
        level: c.level,
        source: "src/data/campaigns*.ts",
        text: [
          `story: ${c.title} (${c.level}), scene: ${s.title}`,
          `opening line the learner sees: ${s.opener}`,
          `instructions the conversation partner follows: ${s.systemPrompt}`,
        ].join("\n"),
        data: { title: s.title, opener: s.opener, systemPrompt: s.systemPrompt },
      }),
    ),
  ]);
}

function scenarioItems(course: Course): ReviewItem[] {
  return scenariosFor(course).map((s) =>
    item({
      id: `${course}:scenario:${s.id}`,
      course,
      kind: "scenario",
      level: s.level,
      source: "src/data/scenarios.ts",
      text: [
        `speaking scenario (${s.level})`,
        `title: ${s.title}`,
        `blurb (English UI text): ${s.blurb}`,
        `opening line the learner sees: ${s.opener}`,
        `instructions the conversation partner follows: ${s.systemPrompt}`,
      ].join("\n"),
      data: { title: s.title, blurb: s.blurb, opener: s.opener, systemPrompt: s.systemPrompt },
    }),
  );
}

function podcastItems(course: Course): ReviewItem[] {
  return PODCAST_QUIZZES.filter((p) => p.course === course).flatMap((p) =>
    p.questions.map((q) =>
      item({
        id: `${course}:podcast-quiz:${p.folder}/${p.slug}/${q.id}`,
        course,
        kind: "podcast-quiz",
        subtype: "mc",
        level: "",
        source: "src/data/podcast-quizzes.ts",
        text: [
          `podcast quiz, episode ${p.folder}/${p.slug} (answerable from the audio)`,
          `prompt: ${q.prompt}`,
          ...q.choices.map((c, i) => `  ${String.fromCharCode(65 + i)}. ${c}`),
          `KEY: ${q.choices[q.answerIndex]}`,
          `transcript evidence: ${q.evidence}`,
        ].join("\n"),
        data: q as unknown as Record<string, unknown>,
      }),
    ),
  );
}

/** Every reviewable item of one course, in a fixed order. */
export function courseInventory(course: Course): ReviewItem[] {
  const units = getCourse(course).curriculum;
  return [
    ...questionItems(course, units),
    ...cardItems(course, units),
    ...metaItems(course, units),
    ...placementItems(course),
    ...campaignItems(course),
    ...scenarioItems(course),
    ...podcastItems(course),
  ];
}

/** Every reviewable item of every course. Ids are unique (a test holds this). */
export function fullInventory(): ReviewItem[] {
  return COURSES_REVIEWED.flatMap(courseInventory);
}

export type InventoryCounts = Record<string, Record<Course, number>>;

/** Counts per kind (questions split by type), per course. */
export function inventoryCounts(items: ReviewItem[]): InventoryCounts {
  const out: InventoryCounts = {};
  for (const it of items) {
    const row = it.kind === "question" ? `question:${it.subtype}` : it.kind;
    out[row] = out[row] ?? { en: 0, fr: 0, es: 0 };
    out[row][it.course]++;
  }
  return out;
}
