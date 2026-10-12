import { beforeEach, expect, it, vi } from "vitest";
import { chainable } from "./__testutils__/supabase-mock";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
vi.stubGlobal("Deno", { env: { get: () => "test-only" }, serve: () => {} });

// Keep the Deno entrypoint out of the web tsconfig's module graph; Vitest still loads it at runtime.
const denoHandlerPath = "../../supabase/functions/grade-review/index";
const { handleRequest } = await import(denoHandlerPath);

const row = {
  source: "saved_word",
  choices: ["correct", "wrong"],
  answer_index: 0,
  due_on: "2026-01-01",
  created_at: "2026-01-01T00:00:00Z",
  last_reviewed_at: null,
  ease: 2.3,
  interval_days: 0,
  repetitions: 0,
  lapses: 0,
};

function request(attemptId?: string): Request {
  return new Request("https://example.invalid/grade-review", {
    method: "POST",
    headers: { Authorization: "Bearer test.fake.token", "Content-Type": "application/json" },
    body: JSON.stringify({ itemKey: "saved:word1", answer: "correct", course: "en", attemptId }),
  });
}

beforeEach(() => {
  createClient.mockReset();
  createClient.mockReturnValueOnce({
    auth: { getClaims: async () => ({ data: { claims: { sub: "test-user" } }, error: null }) },
  });
});

it("returns a retryable failure when the review row read fails", async () => {
  createClient.mockReturnValueOnce({
    from: () => chainable({ data: null, error: { message: "read unavailable" } }),
  });
  expect((await handleRequest(request())).status).toBe(503);
});

it("does not acknowledge a failed review update", async () => {
  const from = vi.fn().mockReturnValueOnce(chainable({ data: row, error: null }));
  const rpc = vi.fn(async () => ({ data: null, error: { message: "write unavailable" } }));
  createClient.mockReturnValueOnce({ from, rpc });
  expect((await handleRequest(request())).status).toBe(503);
  expect(rpc).toHaveBeenCalledWith(
    "apply_review_grade",
    expect.objectContaining({ _user_id: "test-user" }),
  );
});

it("uses the atomic transition and acknowledges a saved grade only after it succeeds", async () => {
  const from = vi.fn().mockReturnValueOnce(chainable({ data: row, error: null }));
  const rpc = vi.fn(async () => ({
    data: { status: "applied", retired: false, dueOn: "2026-01-02", correct: true },
    error: null,
  }));
  createClient.mockReturnValueOnce({ from, rpc });
  const response = await handleRequest(request());
  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith(
    "apply_review_grade",
    expect.objectContaining({ _item_key: "saved:word1", _correct: true }),
  );
});

it("replays a previously committed queued attempt without re-grading", async () => {
  const result = { status: "applied", retired: true, dueOn: "2026-01-01", correct: true };
  const from = vi.fn().mockReturnValueOnce(
    chainable({
      data: { result, item_key: "saved:word1", language: "en" },
      error: null,
    }),
  );
  const rpc = vi.fn();
  createClient.mockReturnValueOnce({ from, rpc });
  const response = await handleRequest(request("saved:word1|en|123"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ retired: true, dueOn: "2026-01-01", correct: true });
  expect(rpc).not.toHaveBeenCalled();
});

it("finds a receipt that committed between the first lookup and the row read", async () => {
  const result = { status: "applied", retired: true, dueOn: "2026-01-01", correct: true };
  const from = vi
    .fn()
    .mockReturnValueOnce(chainable({ data: null, error: null }))
    .mockReturnValueOnce(chainable({ data: null, error: null }))
    .mockReturnValueOnce(
      chainable({ data: { result, item_key: "saved:word1", language: "en" }, error: null }),
    );
  const rpc = vi.fn();
  createClient.mockReturnValueOnce({ from, rpc });
  const response = await handleRequest(request("saved:word1|en|123"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ retired: true, dueOn: "2026-01-01", correct: true });
  expect(rpc).not.toHaveBeenCalled();
});

async function statusFor(transition: Record<string, unknown>) {
  const from = vi.fn().mockReturnValueOnce(chainable({ data: row, error: null }));
  const rpc = vi.fn(async () => ({ data: transition, error: null }));
  createClient.mockReturnValueOnce({ from, rpc });
  return (await handleRequest(request())).status;
}

it("asks the app to retry when the database refused the grade as stale", async () => {
  // 5xx: the app keeps the queued grade and tries again. A 4xx would drop it.
  expect(await statusFor({ status: "conflict" })).toBe(503);
});

it("rejects, without a retry, a grade for an item that is no longer due", async () => {
  expect(await statusFor({ status: "not_due" })).toBe(400);
});

it("does not acknowledge a transition it does not recognise", async () => {
  expect(await statusFor({ status: "surprise" })).toBe(503);
});

it("sends the queued attempt id and the row it graded from to the database", async () => {
  const from = vi
    .fn()
    .mockReturnValueOnce(chainable({ data: null, error: null }))
    .mockReturnValueOnce(chainable({ data: row, error: null }));
  const rpc = vi.fn(async () => ({
    data: { status: "applied", retired: false, dueOn: "2026-01-02", correct: true },
    error: null,
  }));
  createClient.mockReturnValueOnce({ from, rpc });
  const response = await handleRequest(request("saved:word1|en|123"));
  expect(await response.json()).toEqual({ retired: false, dueOn: "2026-01-02", correct: true });
  expect(rpc).toHaveBeenCalledWith(
    "apply_review_grade",
    expect.objectContaining({
      _attempt_id: "saved:word1|en|123",
      _expected_due_on: row.due_on,
      _expected_last_reviewed_at: null,
    }),
  );
});

it("refuses an attempt id that was already used for a different item", async () => {
  const from = vi.fn().mockReturnValueOnce(
    chainable({
      data: { result: { status: "applied" }, item_key: "saved:other", language: "en" },
      error: null,
    }),
  );
  const rpc = vi.fn();
  createClient.mockReturnValueOnce({ from, rpc });
  expect((await handleRequest(request("saved:word1|en|123"))).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
