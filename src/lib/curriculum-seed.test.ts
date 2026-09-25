import { describe, expect, it } from "vitest";
import { LEVELS } from "@/data/levels";
import { SCENARIOS } from "@/data/scenarios";
import { PLACEMENT_QUESTIONS } from "@/data/placement";
import { PLACEMENT_QUESTIONS_FR } from "@/data/placement-fr";
import { PLACEMENT_QUESTIONS_ES } from "@/data/placement-es";
import {
  buildFullSeed,
  buildLessonRows,
  buildLevelRows,
  buildPlacementQuestionRows,
  buildQuestionRows,
  buildScenarioRows,
  buildUnitRows,
  buildVocabImageRows,
} from "./curriculum-seed";

describe("buildLevelRows", () => {
  it("returns one row per CEFR level, in LEVELS order", () => {
    const rows = buildLevelRows();
    expect(rows.map((r) => r.id)).toEqual(LEVELS.map((l) => l.id));
    expect(rows.every((r, i) => r.sort_order === i)).toBe(true);
  });
});

describe("buildUnitRows / buildLessonRows / buildQuestionRows", () => {
  it("tags every English unit row with course 'en' and a real level_id", () => {
    const levelIds = new Set<string>(LEVELS.map((l) => l.id));
    const rows = buildUnitRows("en");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.course).toBe("en");
      expect(levelIds.has(r.level_id)).toBe(true);
    }
  });

  it("maps a translate question onto the bank + answer_text row shape", () => {
    const row = buildQuestionRows("en").find((r) => r.type === "translate");
    expect(row).toBeDefined();
    // The curated phrasings ride in `bank` and the canonical one in
    // answer_text, so no new column is needed and grade-review's generic
    // non-mc path still has something sane to compare against.
    expect(Array.isArray(row!.bank)).toBe(true);
    expect((row!.bank as string[]).length).toBeGreaterThanOrEqual(2);
    expect(row!.answer_text).toBe((row!.bank as string[])[0]);
    expect(row!.choices).toBeNull();
    expect(row!.answer_index).toBeNull();
  });

  it("every lesson row's unit_id references a real English unit row", () => {
    const unitIds = new Set(buildUnitRows("en").map((u) => u.id));
    const lessons = buildLessonRows("en");
    expect(lessons.length).toBe(609); // matches ios-content-export.test.ts's known English lesson count
    for (const l of lessons) expect(unitIds.has(l.unit_id)).toBe(true);
  });

  it("every French lesson row's unit_id references a real French unit row", () => {
    const unitIds = new Set(buildUnitRows("fr").map((u) => u.id));
    const lessons = buildLessonRows("fr");
    // matches ios-content-export.test.ts's known French lesson count (500 + 25
    // from PR 2's translate packs + 25 from PR 3's listening packs + 25 from
    // PR 4's speak packs)
    expect(lessons.length).toBe(575);
    for (const l of lessons) expect(unitIds.has(l.unit_id)).toBe(true);
  });

  it("every question row's lesson_id references a real lesson row (both courses)", () => {
    const lessonIds = new Set(
      [...buildLessonRows("en"), ...buildLessonRows("fr")].map((l) => l.id),
    );
    const questions = [...buildQuestionRows("en"), ...buildQuestionRows("fr")];
    expect(questions.length).toBeGreaterThan(0);
    for (const q of questions) expect(lessonIds.has(q.lesson_id)).toBe(true);
  });

  it("shapes every question row exactly like the DB's question_shape_matches_type CHECK constraint requires", () => {
    // The constraint (see supabase/migrations/, most recently
    // 20260924081755_v5_speaking_question_type.sql) permits exactly four
    // shapes. A row matching none of them is rejected outright by Postgres, so
    // this test is the local stand-in for that constraint.
    const questions = [...buildQuestionRows("en"), ...buildQuestionRows("fr")];
    expect(questions.some((q) => q.type === "mc")).toBe(true);
    expect(questions.some((q) => q.type === "fill")).toBe(true);
    expect(questions.some((q) => q.type === "listening")).toBe(true);
    expect(questions.some((q) => q.type === "speak")).toBe(true);
    for (const q of questions) {
      if (q.type === "mc") {
        expect(q.choices).not.toBeNull();
        expect(q.answer_index).not.toBeNull();
        expect(q.bank).toBeNull();
        expect(q.answer_text).toBeNull();
      } else if (q.type === "speak") {
        // A fourth shape: answer_text alone. Nothing to choose between and no
        // word bank -- just the phrase the learner has to say.
        expect(q.answer_text).not.toBeNull();
        expect(q.choices).toBeNull();
        expect(q.bank).toBeNull();
        expect(q.answer_index).toBeNull();
      } else if (q.type === "listening") {
        // A third shape: choices like mc, but answer_text like fill, because
        // the variant stores the correct choice's text rather than its index.
        expect(q.choices).not.toBeNull();
        expect(q.answer_text).not.toBeNull();
        expect(q.bank).toBeNull();
        expect(q.answer_index).toBeNull();
      } else {
        expect(q.bank).not.toBeNull();
        expect(q.answer_text).not.toBeNull();
        expect(q.choices).toBeNull();
        expect(q.answer_index).toBeNull();
      }
    }
  });
});

describe("buildVocabImageRows", () => {
  it("returns a non-empty, fully-populated row per VOCAB_IMAGES entry", () => {
    const rows = buildVocabImageRows();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.term).toBe(r.term.toLowerCase());
      expect(r.url).toBeTruthy();
      expect(r.alt).toBeTruthy();
      expect(r.credit).toBeTruthy();
    }
  });
});

