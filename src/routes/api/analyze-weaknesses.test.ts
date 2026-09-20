import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const consumeQuota = vi.fn();
vi.mock("@/lib/ai-quota.server", () => ({ consumeQuota }));

const getClaims = vi.fn();
const supabaseSelectChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
};
const supabaseFrom = vi.fn(() => supabaseSelectChain);
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getClaims }, from: supabaseFrom }),
}));

const supabaseAdminInsert = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ insert: supabaseAdminInsert }) },
}));

const { Route } = await import("./analyze-weaknesses");
const handler = (
  Route.options.server!.handlers as unknown as {
    POST: (opts: { request: Request }) => Promise<Response>;
  }
).POST;

function req(body: unknown, authorization = "Bearer aaa.bbb.ccc") {
  return new Request("https://example.com/api/analyze-weaknesses", {
    method: "POST",
    headers: { Authorization: authorization },
    body: JSON.stringify(body),
  });
}

const WEAKNESS_JSON = JSON.stringify([
  {
    label: "past-tense",
    display: "Past-tense verbs",
    prompt: "She ___ to the store yesterday.",
    choices: ["go", "goes", "went", "gone"],
    answerIndex: 2,
    explanation: "Past tense of 'go' is 'went'.",
  },
]);

const originalFetch = global.fetch;

beforeEach(() => {
  consumeQuota.mockReset();
  consumeQuota.mockResolvedValue({ ok: true, used: 1, limit: 60 });
  getClaims.mockReset();
  getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
  supabaseSelectChain.maybeSingle.mockReset();
  supabaseSelectChain.maybeSingle.mockResolvedValue({ data: null });
  supabaseFrom.mockClear();
  supabaseAdminInsert.mockReset();
  supabaseAdminInsert.mockResolvedValue({ error: null });
  process.env.NVIDIA_API_KEY = "test-key";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  global.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ choices: [{ message: { content: WEAKNESS_JSON } }] }), {
      status: 200,
    }),
  );
});

afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.NVIDIA_CHAT_MODEL;
});

describe("POST /api/analyze-weaknesses", () => {
  it("returns 500 when NVIDIA_API_KEY is not configured", async () => {
    delete process.env.NVIDIA_API_KEY;
    const res = await handler({ request: req({ messages: [{ role: "user", content: "hi" }] }) });
    expect(res.status).toBe(500);
  });

  it("returns weaknessesDetected: 0 for an empty message history without calling NVIDIA", async () => {
    const res = await handler({ request: req({ messages: [] }) });
    expect(await res.json()).toEqual({ weaknessesDetected: 0 });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("inserts a real user_id -- the bug this test suite exists to catch", async () => {
    const res = await handler({
      request: req({ messages: [{ role: "user", content: "I go to the park yesterday." }] }),
    });
    expect(await res.json()).toEqual({ weaknessesDetected: 1 });
    expect(supabaseAdminInsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", weakness_label: "past-tense" }),
    );
  });

  it("rejects when the token doesn't resolve to a real user", async () => {
    getClaims.mockResolvedValue({ data: null, error: new Error("invalid") });
    const res = await handler({
      request: req({ messages: [{ role: "user", content: "I go to the park yesterday." }] }),
    });
    expect(res.status).toBe(401);
    expect(supabaseAdminInsert).not.toHaveBeenCalled();
  });

  it("skips a category that's already an active weakness for this user", async () => {
    supabaseSelectChain.maybeSingle.mockResolvedValue({ data: { item_key: "weakness:existing" } });
    const res = await handler({
      request: req({ messages: [{ role: "user", content: "I go to the park yesterday." }] }),
    });
    expect(await res.json()).toEqual({ weaknessesDetected: 0 });
    expect(supabaseAdminInsert).not.toHaveBeenCalled();
  });

  it("returns weaknessesDetected: 0 when the model finds nothing worth flagging", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "[]" } }] }), {
        status: 200,
      }),
    );
    const res = await handler({
      request: req({ messages: [{ role: "user", content: "Hello!" }] }),
    });
    expect(await res.json()).toEqual({ weaknessesDetected: 0 });
    expect(supabaseAdminInsert).not.toHaveBeenCalled();
  });

  it("returns weaknessesDetected: 0 when the model's response isn't valid JSON", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "not json at all" } }] }), {
        status: 200,
      }),
    );
    const res = await handler({
      request: req({ messages: [{ role: "user", content: "Hello!" }] }),
    });
    expect(await res.json()).toEqual({ weaknessesDetected: 0 });
  });
});
