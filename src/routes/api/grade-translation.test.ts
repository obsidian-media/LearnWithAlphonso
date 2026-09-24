import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const consumeQuota = vi.fn();
vi.mock("@/lib/ai-quota.server", () => ({ consumeQuota }));

const { Route } = await import("./grade-translation");
const handler = (
  Route.options.server!.handlers as unknown as {
    POST: (opts: { request: Request }) => Promise<Response>;
  }
).POST;

// The first question of the A1 translate pack: "Greet someone in the morning."
// accepting "Good morning." / "Morning." / "Good morning to you."
const LESSON_ID = "a1p25l1";
const QUESTION_ID = "a1p25q0";

function req(body: unknown) {
  return new Request("https://example.com/api/grade-translation", {
    method: "POST",
    headers: { Authorization: "Bearer aaa.bbb.ccc" },
    body: JSON.stringify(body),
  });
}

function post(overrides: Record<string, unknown> = {}) {
  return handler({
    request: req({
      lessonId: LESSON_ID,
      questionId: QUESTION_ID,
      submission: "Good morning.",
      course: "en",
      ...overrides,
    }),
  });
}

const originalFetch = global.fetch;

beforeEach(() => {
  consumeQuota.mockReset();
  consumeQuota.mockResolvedValue({ ok: true, used: 1, limit: 60 });
  process.env.NVIDIA_API_KEY = "test-key";
  global.fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"correct": true, "reason": "Same meaning."}' } }],
      }),
      { status: 200 },
    ),
  );
});

afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.NVIDIA_API_KEY;
});

describe("POST /api/grade-translation", () => {
  it("answers from the curated list without spending quota or calling the model", async () => {
    const res = await post({ submission: "good morning" });
    expect(await res.json()).toMatchObject({ correct: true, source: "local" });
    expect(consumeQuota).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("asks the model only about a submission the list rejected", async () => {
    const res = await post({ submission: "morning to you all" });
    expect(await res.json()).toMatchObject({
      correct: true,
      source: "ai",
      reason: "Same meaning.",
    });
    expect(consumeQuota).toHaveBeenCalledWith(expect.anything(), "translate");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the local verdict when the AI grader is not configured", async () => {
    // A learner must not be marked wrong because a vendor key is missing, and
    // erroring would strand them on a question they cannot get past -- lesson
    // completion needs an answer for every question.
    delete process.env.NVIDIA_API_KEY;
    const res = await post({ submission: "morning to you all" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ correct: false, source: "local" });
  });

  it("keeps the local verdict when quota is exhausted", async () => {
    consumeQuota.mockResolvedValue({ ok: false, status: 429, message: "Daily limit reached" });
    const res = await post({ submission: "morning to you all" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ correct: false, source: "local" });
  });

  it("keeps the local verdict when the model output cannot be read", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "who can say" } }] }), {
        status: 200,
      }),
    );
    const res = await post({ submission: "morning to you all" });
    expect(await res.json()).toMatchObject({ correct: false, source: "local" });
  });

  it("does not trust an acceptableAnswers list sent by the client", async () => {
    // The question is resolved from server-side content by id. If this were
    // trusted, any answer could be made correct from the browser.
    const res = await post({
      submission: "completely wrong",
      acceptableAnswers: ["completely wrong"],
    });
    const body = await res.json();
    expect(body.source).toBe("ai");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects an empty submission instead of grading it", async () => {
    const res = await post({ submission: "   " });
    expect(res.status).toBe(400);
    expect(consumeQuota).not.toHaveBeenCalled();
  });

  it("rejects an unknown question", async () => {
    const res = await post({ questionId: "nope" });
    expect(res.status).toBe(400);
  });

  it("rejects a question that is not a translation", async () => {
    const res = await post({ lessonId: "u1l1", questionId: "q1", submission: "Good morning." });
    expect(res.status).toBe(400);
  });
});
