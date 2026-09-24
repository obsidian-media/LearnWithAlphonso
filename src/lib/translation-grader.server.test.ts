import { afterEach, describe, expect, it, vi } from "vitest";
import { gradeTranslationWithAi } from "./translation-grader.server";

const ARGS = {
  prompt: "Say you do not understand.",
  acceptableAnswers: ["I do not understand.", "I don't understand."],
  submission: "I really do not follow you",
  apiKey: "test-key",
  model: "test-model",
};

function stubResponse(content: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content } }] }),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("gradeTranslationWithAi", () => {
  it("reads a well-formed verdict", async () => {
    stubResponse('{"correct": true, "reason": "Same meaning, natural wording."}');
    expect(await gradeTranslationWithAi(ARGS)).toEqual({
      correct: true,
      reason: "Same meaning, natural wording.",
    });
  });

  it("reads a verdict wrapped in the prose models like to add", async () => {
    stubResponse(
      'Sure! Here is my assessment:\n```json\n{"correct": false, "reason": "Different meaning."}\n```',
    );
    expect(await gradeTranslationWithAi(ARGS)).toEqual({
      correct: false,
      reason: "Different meaning.",
    });
  });

  it("returns null rather than false when the output cannot be parsed", async () => {
    // Anything unparseable means "no AI opinion", so the caller keeps its local
    // verdict. Reading prose as a verdict would mark correct answers wrong --
    // and the learner would have no idea why.
    stubResponse("Well, it depends on what you mean!");
    expect(await gradeTranslationWithAi(ARGS)).toBeNull();
  });

  it("returns null when the verdict has the wrong shape", async () => {
    stubResponse('{"correct": "yes", "reason": "hmm"}');
    expect(await gradeTranslationWithAi(ARGS)).toBeNull();
  });

  it("returns null when the model call fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    );
    expect(await gradeTranslationWithAi(ARGS)).toBeNull();
  });

  it("returns null rather than throwing when the network is gone", async () => {
    // This function must never reject: a rejection at the call site would
    // surface to the learner as a wrong answer.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(await gradeTranslationWithAi(ARGS)).toBeNull();
  });
});
