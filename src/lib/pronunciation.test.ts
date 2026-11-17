import { describe, expect, it } from "vitest";
import { getCourse } from "@/data/courses";
import { deriveVocab } from "@/data/vocab";
import {
  HIGH_CONFIDENCE,
  LOW_CONFIDENCE,
  ROUNDS,
  drawRounds,
  judgeAttempt,
  learnedWordPool,
  sessionStars,
  usableTarget,
} from "./pronunciation";

describe("the verdict bands", () => {
  it("has sane thresholds (documented defaults)", () => {
    expect(HIGH_CONFIDENCE).toBe(0.85);
    expect(LOW_CONFIDENCE).toBe(0.6);
  });

  it("a match at or above HIGH is great (inclusive at HIGH)", () => {
    expect(judgeAttempt("hello", HIGH_CONFIDENCE, "hello", "en")).toBe("great");
    expect(judgeAttempt("hello", 0.99, "hello", "en")).toBe("great");
  });

  it("a match just under HIGH down to LOW is almost (inclusive at LOW)", () => {
    expect(judgeAttempt("hello", HIGH_CONFIDENCE - 0.01, "hello", "en")).toBe("almost");
    expect(judgeAttempt("hello", LOW_CONFIDENCE, "hello", "en")).toBe("almost");
  });

  it("a match under LOW is try again", () => {
    expect(judgeAttempt("hello", LOW_CONFIDENCE - 0.01, "hello", "en")).toBe("again");
    expect(judgeAttempt("hello", 0, "hello", "en")).toBe("again");
  });

  it("no match is try again even at full confidence", () => {
    expect(judgeAttempt("goodbye", 1, "hello", "en")).toBe("again");
    expect(judgeAttempt("", 1, "hello", "en")).toBe("again");
  });

  it("the band edges hold at the literal documented numbers", () => {
    expect(judgeAttempt("hello", 0.85, "hello", "en")).toBe("great");
    expect(judgeAttempt("hello", 0.84, "hello", "en")).toBe("almost");
    expect(judgeAttempt("hello", 0.6, "hello", "en")).toBe("almost");
    expect(judgeAttempt("hello", 0.59, "hello", "en")).toBe("again");
  });

  it("a match with no confidence value is great (nothing says it was unclear)", () => {
    expect(judgeAttempt("hello", null, "hello", "en")).toBe("great");
  });

  it("uses the per-course normaliser: an article before the word still matches, in Spanish", () => {
    expect(judgeAttempt("el abogado", 0.9, "abogado", "es")).toBe("great");
  });
});

describe("the learned-words pool", () => {
  const lessons = (course: "en" | "fr" | "es") =>
    getCourse(course).curriculum.flatMap((u) => u.lessons);
  const wordsOf = (id: string, course: "en" | "fr" | "es") =>
    deriveVocab(lessons(course).find((l) => l.id === id)!).map((i) => i.term);

  it("is empty before any lesson is completed", () => {
    expect(learnedWordPool("en", [])).toEqual([]);
  });

  it("contains words only from completed lessons: unlearned words never appear", () => {
    const [a, b] = lessons("en");
    const poolA = learnedWordPool("en", [a.id]).map((w) => w.term);
    const onlyB = wordsOf(b.id, "en").filter((t) => !wordsOf(a.id, "en").includes(t));
    expect(poolA.length).toBeGreaterThan(0);
    for (const t of onlyB) expect(poolA).not.toContain(t);
  });

  it("is LIVE: completing another lesson grows the pool on the next call, nothing cached", () => {
    const [a, b] = lessons("en");
    const before = learnedWordPool("en", [a.id]);
    const after = learnedWordPool("en", [a.id, b.id]);
    expect(after.length).toBeGreaterThan(before.length);
    // and shrinks back when the same list is asked again without b: no snapshot
    expect(learnedWordPool("en", [a.id]).length).toBe(before.length);
  });

  it("de-duplicates terms and works for every course", () => {
    for (const course of ["en", "fr", "es"] as const) {
      const ids = lessons(course)
        .slice(0, 6)
        .map((l) => l.id);
      const pool = learnedWordPool(course, ids);
      const keys = pool.map((w) => w.term.trim().toLowerCase());
      expect(new Set(keys).size).toBe(keys.length);
      expect(pool.every((w) => usableTarget(w.term, course))).toBe(true);
    }
  });
});

describe("usable targets", () => {
  it("excludes empty and long-phrase terms, keeps words", () => {
    expect(usableTarget("", "en")).toBe(false);
    expect(usableTarget("   ", "en")).toBe(false);
    expect(usableTarget("this is a much longer phrase", "en")).toBe(false);
    expect(usableTarget("window", "en")).toBe(true);
    expect(usableTarget("good morning", "en")).toBe(true);
  });
});

describe("session helpers", () => {
  it("draws up to ROUNDS distinct words", () => {
    const pool = Array.from({ length: 20 }, (_, i) => i);
    const d = drawRounds(pool);
    expect(d).toHaveLength(ROUNDS);
    expect(new Set(d).size).toBe(ROUNDS);
    expect(drawRounds([1, 2, 3])).toHaveLength(3);
  });

  it("stars never go below one", () => {
    expect(sessionStars(0, 8)).toBe(1);
    expect(sessionStars(4, 8)).toBe(2);
    expect(sessionStars(6, 8)).toBe(3);
    expect(sessionStars(0, 0)).toBe(1);
  });
});
