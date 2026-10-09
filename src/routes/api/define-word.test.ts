import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chainable } from "@/lib/__testutils__/supabase-mock";

const getUser = vi.fn();
const from = vi.fn();
const blockedRpc = vi.fn(async (_fn: string, args: { _texts: string[] }) => ({
  data: args._texts.map(() => false),
  error: null,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { auth: { getUser }, from, rpc: blockedRpc },
}));

const requireAiConsent = vi.fn();
vi.mock("@/lib/ai-consent.server", () => ({ requireAiConsent }));

const consumeQuota = vi.fn();
vi.mock("@/lib/ai-quota.server", () => ({ consumeQuota }));

const { Route } = await import("./define-word");
const handler = (
  Route.options.server!.handlers as unknown as {
    POST: (opts: { request: Request }) => Promise<Response>;
  }
).POST;

const body = { word: "serendipity", sentence: "It was pure serendipity.", course: "en" };

function req(b: unknown = body, authorization = "Bearer token-123") {
  return new Request("https://example.com/api/define-word", {
    method: "POST",
    headers: {
      ...(authorization ? { Authorization: authorization } : {}),
      "Content-Type": "application/json",
    },
    body: typeof b === "string" ? b : JSON.stringify(b),
  });
}

const modelOk = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          meaning: "a happy accident",
          translation: "a lucky find",
          wrong: ["a sad ending", "a long journey", "a loud noise"],
        }),
      },
    },
  ],
};

const realFetch = globalThis.fetch;
const modelFetch = (res: Response) => (globalThis.fetch = vi.fn(async () => res) as never);

/** Queue the review_items reads/writes in the order the route makes them. */
function queue(...results: unknown[]) {
  from.mockReset();
  for (const r of results) from.mockReturnValueOnce(chainable(r));
}
const NO_ROW = { data: null, error: null };
const COUNT = (n: number) => ({ count: n, error: null });
const INSERT_OK = { error: null };

