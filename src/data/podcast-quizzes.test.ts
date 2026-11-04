import { describe, expect, it } from "vitest";
import { isGrounded, support } from "./podcast-quiz-grounding";
import { PODCAST_QUIZZES, type PodcastQuiz } from "./podcast-quizzes";

/** The 16 episodes live on 2026-11-04: 10 English, 3 French, 3 Spanish. */
const LIVE: [PodcastQuiz["course"], string, string][] = [
  ["en", "a1", "ordering-coffee-v2"],
  ["en", "b1", "why-phones-are-addictive-v2"],
  ["en", "c1", "does-money-buy-happiness-v2"],
  ["en", "c1", "why-cant-we-focus-v2"],
  ["en", "c1", "why-time-feels-faster-v2"],
  ["en", "c1", "why-changing-minds-is-hard-v2"],
  ["en", "c1", "why-we-procrastinate-v2"],
  ["en", "c1", "why-everyone-looks-better-online-v2"],
  ["en", "mind-fools-you", "why-we-trust-our-gut-v2"],
  ["en", "why-we-love", "why-we-fall-for-the-same-type-v2"],
  ["fr", "a1", "au-cafe"],
  ["fr", "a2", "ma-journee"],
  ["fr", "b1", "chercher-un-appartement"],
  ["es", "a1", "en-la-cafeteria"],
  ["es", "a2", "mi-fin-de-semana"],
  ["es", "b1", "buscar-departamento"],
];

/** Same normalisation for the excerpt and the answer: case, curly quotes, spacing. */
export function norm(s: string): string {
  return s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
}

describe("podcast quiz data", () => {
  it("covers exactly the 16 live episodes, once each", () => {
    const keys = PODCAST_QUIZZES.map((x) => `${x.course}/${x.folder}/${x.slug}`).sort();
    expect(keys).toEqual(LIVE.map(([c, f, s]) => `${c}/${f}/${s}`).sort());
  });

  it.each(PODCAST_QUIZZES.map((x) => [x.slug, x] as const))("%s has a sound shape", (_n, quiz) => {
    expect(quiz.questions.length).toBeGreaterThanOrEqual(6);
    expect(quiz.questions.length).toBeLessThanOrEqual(7);
    expect(new Set(quiz.questions.map((x) => x.id)).size).toBe(quiz.questions.length);
    for (const question of quiz.questions) {
      expect(question.id).toMatch(/^q[1-9]$/);
      expect(question.prompt.trim().length).toBeGreaterThan(8);
      expect(question.choices.length).toBeGreaterThanOrEqual(3);
      expect(question.choices.length).toBeLessThanOrEqual(4);
      expect(new Set(question.choices.map(norm)).size).toBe(question.choices.length);
      expect(Number.isInteger(question.answerIndex)).toBe(true);
      expect(question.choices[question.answerIndex]).toBeDefined();
    }
  });

  it("does not always put the right answer in the same place", () => {
    for (const quiz of PODCAST_QUIZZES) {
      const spots = new Set(quiz.questions.map((x) => x.answerIndex));
      expect(spots.size, quiz.slug).toBeGreaterThanOrEqual(2);
    }
  });

  it("is answerable from the audio alone: no question points at the screen or the title", () => {
    for (const quiz of PODCAST_QUIZZES) {
      for (const question of quiz.questions) {
        expect(question.prompt, `${quiz.slug}/${question.id}`).not.toMatch(
          /\b(title|caption|on the screen|shown|image|picture|transcript)\b/i,
        );
      }
    }
  });

  it("writes the prompts in the episode's own language", () => {
    const frenchMarkers =
      /\b(le|la|les|il|elle|quel|quelle|que|qu'|est-il|a-t-elle|a-t-il|dans|combien|comment|quand|pourquoi)\b/i;
    const spanishMarkers = /(¿|\b(qué|cuál|cuánto|cómo|con quién|quién|cuándo|a qué|en la)\b)/i;
    for (const quiz of PODCAST_QUIZZES) {
      for (const question of quiz.questions) {
        const id = `${quiz.slug}/${question.id}`;
        if (quiz.course === "fr") expect(question.prompt, id).toMatch(frenchMarkers);
        if (quiz.course === "es") expect(question.prompt, id).toMatch(spanishMarkers);
        if (quiz.course === "en") expect(question.prompt, id).not.toMatch(/¿|\b(quel|quelle)\b/i);
      }
    }
  });
});

describe("podcast quiz grounding (against the checked-in transcript excerpts)", () => {
  const all = PODCAST_QUIZZES.flatMap((quiz) =>
    quiz.questions.map((question) => ({ quiz, question })),
  );

  it("every question carries a real excerpt", () => {
    for (const { quiz, question } of all) {
      expect(question.evidence.trim().length, `${quiz.slug}/${question.id}`).toBeGreaterThanOrEqual(
        15,
      );
    }
  });

  it("the excerpt supports the right answer strictly better than any wrong one", () => {
    for (const { quiz, question } of all) {
      const scores = question.choices.map((_, i) => support(question, i).toFixed(2)).join(" / ");
      expect(
        isGrounded(question),
        `${quiz.slug}/${question.id}: ${scores} (right is #${question.answerIndex})`,
      ).toBe(true);
    }
  });

  it("an answer-key swap to ANY wrong choice is caught (0 survivors)", () => {
    const survivors: string[] = [];
    let swaps = 0;
    for (const { quiz, question } of all) {
      question.choices.forEach((_, i) => {
        if (i === question.answerIndex) return;
        swaps++;
        if (isGrounded({ ...question, answerIndex: i }))
          survivors.push(`${quiz.slug}/${question.id}->#${i}`);
      });
    }
    expect(swaps).toBeGreaterThan(200);
    expect(survivors).toEqual([]);
  });
});
