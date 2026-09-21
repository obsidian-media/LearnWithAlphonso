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

  it("every lesson row's unit_id references a real English unit row", () => {
    const unitIds = new Set(buildUnitRows("en").map((u) => u.id));
    const lessons = buildLessonRows("en");
    expect(lessons.length).toBe(534); // matches ios-content-export.test.ts's known English lesson count
    for (const l of lessons) expect(unitIds.has(l.unit_id)).toBe(true);
  });

  it("every French lesson row's unit_id references a real French unit row", () => {
    const unitIds = new Set(buildUnitRows("fr").map((u) => u.id));
    const lessons = buildLessonRows("fr");
    expect(lessons.length).toBe(500); // matches ios-content-export.test.ts's known French lesson count
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

  it("shapes every mc/fill question row exactly like the DB's question_shape_matches_type CHECK constraint requires", () => {
    const questions = [...buildQuestionRows("en"), ...buildQuestionRows("fr")];
    const hasMc = questions.some((q) => q.type === "mc");
    const hasFill = questions.some((q) => q.type === "fill");
    expect(hasMc).toBe(true);
    expect(hasFill).toBe(true);
    for (const q of questions) {
      if (q.type === "mc") {
        expect(q.choices).not.toBeNull();
        expect(q.answer_index).not.toBeNull();
        expect(q.bank).toBeNull();
        expect(q.answer_text).toBeNull();
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
      expect(r.choices.length).toBeGreaterThan(0);
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
    expect(seed.lessons.length).toBe(534 + 500 + 508);
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
