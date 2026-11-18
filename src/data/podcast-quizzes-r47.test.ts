import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPodcastQuizSeedSql } from "../lib/podcast-quiz-seed";
import { isGrounded, normText, support } from "./podcast-quiz-grounding";
import { PODCAST_QUIZZES, PODCAST_QUIZZES_R47 } from "./podcast-quizzes";

const FIVE = [
  "en/c1/why-we-dread-small-talk",
  "en/b1/asking-for-directions",
  "en/a2/taking-the-train",
  "fr/b1/rendre-un-article",
  "es/b1/un-paquete-que-no-llego",
];

describe("round 47 podcast quizzes (five drafted episodes, not yet published)", () => {
  it("covers exactly the five drafted episodes and none of the live ones", () => {
    const keys = PODCAST_QUIZZES_R47.map((x) => `${x.course}/${x.folder}/${x.slug}`).sort();
    expect(keys).toEqual([...FIVE].sort());
    const live = new Set(PODCAST_QUIZZES.map((x) => x.slug));
    for (const quiz of PODCAST_QUIZZES_R47) expect(live.has(quiz.slug), quiz.slug).toBe(false);
  });

  it.each(PODCAST_QUIZZES_R47.map((x) => [x.slug, x] as const))(
    "%s has a sound shape",
    (_n, quiz) => {
      expect(quiz.questions.length).toBeGreaterThanOrEqual(6);
      expect(quiz.questions.length).toBeLessThanOrEqual(7);
      expect(new Set(quiz.questions.map((x) => x.id)).size).toBe(quiz.questions.length);
      expect(new Set(quiz.questions.map((x) => x.answerIndex)).size).toBeGreaterThanOrEqual(2);
      for (const question of quiz.questions) {
        expect(question.id).toMatch(/^q[1-9]$/);
        expect(question.choices.length).toBeGreaterThanOrEqual(3);
        expect(question.choices.length).toBeLessThanOrEqual(4);
        expect(new Set(question.choices.map(normText)).size).toBe(question.choices.length);
        expect(question.choices[question.answerIndex]).toBeDefined();
        expect(question.evidence.trim().length).toBeGreaterThanOrEqual(15);
        expect(question.prompt).not.toMatch(
          /\b(title|caption|on the screen|shown|image|picture|transcript)\b/i,
        );
      }
    },
  );

  it("writes each prompt in the episode's own language", () => {
    for (const quiz of PODCAST_QUIZZES_R47) {
      for (const question of quiz.questions) {
        const id = `${quiz.slug}/${question.id}`;
        if (quiz.course === "fr")
          expect(question.prompt, id).toMatch(
            /\b(le|la|les|il|elle|quel|quelle|que|qu'|combien|comment|pourquoi)\b/i,
          );
        if (quiz.course === "es") expect(question.prompt, id).toMatch(/¿/);
        if (quiz.course === "en") expect(question.prompt, id).not.toMatch(/¿|\b(quel|quelle)\b/i);
      }
    }
  });

  it("the excerpt supports the right answer strictly better than any wrong one", () => {
    for (const quiz of PODCAST_QUIZZES_R47) {
      for (const question of quiz.questions) {
        const scores = question.choices.map((_, i) => support(question, i).toFixed(2)).join(" / ");
        expect(isGrounded(question), `${quiz.slug}/${question.id}: ${scores}`).toBe(true);
      }
    }
  });

  it("an answer-key swap to ANY wrong choice is caught (0 survivors)", () => {
    const survivors: string[] = [];
    let swaps = 0;
    for (const quiz of PODCAST_QUIZZES_R47) {
      for (const question of quiz.questions) {
        question.choices.forEach((_, i) => {
          if (i === question.answerIndex) return;
          swaps++;
          if (isGrounded({ ...question, answerIndex: i }))
            survivors.push(`${quiz.slug}/${question.id}->#${i}`);
        });
      }
    }
    expect(swaps).toBeGreaterThan(60);
    expect(survivors).toEqual([]);
  });

  it("its seed migration is exactly what the generator builds, version-ordered after the live seed", () => {
    const dir = path.join(process.cwd(), "supabase/migrations");
    const file = "20261121110000_podcast_quiz_seed_r47.sql";
    expect(readFileSync(path.join(dir, file), "utf8")).toBe(
      buildPodcastQuizSeedSql(PODCAST_QUIZZES_R47),
    );
    expect(file > "20261112140000_podcast_quiz_review.sql").toBe(true);
  });

  it("never ships a transcript excerpt in the seed", () => {
    const sql = buildPodcastQuizSeedSql(PODCAST_QUIZZES_R47);
    for (const quiz of PODCAST_QUIZZES_R47)
      for (const question of quiz.questions) expect(sql).not.toContain(question.evidence);
  });
});
