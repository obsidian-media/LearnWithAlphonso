import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SAFETY_PREAMBLE } from "./ai-safety";

type Sent = { messages: { role: string; content: string }[] };
let sent: Sent[] = [];
const realFetch = global.fetch;

beforeEach(() => {
  sent = [];
  global.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)) as Sent);
    return new Response(
      JSON.stringify({ choices: [{ message: { content: '{"correct": true, "reason": "ok"}' } }] }),
      { status: 200 },
    );
  }) as typeof fetch;
});
afterEach(() => {
  global.fetch = realFetch;
});

function expectSafe(label: string) {
  expect(sent.length, label).toBeGreaterThan(0);
  for (const body of sent) {
    expect(body.messages[0].role, label).toBe("system");
    expect(body.messages[0].content.endsWith(SAFETY_PREAMBLE), label).toBe(true);
    expect(
      body.messages.filter((m) => m.role === "system"),
      label,
    ).toHaveLength(1);
  }
}

describe("every model prompt path carries the safety preamble", () => {
  it("translation grading", async () => {
    const { gradeTranslationWithAi } = await import("./translation-grader.server");
    await gradeTranslationWithAi({
      prompt: "Say hello.",
      acceptableAnswers: ["Hello."],
      submission: "Hi there",
      apiKey: "k",
      model: "m",
    });
    expectSafe("grade-translation");
  });

  it("define-word", async () => {
    const { defineWord } = await import("./saved-word.server");
    await defineWord({
      input: { word: "tea", sentence: "I want tea.", course: "en" },
      apiKey: "k",
      model: "m",
    });
    expectSafe("define-word");
  });

  it("practice generation", async () => {
    const { generatePracticeQuestions } = await import("./practice-generation.server");
    await generatePracticeQuestions({
      topic: "greetings",
      sampleQuestions: [{ prompt: "Hi", answer: "Hello" }],
      nvidiaApiKey: "k",
      nvidiaModel: "m",
    });
    expectSafe("generate-practice");
  });

  it("weakness detection (conversations and lesson mistakes)", async () => {
    const { detectAndRecordWeaknesses } = await import("./weakness-detection.server");
    await detectAndRecordWeaknesses({
      userId: "u1",
      sourceDescription: "English-learner conversation",
      transcriptMessages: [{ role: "user", content: "I goed home" }],
      nvidiaApiKey: "k",
      nvidiaModel: "m",
      course: "en",
      outputCheck: async (t) => t.map(() => false),
      dedupCheck: async () => false,
      adminInsertReviewItem: async () => true,
      adminInsertEvent: async () => {},
    });
    expectSafe("analyze-weaknesses");
  });

  it("vocab proposal and pack drafting (authoring tools)", async () => {
    const { proposeVocabCandidates } = await import("./generative-vocab.server");
    await proposeVocabCandidates({
      topic: "food",
      posTypes: ["noun"],
      nvidiaApiKey: "k",
      nvidiaModel: "m",
    });
    expectSafe("generative-vocab");
    sent = [];
    const { draftPack } = await import("./pack-draft-generation.server");
    await draftPack({
      topic: "food",
      targetLanguage: "fr",
      kind: "pair",
      lineCount: 2,
      nvidiaApiKey: "k",
      nvidiaModel: "m",
    }).catch(() => undefined);
    expectSafe("pack-draft");
    // Importing the vocab module loads the NLP library, which is slow on a cold run.
  }, 30_000);
});