describe("buildPlacementQuestionRows", () => {
  it("matches PLACEMENT_QUESTIONS' English pool 1:1 with a real level_id", () => {
    const levelIds = new Set<string>(LEVELS.map((l) => l.id));
    const rows = buildPlacementQuestionRows("en");
    expect(rows.length).toBe(PLACEMENT_QUESTIONS.length);
    for (const r of rows) {
      expect(r.course).toBe("en");
      expect(levelIds.has(r.level_id)).toBe(true);
      // Only the option-based types carry choices now; a translate row's
      // wordings live in `bank`.
      if (r.type === "translate") expect(r.bank?.length ?? 0).toBeGreaterThan(0);
      else expect(r.choices?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("matches PLACEMENT_QUESTIONS_FR' French pool 1:1", () => {
    const rows = buildPlacementQuestionRows("fr");
    expect(rows.length).toBe(PLACEMENT_QUESTIONS_FR.length);
    expect(rows.every((r) => r.course === "fr")).toBe(true);
  });
});

describe("buildScenarioRows", () => {
  it("matches SCENARIOS 1:1 with every required field populated", () => {
    const rows = buildScenarioRows();
    expect(rows.length).toBe(SCENARIOS.length);
    for (const r of rows) {
      expect(r.id).toBeTruthy();
      expect(r.system_prompt).toBeTruthy();
      expect(r.opener).toBeTruthy();
      expect(["Beginner", "Intermediate", "Advanced"]).toContain(r.level);
    }
  });
});

describe("buildFullSeed", () => {
  it("assembles every table's rows for all courses with consistent totals", () => {
    const seed = buildFullSeed();
    expect(seed.levels.length).toBe(LEVELS.length);
    expect(seed.units.length).toBe(
      buildUnitRows("en").length + buildUnitRows("fr").length + buildUnitRows("es").length,
    );
    // French: 500 + 25 from PR 2's translate packs + 25 from PR 3's listening
    // packs + 25 from PR 4's speak packs.
    // Spanish: 508 (phase 1) + 25 from this PR's (PR 4/4) speak packs. PR 2's
    // translate packs and PR 3's listening packs are each on their own
    // still-unmerged branch as of this PR -- once both land, this becomes
    // 508 + 75.
    expect(seed.lessons.length).toBe(609 + 575 + 533);
    expect(seed.questions.length).toBe(
      buildQuestionRows("en").length +
        buildQuestionRows("fr").length +
        buildQuestionRows("es").length,
    );
    expect(seed.vocabImages.length).toBe(buildVocabImageRows().length);
    expect(seed.placementQuestions.length).toBe(
      PLACEMENT_QUESTIONS.length + PLACEMENT_QUESTIONS_FR.length + PLACEMENT_QUESTIONS_ES.length,
    );
    expect(seed.scenarios.length).toBe(SCENARIOS.length);
  });

  it("has no duplicate IDs within any single table (globally unique except questions, keyed within lesson)", () => {
    const seed = buildFullSeed();
    const assertUnique = (ids: string[], label: string) => {
      expect(new Set(ids).size, `${label} should have no duplicate ids`).toBe(ids.length);
    };
    assertUnique(
      seed.levels.map((r) => r.id),
      "levels",
    );
    assertUnique(
      seed.units.map((r) => r.id),
      "units",
    );
    assertUnique(
      seed.lessons.map((r) => r.id),
      "lessons",
    );
    assertUnique(
      seed.placementQuestions.map((r) => r.id),
      "placementQuestions",
    );
    assertUnique(
      seed.scenarios.map((r) => r.id),
      "scenarios",
    );
    assertUnique(
      seed.vocabImages.map((r) => r.term),
      "vocabImages",
    );
    assertUnique(
      seed.questions.map((r) => `${r.lesson_id}:${r.id}`),
      "questions (lesson_id:id)",
    );
  });
});

describe("placement rows satisfy the shape their table allows", () => {
  // The migration's CHECK gives each type exactly the columns it can answer
  // from. These assertions are that constraint, in TypeScript, so a bad row is
  // caught here rather than by a failing seed in CI -- where the failure mode
  // is the deploy job going red and the Edge Function deploy being skipped
  // with it.
  const rows = buildPlacementQuestionRows("en");

  it("emits one row per placement question, keyed by id", () => {
    expect(rows.map((r) => r.id).sort()).toEqual(PLACEMENT_QUESTIONS.map((p) => p.id).sort());
  });

  it("gives mc rows choices and an index, and nothing else", () => {
    for (const r of rows.filter((r) => r.type === "mc")) {
      expect(r.choices?.length ?? 0).toBeGreaterThan(0);
      expect(typeof r.answer_index).toBe("number");
      expect(r.answer_text).toBeNull();
      expect(r.bank).toBeNull();
      expect(r.audio_text).toBeNull();
    }
  });

  it("gives listening rows something to play and a text answer", () => {
    const listening = rows.filter((r) => r.type === "listening");
    expect(listening.length).toBeGreaterThan(0);
    for (const r of listening) {
      expect(r.audio_text?.trim()).toBeTruthy();
      expect(r.choices).toContain(r.answer_text);
      expect(r.answer_index).toBeNull();
      expect(r.bank).toBeNull();
    }
  });

  it("gives translate rows their wordings, with the canonical one in answer_text", () => {
    const translate = rows.filter((r) => r.type === "translate");
    expect(translate.length).toBeGreaterThan(0);
    for (const r of translate) {
      expect(r.bank?.length ?? 0).toBeGreaterThanOrEqual(2);
      expect(r.answer_text).toBe(r.bank?.[0]);
      expect(r.choices).toBeNull();
      expect(r.answer_index).toBeNull();
      expect(r.audio_text).toBeNull();
    }
  });
});
