import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generatePracticeQuestions,
  parsePracticeQuestions,
  PRACTICE_ATTEMPT_TIMEOUT_MS,
  PRACTICE_MAX_ATTEMPTS,
  practicePrompt,
} from "./practice-generation.server";

const QUESTION = {
  prompt: "She ___ to school every day.",
  choices: ["go", "goes", "went", "gone"],
  answerIndex: 1,
  explanation: "Third-person singular present takes 'goes'.",
};

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify([QUESTION]) } }] }),
      {
        status: 200,
      },
    ),
  );
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("parsePracticeQuestions", () => {
  it("parses a well-formed JSON array", () => {
    expect(parsePracticeQuestions(JSON.stringify([QUESTION]))).toEqual([QUESTION]);
  });

  it("strips markdown code fences before parsing", () => {
    expect(parsePracticeQuestions("```json\n" + JSON.stringify([QUESTION]) + "\n```")).toEqual([
      QUESTION,
    ]);
  });

  it("returns an empty array for invalid JSON", () => {
    expect(parsePracticeQuestions("not json")).toEqual([]);
  });

  it("returns an empty array when the shape doesn't match the schema", () => {
    expect(parsePracticeQuestions(JSON.stringify([{ prompt: "no choices here" }]))).toEqual([]);
  });

  it("caps at 5 questions", () => {
    const many = Array.from({ length: 8 }, () => QUESTION);
    expect(parsePracticeQuestions(JSON.stringify(many))).toEqual([]);
  });
});

describe("practicePrompt", () => {
  it("includes the topic and every sample question's prompt and answer", () => {
    const prompt = practicePrompt("Present tense verbs", [
      { prompt: "He ___ coffee.", answer: "drinks" },
    ]);
    expect(prompt).toContain("Present tense verbs");
    expect(prompt).toContain("He ___ coffee.");
    expect(prompt).toContain("drinks");
  });
});

describe("generatePracticeQuestions", () => {
  function params(overrides: Partial<Parameters<typeof generatePracticeQuestions>[0]> = {}) {
    return {
      topic: "Present tense verbs",
      sampleQuestions: [{ prompt: "He ___ coffee.", answer: "drinks" }],
      nvidiaApiKey: "test-key",
      nvidiaModel: "test-model",
      ...overrides,
    };
  }

  it("returns the parsed questions on success", async () => {
    const result = await generatePracticeQuestions(params());
    expect(result).toEqual([QUESTION]);
  });

  it("returns an empty array without calling NVIDIA when there are no sample questions", async () => {
    const result = await generatePracticeQuestions(params({ sampleQuestions: [] }));
    expect(result).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns an empty array when the upstream call fails", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("error", { status: 500 }));
    const result = await generatePracticeQuestions(params());
    expect(result).toEqual([]);
  });

  it("returns an empty array when fetch itself throws", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await generatePracticeQuestions(params());
    expect(result).toEqual([]);
  });

  // TestFlight feedback (2026-09-29): "after 30 seconds, error, something
  // went wrong." Real Vercel logs showed this route always returning 200
  // -- these two guard the fix that shipped for it: a bounded max_tokens
  // (unbounded completion length is unbounded latency risk) and a real
  // fetch timeout so a stuck upstream call fails fast instead of running
  // out the clock silently.
  it("caps the completion length with max_tokens", async () => {
    await generatePracticeQuestions(params());
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.max_tokens).toBe(1200);
  });

  it("returns an empty array (not a throw) when the request times out", async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"));
    const result = await generatePracticeQuestions(params());
    expect(result).toEqual([]);
  });

  it("retries once after a failed attempt and returns the second attempt's questions", async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ message: { content: JSON.stringify([QUESTION]) } }] }),
          { status: 200 },
        ),
      );
    const out = await generatePracticeQuestions(params());
    expect(out).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("makes at most PRACTICE_MAX_ATTEMPTS calls, each with the short timeout", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    global.fetch = vi.fn().mockResolvedValue(new Response("", { status: 500 }));
    expect(await generatePracticeQuestions(params())).toEqual([]);
    expect(global.fetch).toHaveBeenCalledTimes(PRACTICE_MAX_ATTEMPTS);
    expect(timeoutSpy).toHaveBeenCalledWith(PRACTICE_ATTEMPT_TIMEOUT_MS);
    timeoutSpy.mockRestore();
  });

  it("drops duplicate choices from the model output", async () => {
    const dup = JSON.stringify([
      { prompt: "p", choices: ["go", "Go", "went", "gone"], answerIndex: 2, explanation: "e" },
    ]);
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: dup } }] }), { status: 200 }),
      );
    expect(await generatePracticeQuestions(params())).toEqual([
      { prompt: "p", choices: ["go", "went", "gone"], answerIndex: 1, explanation: "e" },
    ]);
  });
});
