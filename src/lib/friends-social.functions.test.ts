import { describe, expect, it, vi } from "vitest";
import { asTestFns, chainable, createSupabaseMock } from "./__testutils__/supabase-mock";

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validator: ((d: unknown) => unknown) | undefined;
    const builder = {
      middleware: () => builder,
      inputValidator: (v: (d: unknown) => unknown) => {
        validator = v;
        return builder;
      },
      validator: (v: (d: unknown) => unknown) => {
        validator = v;
        return builder;
      },
      handler:
        (fn: (opts: { data: unknown; context: unknown }) => unknown) =>
        async (opts: { data?: unknown; context?: unknown } = {}) => {
          const data = validator ? validator(opts.data) : opts.data;
          return fn({ data, context: opts.context ?? {} });
        },
    };
    return builder;
  },
}));

const { sendNudge, getUnreadNudges, markNudgesRead, getFriendActivity } = asTestFns(
  await import("./friends.functions"),
);

const USER_ID = "22222222-2222-4222-8222-222222222222";
const FRIEND_ID = "11111111-1111-4111-8111-111111111111";
const NUDGE_ID = "33333333-3333-4333-8333-333333333333";

function ctx(supabase: ReturnType<typeof createSupabaseMock>) {
  return { supabase, userId: USER_ID };
}

describe("sendNudge", () => {
  it("inserts only the recipient: the sender is the database's own default, never sent", async () => {
    const supabase = createSupabaseMock();
    const chain = chainable({ data: null, error: null });
    supabase.from.mockReturnValueOnce(chain);
    const result = await sendNudge({ context: ctx(supabase), data: { recipientId: FRIEND_ID } });
    expect(result).toEqual({ ok: true });
    expect(supabase.from).toHaveBeenCalledWith("nudges");
    expect(chain.calls).toEqual([{ method: "insert", args: [{ recipient_id: FRIEND_ID }] }]);
  });

  it("answers ok: false, with no reason, when the table refuses (not a friend, blocked, restricted)", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValueOnce(chainable({ data: null, error: { code: "42501" } }));
    const result = await sendNudge({ context: ctx(supabase), data: { recipientId: FRIEND_ID } });
    expect(result).toEqual({ ok: false });
  });

  it("never sends a nudge to yourself", async () => {
    const supabase = createSupabaseMock();
    const result = await sendNudge({ context: ctx(supabase), data: { recipientId: USER_ID } });
    expect(result).toEqual({ ok: false });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects a recipient that is not a uuid", async () => {
    const supabase = createSupabaseMock();
    await expect(
      sendNudge({ context: ctx(supabase), data: { recipientId: "not-a-uuid" } }),
    ).rejects.toThrow();
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe("getUnreadNudges", () => {
  it("reads only unread rows, newest first, and maps them", async () => {
    const supabase = createSupabaseMock();
    const chain = chainable({
      data: [{ id: "n1", sender_id: FRIEND_ID, created_at: "2026-11-15T10:00:00Z" }],
      error: null,
    });
    supabase.from.mockReturnValueOnce(chain);
    const result = await getUnreadNudges({ context: ctx(supabase) });
    expect(result).toEqual([{ id: "n1", senderId: FRIEND_ID, createdAt: "2026-11-15T10:00:00Z" }]);
    expect(chain.calls).toEqual([
      { method: "select", args: ["id,sender_id,created_at"] },
      { method: "is", args: ["read_at", null] },
      { method: "order", args: ["created_at", { ascending: false }] },
    ]);
  });

  it("returns none on an error, so a failed check never shows a false nudge", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValueOnce(chainable({ data: [{ id: "n1" }], error: { code: "x" } }));
    expect(await getUnreadNudges({ context: ctx(supabase) })).toEqual([]);
  });
});

describe("markNudgesRead", () => {
  it("stamps read_at on the listed unread ids only", async () => {
    const supabase = createSupabaseMock();
    const chain = chainable({ data: null, error: null });
    supabase.from.mockReturnValueOnce(chain);
    const result = await markNudgesRead({ context: ctx(supabase), data: { ids: [NUDGE_ID] } });
    expect(result).toEqual({ ok: true });
    expect(chain.calls.map((c) => c.method)).toEqual(["update", "in", "is"]);
    expect(chain.calls[1].args).toEqual(["id", [NUDGE_ID]]);
    expect(chain.calls[2].args).toEqual(["read_at", null]);
  });

  it("does nothing for an empty list", async () => {
    const supabase = createSupabaseMock();
    expect(await markNudgesRead({ context: ctx(supabase), data: { ids: [] } })).toEqual({
      ok: true,
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("reports a failed write", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValueOnce(chainable({ data: null, error: { code: "x" } }));
    expect(await markNudgesRead({ context: ctx(supabase), data: { ids: [NUDGE_ID] } })).toEqual({
      ok: false,
    });
  });
});

describe("getFriendActivity", () => {
  it("asks for the newest 50 with no filter of its own (the policy scopes it to friends)", async () => {
    const supabase = createSupabaseMock();
    const chain = chainable({ data: [], error: null });
    supabase.from.mockReturnValueOnce(chain);
    await getFriendActivity({ context: ctx(supabase) });
    expect(supabase.from).toHaveBeenCalledWith("friend_activity_events");
    expect(chain.calls).toEqual([
      { method: "select", args: ["id,user_id,event_type,payload,created_at"] },
      { method: "order", args: ["created_at", { ascending: false }] },
      { method: "limit", args: [50] },
    ]);
  });

  it("maps the three event payloads and tolerates a missing or odd payload", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValueOnce(
      chainable({
        data: [
          {
            id: "e1",
            user_id: "f1",
            event_type: "lesson_completed",
            payload: { xpGain: 20 },
            created_at: "t1",
          },
          {
            id: "e2",
            user_id: "f2",
            event_type: "streak_milestone",
            payload: { streak: 7 },
            created_at: "t2",
          },
          {
            id: "e3",
            user_id: "f3",
            event_type: "league_promotion",
            payload: { newTier: "silver" },
            created_at: "t3",
          },
          {
            id: "e4",
            user_id: "f4",
            event_type: "lesson_completed",
            payload: null,
            created_at: "t4",
          },
          {
            id: "e5",
            user_id: "f5",
            event_type: "lesson_completed",
            payload: { xpGain: "20" },
            created_at: "t5",
          },
        ],
        error: null,
      }),
    );
    const result = await getFriendActivity({ context: ctx(supabase) });
    expect(result.map((e) => [e.id, e.xpGain, e.streak, e.newTier])).toEqual([
      ["e1", 20, null, null],
      ["e2", null, 7, null],
      ["e3", null, null, "silver"],
      ["e4", null, null, null],
      ["e5", null, null, null],
    ]);
  });

  it("returns an empty feed on an error", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValueOnce(chainable({ data: null, error: { code: "x" } }));
    expect(await getFriendActivity({ context: ctx(supabase) })).toEqual([]);
  });
});
