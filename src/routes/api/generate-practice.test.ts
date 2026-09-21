import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const consumeQuota = vi.fn();
vi.mock("@/lib/ai-quota.server", () => ({ consumeQuota }));

const { Route } = await import("./generate-practice");
const handler = (
  Route.options.server!.handlers as unknown as {
    POST: (opts: { request: Request }) => Promise<Response>;
  }
).POST;

function req(body: unknown) {
  return new Request("https://example.com/api/generate-practice", {
    method: "POST",
    headers: { Authorization: "Bearer aaa.bbb.ccc" },
    body: JSON.stringify(body),
  });
}

const QUESTION_JSON = JSON.stringify([
  {
    prompt: "He ___ to work every day.",
    choices: ["drive", "drives", "drove", "driven"],
    answerIndex: 1,
    explanation: "Third-person singular present takes 'drives'.",
  },
]);

const originalFetch = global.fetch;

beforeEach(() => {
  consumeQuota.mockReset();
  consumeQuota.mockResolvedValue({ ok: true, used: 1, limit: 60 });
  process.env.NVIDIA_API_KEY = "test-key";
  global.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ choices: [{ message: { content: QUESTION_JSON } }] }), {
      status: 200,
    }),
  );
});

afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.NVIDIA_CHAT_MODEL;
});

describe("POST /api/generate-practice", () => {
  it("returns 500 when NVIDIA_API_KEY is not configured", async () => {
    delete process.env.NVIDIA_API_KEY;
    const res = await handler({ request: req({ lessonId: "u1l1", course: "en" }) });
    expect(res.status).toBe(500);
  });

  it("rejects when the quota check fails", async () => {
    consumeQuota.mockResolvedValue({ ok: false, status: 429, message: "slow down" });
    const res = await handler({ request: req({ lessonId: "u1l1", course: "en" }) });
    expect(res.status).toBe(429);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown lesson id", async () => {
    const res = await handler({ request: req({ lessonId: "does-not-exist", course: "en" }) });
    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns 400 for a missing lessonId", async () => {
    const res = await handler({ request: req({ course: "en" }) });
    expect(res.status).toBe(400);
  });

  it("generates practice questions from a real lesson's own questions as examples", async () => {
    const res = await handler({ request: req({ lessonId: "u1l1", course: "en" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      questions: [
        {
          prompt: "He ___ to work every day.",
          choices: ["drive", "drives", "drove", "driven"],
          answerIndex: 1,
          explanation: "Third-person singular present takes 'drives'.",
        },
      ],
    });
    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { body: string },
    ];
    const sentBody = JSON.parse(options.body) as { messages: { content: string }[] };
    expect(sentBody.messages[0].content).toContain("Saying Hello"); // u1l1's title
  });

  it("defaults to the English course when none is given", async () => {
    const res = await handler({ request: req({ lessonId: "u1l1" }) });
    expect(res.status).toBe(200);
  });

  it("returns an empty questions array when the model's response isn't valid JSON", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "not json" } }] }), {
        status: 200,
      }),
    );
    const res = await handler({ request: req({ lessonId: "u1l1", course: "en" }) });
    expect(await res.json()).toEqual({ questions: [] });
  });
});
