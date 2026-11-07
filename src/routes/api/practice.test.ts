import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * POST /api/practice finishes a call with stars computed from the server's own tally; GET returns the hub's rows.
 * The fake client below answers each `from(table)` read from a per-table queue and records every filter, so the
 * tests see which user a read was scoped to.
 */
type Read = { data: unknown; error: unknown };
const reads: Record<string, Read[]> = {};
const filters: { table: string; col: string; val: unknown }[] = [];
const rpc = vi.fn();
const getUser = vi.fn();

function from(table: string) {
  const answer = () => (reads[table] ?? []).shift() ?? { data: null, error: null };
  const q: Record<string, unknown> = {};
  for (const m of ["select", "order"]) q[m] = () => q;
  q.eq = (col: string, val: unknown) => {
    filters.push({ table, col, val });
    return q;
  };
  q.maybeSingle = async () => answer();
  q.then = (ok: (r: Read) => unknown) => Promise.resolve(answer()).then(ok);
  return q;
}
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from, rpc, auth: { getUser } },
}));

const { Route } = await import("./practice");
const handlers = Route.options.server!.handlers as unknown as {
  GET: (o: { request: Request }) => Promise<Response>;
  POST: (o: { request: Request }) => Promise<Response>;
};
const CALL = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const auth = { Authorization: "Bearer token" };
const post = (body: unknown, headers: Record<string, string> = auth) =>
  handlers.POST({
    request: new Request("https://x/api/practice", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  });
const get = (course: string) =>
  handlers.GET({
    request: new Request(`https://x/api/practice?course=${course}`, { headers: auth }),
  });

const callRow = (over: Record<string, unknown> = {}) => ({
  id: CALL,
  user_id: "user-1",
  course: "es",
  kind: "scenario",
  item_key: "coffee",
  replies: 5,
  right_replies: 5,
  short_replies: 0,
  english_replies: 0,
  started_at: "2026-11-06T10:00:00Z",
  last_reply_at: "2026-11-06T10:04:00Z",
  finished_at: null,
  stars: null,
  ...over,
});

beforeEach(() => {
  for (const k of Object.keys(reads)) delete reads[k];
  filters.length = 0;
  rpc.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
});

describe("POST /api/practice: finishing a call", () => {
  it("refuses a request without a valid token", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad" } });
    expect((await post({ callId: CALL })).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("computes the stars from the stored tally, ignoring any stars the client sends", async () => {
    reads.practice_calls = [{ data: callRow({ right_replies: 4 }), error: null }];
    rpc.mockResolvedValue({
      data: [{ call_stars: 2, best_before: 0, best_after: 2 }],
      error: null,
    });
    const res = await post({ callId: CALL, stars: 3, rightReplies: 5 });
    expect(rpc).toHaveBeenCalledWith("finish_practice_call", {
      _user_id: "user-1",
      _call_id: CALL,
      _replies: 5,
      _stars: 2,
    });
    expect(await res.json()).toMatchObject({
      stars: 2,
      bestBefore: 0,
      bestAfter: 2,
      replies: 5,
      rightReplies: 4,
    });
  });

  it("reads the call scoped to the verified user", async () => {
    reads.practice_calls = [{ data: null, error: null }];
    const res = await post({ callId: CALL });
    expect(res.status).toBe(404);
    expect(filters).toContainEqual({ table: "practice_calls", col: "user_id", val: "user-1" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a perfect tally finishes with three stars", async () => {
    reads.practice_calls = [{ data: callRow(), error: null }];
    rpc.mockResolvedValue({
      data: [{ call_stars: 3, best_before: 2, best_after: 3 }],
      error: null,
    });
    await post({ callId: CALL });
    expect(rpc.mock.calls[0][1]._stars).toBe(3);
  });

  it("a scene finishes at its own minTurns", async () => {
    reads.practice_calls = [
      {
        data: callRow({
          kind: "scene",
          item_key: "city-day/directions",
          replies: 2,
          right_replies: 0,
        }),
        error: null,
      },
    ];
    rpc.mockResolvedValue({
      data: [{ call_stars: 1, best_before: 0, best_after: 1 }],
      error: null,
    });
    const res = await post({ callId: CALL });
    expect(rpc.mock.calls[0][1]._stars).toBe(1);
    expect((await res.json()).finishMinReplies).toBe(2);
  });

  it("records the call's length as practice time, once, from the server's own reply times", async () => {
    reads.practice_calls = [
      {
        data: callRow({
          started_at: "2026-11-07T10:00:00.000Z",
          last_reply_at: "2026-11-07T10:04:00.000Z",
        }),
        error: null,
      },
    ];
    rpc.mockResolvedValue({
      data: [{ call_stars: 2, best_before: 0, best_after: 2 }],
      error: null,
    });
    await post({ callId: CALL });
    const learning = rpc.mock.calls.filter((c) => c[0] === "add_learning_seconds");
    expect(learning).toEqual([
      ["add_learning_seconds", { _user_id: "user-1", _lesson_seconds: 0, _practice_seconds: 240 }],
    ]);
  });

  it("re-reads once when a reply landed between the read and the finish", async () => {
    reads.practice_calls = [
      { data: callRow({ replies: 4, right_replies: 4 }), error: null },
      { data: callRow({ replies: 5, right_replies: 4 }), error: null },
    ];
    rpc.mockResolvedValueOnce({ data: null, error: { code: "22023" } }).mockResolvedValueOnce({
      data: [{ call_stars: 2, best_before: 0, best_after: 2 }],
      error: null,
    });
    const res = await post({ callId: CALL });
    expect(
      rpc.mock.calls.filter((c) => c[0] === "finish_practice_call").map((c) => c[1]._replies),
    ).toEqual([4, 5]);
    expect((await res.json()).stars).toBe(2);
  });

  it("an already finished call answers its stored stars without finishing again", async () => {
    reads.practice_calls = [
      { data: callRow({ finished_at: "2026-11-06T10:05:00Z", stars: 2 }), error: null },
    ];
    reads.practice_stars = [{ data: { best_stars: 3 }, error: null }];
    const res = await post({ callId: CALL });
    expect(rpc).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ stars: 2, bestBefore: 3, bestAfter: 3 });
  });

  it("refuses a malformed call id", async () => {
    expect((await post({ callId: "x" })).status).toBe(400);
  });
});

describe("GET /api/practice: the hub's rows", () => {
  it("returns the learner's stars, level and weakness events for the course, scoped to them", async () => {
    reads.practice_stars = [
      {
        data: [
          {
            kind: "scene",
            item_key: "train-trip/train-buy-ticket",
            best_stars: 3,
            last_played_at: "2026-11-05T10:00:00+00:00",
          },
        ],
        error: null,
      },
    ];
    reads.language_progress = [{ data: { cefr_level: "B1" }, error: null }];
    reads.weakness_events = [
      {
        data: [
          {
            category: "past-tense",
            event_type: "detected",
            created_at: "2026-11-01T10:00:00+00:00",
          },
        ],
        error: null,
      },
    ];
    const res = await get("es");
    expect(await res.json()).toEqual({
      stars: [
        {
          kind: "scene",
          itemKey: "train-trip/train-buy-ticket",
          bestStars: 3,
          lastPlayedAt: "2026-11-05T10:00:00.000Z",
        },
      ],
      cefrLevel: "B1",
      weaknessEvents: [
        { category: "past-tense", eventType: "detected", createdAt: "2026-11-01T10:00:00.000Z" },
      ],
    });
    for (const table of ["practice_stars", "language_progress", "weakness_events"]) {
      expect(filters).toContainEqual({ table, col: "user_id", val: "user-1" });
    }
    expect(filters).toContainEqual({ table: "practice_stars", col: "course", val: "es" });
  });

  it("a failed read is an error, never zero stars", async () => {
    reads.practice_stars = [{ data: null, error: { message: "boom" } }];
    expect((await get("es")).status).toBe(500);
  });

  it("refuses an unknown course", async () => {
    expect((await get("xx")).status).toBe(400);
  });
});