beforeEach(() => {
  getUser.mockReset();
  consumeQuota.mockReset();
  requireAiConsent.mockReset();
  requireAiConsent.mockResolvedValue(null);
  blockedRpc.mockClear();
  process.env.NVIDIA_API_KEY = "nv_test";
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  consumeQuota.mockResolvedValue({ ok: true, used: 1, limit: 40 });
  queue(NO_ROW, COUNT(0), INSERT_OK);
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("POST /api/define-word", () => {
  it("returns 500 when NVIDIA is not configured, before touching anything", async () => {
    delete process.env.NVIDIA_API_KEY;
    const res = await handler({ request: req() });
    expect(res.status).toBe(500);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("rejects a missing Authorization header (401)", async () => {
    const res = await handler({ request: req(body, "") });
    expect(res.status).toBe(401);
  });

  it("rejects an invalid token (401)", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error("bad") });
    expect((await handler({ request: req() })).status).toBe(401);
  });

  it.each([
    ["malformed JSON", "{nope"],
    ["a multi-word 'word'", { ...body, word: "two words" }],
    ["a sentence without the word", { ...body, sentence: "Nothing here." }],
    ["an unknown course", { ...body, course: "de" }],
  ])("returns 400 for %s, before any quota or AI call", async (_n, b) => {
    const fetchSpy = modelFetch(new Response("{}"));
    const res = await handler({ request: req(b) });
    expect(res.status).toBe(400);
    expect(consumeQuota).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("saves a new word: calls the model once, inserts a self-contained saved_word row, returns the explanation", async () => {
    const fetchSpy = modelFetch(new Response(JSON.stringify(modelOk), { status: 200 }));
    const insert = chainable(INSERT_OK);
    from.mockReset();
    from
      .mockReturnValueOnce(chainable(NO_ROW))
      .mockReturnValueOnce(chainable(COUNT(3)))
      .mockReturnValueOnce(insert);

    const res = await handler({ request: req() });
    expect(res.status).toBe(200);
    const out = (await res.json()) as Record<string, unknown>;
    expect(out).toMatchObject({
      alreadySaved: false,
      word: "serendipity",
      sentence: "It was pure serendipity.",
    });
    expect(out.explanation).toBe('"serendipity" means a happy accident. (a lucky find)');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(consumeQuota).toHaveBeenCalledWith(expect.any(Request), "define");

    const row = insert.calls.find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(row).toMatchObject({
      user_id: "user-1",
      lesson_id: "savedword",
      level: "A1",
      language: "en",
      source: "saved_word",
      saved_word: "serendipity",
      saved_context: "It was pure serendipity.",
      ease: 2.5,
      interval_days: 0,
      repetitions: 0,
    });
    expect(String(row.item_key)).toMatch(/^savedword:[0-9a-f]{16}$/);
    const choices = row.choices as string[];
    expect(choices).toHaveLength(4);
    expect(choices[row.answer_index as number]).toBe("a happy accident");
    // First review is tomorrow, not immediately after reading the meaning.
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    expect(row.due_on).toBe(tomorrow);
  });

  it("returns an already-saved word for free: no count, no quota, no model call", async () => {
    const fetchSpy = modelFetch(new Response("{}"));
    queue({
      data: {
        saved_word: "serendipity",
        saved_context: "It was pure serendipity.",
        explanation: "stored",
      },
      error: null,
    });
    const res = await handler({ request: req() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      alreadySaved: true,
      word: "serendipity",
      sentence: "It was pure serendipity.",
      explanation: "stored",
    });
    expect(consumeQuota).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("still returns an already-saved word when the learner is over their daily quota", async () => {
    consumeQuota.mockResolvedValue({
      ok: false,
      status: 429,
      message: "Daily DEFINE limit reached",
    });
    queue({ data: { saved_word: "w", saved_context: "w", explanation: "stored" }, error: null });
    const res = await handler({ request: req() });
    expect(res.status).toBe(200);
  });

  it("returns 409 at the 500-word cap without spending quota or calling the model", async () => {
    const fetchSpy = modelFetch(new Response("{}"));
    queue(NO_ROW, COUNT(500));
    const res = await handler({ request: req() });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "saved-word-limit" });
    expect(consumeQuota).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // The cheap checks exist so a failed check never spends quota or an AI call.
  // When the check ITSELF errors (a database blip) the safe answer is a 500,
  // not "treat it as not-saved / under the cap" and carry on to spend money.
  it("returns 500 without spending quota or calling the model when the already-saved lookup errors", async () => {
    const fetchSpy = modelFetch(new Response("{}"));
    queue({ data: null, error: { message: "db down" } });
    const res = await handler({ request: req() });
    expect(res.status).toBe(500);
    expect(consumeQuota).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 500 without spending quota or calling the model when the cap count errors", async () => {
    const fetchSpy = modelFetch(new Response("{}"));
    queue(NO_ROW, { count: null, error: { message: "db down" } });
    const res = await handler({ request: req() });
    expect(res.status).toBe(500);
    expect(consumeQuota).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("retries a stalled lookup and still spends the quota once", async () => {
    let calls = 0;
    const fetchSpy = (globalThis.fetch = vi.fn(async () => {
      if (++calls === 1) throw new DOMException("The operation timed out.", "TimeoutError");
      return new Response(JSON.stringify(modelOk), { status: 200 });
    }) as never);
    const res = await handler({ request: req() });
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(consumeQuota).toHaveBeenCalledTimes(1);
  });

  it("relays a quota refusal and does not call the model", async () => {
    const fetchSpy = modelFetch(new Response("{}"));
    consumeQuota.mockResolvedValue({
      ok: false,
      status: 429,
      message: "Daily DEFINE limit reached (40/day).",
    });
    const res = await handler({ request: req() });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: "quota-exceeded",
      resetsAt: null,
      message: "Daily DEFINE limit reached (40/day).",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["a non-200 from NVIDIA", new Response("down", { status: 500 })],
    [
      "unparseable model output",
      new Response(JSON.stringify({ choices: [{ message: { content: "sorry" } }] }), {
        status: 200,
      }),
    ],
    [
      "a wrong list containing the right answer",
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ meaning: "Happy", wrong: ["happy", "b", "c"] }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    ],
  ])("returns 502 and writes NO row for %s", async (_n, response) => {
    modelFetch(response);
    const insert = chainable(INSERT_OK);
    from.mockReset();
    from
      .mockReturnValueOnce(chainable(NO_ROW))
      .mockReturnValueOnce(chainable(COUNT(0)))
      .mockReturnValueOnce(insert);
    const res = await handler({ request: req() });
    expect(res.status).toBe(502);
    expect(insert.calls.find((c) => c.method === "insert")).toBeUndefined();
  });

  it("treats a concurrent duplicate insert (23505) as already saved, not a 500", async () => {
    modelFetch(new Response(JSON.stringify(modelOk), { status: 200 }));
    from.mockReset();
    from
      .mockReturnValueOnce(chainable(NO_ROW))
      .mockReturnValueOnce(chainable(COUNT(0)))
      .mockReturnValueOnce(chainable({ error: { code: "23505", message: "duplicate key" } }))
      .mockReturnValueOnce(
        chainable({
          data: {
            saved_word: "serendipity",
            saved_context: "It was pure serendipity.",
            explanation: "winner",
          },
          error: null,
        }),
      );
    const res = await handler({ request: req() });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ alreadySaved: true, explanation: "winner" });
  });

  it("returns 500 for any other insert error", async () => {
    modelFetch(new Response(JSON.stringify(modelOk), { status: 200 }));
    from.mockReset();
    from
      .mockReturnValueOnce(chainable(NO_ROW))
      .mockReturnValueOnce(chainable(COUNT(0)))
      .mockReturnValueOnce(chainable({ error: { code: "XX000", message: "boom" } }));
    expect((await handler({ request: req() })).status).toBe(500);
  });

  it("adds a Server-Timing header", async () => {
    modelFetch(new Response(JSON.stringify(modelOk), { status: 200 }));
    const res = await handler({ request: req() });
    expect(res.headers.get("Server-Timing")).toContain("total;dur=");
  });

  it("refuses with 403 ai-consent-required before any lookup, quota or model call", async () => {
    requireAiConsent.mockResolvedValue(
      Response.json({ error: "ai-consent-required" }, { status: 403 }),
    );
    const fetchSpy = modelFetch(new Response("{}"));
    const res = await handler({ request: req() });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "ai-consent-required" });
    expect(requireAiConsent).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ route: "define-word" }),
    );
    expect(consumeQuota).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("writes no row when the blocked-term check rejects the definition", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    blockedRpc.mockResolvedValueOnce({ data: [true], error: null });
    modelFetch(new Response(JSON.stringify(modelOk), { status: 200 }));
    queue(NO_ROW, COUNT(0));
    const res = await handler({ request: req() });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Could not look that word up. Try again." });
    expect(from).toHaveBeenCalledTimes(2); // lookup and count only, no insert
  });
});
