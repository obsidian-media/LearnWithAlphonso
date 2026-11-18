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

const { getWeeklyChallenges, joinOpenDuelQueue, leaveOpenDuelQueue, getMyDuelQueue } = asTestFns(
  await import("./challenges.functions"),
);

function ctx(supabase: ReturnType<typeof createSupabaseMock>) {
  return { supabase, userId: "user-1" };
}
function rpcReturning(value: unknown) {
  const supabase = createSupabaseMock();
  supabase.rpc.mockResolvedValue({ data: value, error: null });
  return supabase;
}

describe("getWeeklyChallenges", () => {
  it("maps snake_case rows to the client shape", async () => {
    const supabase = rpcReturning([
      {
        template_id: "xp_500",
        title: "Earn 500 XP",
        description: "This week",
        progress: 120,
        threshold: 500,
        completed: false,
      },
    ]);

    const result = await getWeeklyChallenges({ context: ctx(supabase) });

    expect(supabase.rpc).toHaveBeenCalledWith("get_weekly_challenges");
    expect(result).toEqual([
      {
        templateId: "xp_500",
        title: "Earn 500 XP",
        description: "This week",
        progress: 120,
        threshold: 500,
        completed: false,
      },
    ]);
  });

  it("defaults a null progress to 0 and a null completed to false", async () => {
    // A challenge the user hasn't started has no row in the join, so these
    // come back null -- rendering them raw would print "null/500".
    const supabase = rpcReturning([
      {
        template_id: "xp_500",
        title: "Earn 500 XP",
        description: "This week",
        progress: null,
        threshold: 500,
        completed: null,
      },
    ]);

    const result = await getWeeklyChallenges({ context: ctx(supabase) });

    expect(result[0]!.progress).toBe(0);
    expect(result[0]!.completed).toBe(false);
  });

  it("returns an empty list rather than throwing when there are no rows", async () => {
    const supabase = rpcReturning(null);
    await expect(getWeeklyChallenges({ context: ctx(supabase) })).resolves.toEqual([]);
  });
});

describe("joinOpenDuelQueue", () => {
  it("passes course and match-by-level through to the RPC", async () => {
    const supabase = rpcReturning([{ matched: true, duel_id: "d1" }]);

    const result = await joinOpenDuelQueue({
      context: ctx(supabase),
      data: { course: "fr", matchByLevel: false },
    });

    expect(supabase.rpc).toHaveBeenCalledWith("join_open_duel_queue", {
      _course: "fr",
      _match_by_level: false,
    });
    expect(result).toEqual({ matched: true, duelId: "d1", queued: false });
    // A match needs no queue read.
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("defaults to english and match-by-level when given an empty object", async () => {
    const supabase = rpcReturning([{ matched: false, duel_id: null }]);

    await joinOpenDuelQueue({ context: ctx(supabase), data: {} });

    expect(supabase.rpc).toHaveBeenCalledWith("join_open_duel_queue", {
      _course: "en",
      _match_by_level: true,
    });
  });

  it("reports no match rather than a phantom duel when queued", async () => {
    // Queued-but-unmatched is the common case; duelId must stay null so the
    // caller doesn't navigate to a duel that doesn't exist.
    const supabase = rpcReturning([{ matched: false, duel_id: null }]);
    supabase.from.mockReturnValueOnce(chainable({ data: { user_id: "user-1" }, error: null }));
    const result = await joinOpenDuelQueue({ context: ctx(supabase), data: {} });
    expect(supabase.from).toHaveBeenCalledWith("duel_queue");
    expect(result).toEqual({ matched: false, duelId: null, queued: true });
  });

  it("reports not queued when the server did not let the learner in (no queue row was written)", async () => {
    // Open duels switched off, or the account kept out of contact with strangers: the RPC answers (false, null) too,
    // but deletes the caller's row instead of writing it. "Waiting for an opponent…" would wait forever.
    const supabase = rpcReturning([{ matched: false, duel_id: null }]);
    supabase.from.mockReturnValueOnce(chainable({ data: null, error: null }));
    const result = await joinOpenDuelQueue({ context: ctx(supabase), data: {} });
    expect(result).toEqual({ matched: false, duelId: null, queued: false });
  });

  it("keeps the queued reading when the queue row cannot be read", async () => {
    const supabase = rpcReturning([{ matched: false, duel_id: null }]);
    supabase.from.mockReturnValueOnce(chainable({ data: null, error: { message: "boom" } }));
    const result = await joinOpenDuelQueue({ context: ctx(supabase), data: {} });
    expect(result).toEqual({ matched: false, duelId: null, queued: true });
  });

  it("fails closed when the RPC returns no rows", async () => {
    const supabase = rpcReturning([]);
    const result = await joinOpenDuelQueue({ context: ctx(supabase), data: {} });
    expect(result).toEqual({ matched: false, duelId: null, queued: false });
  });

  it("rejects an unsupported course before hitting the network", async () => {
    const supabase = rpcReturning([]);
    await expect(
      joinOpenDuelQueue({ context: ctx(supabase), data: { course: "de" } }),
    ).rejects.toThrow();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe("leaveOpenDuelQueue", () => {
  it("calls leave_duel_queue and reports ok", async () => {
    const supabase = rpcReturning(null);
    const result = await leaveOpenDuelQueue({ context: ctx(supabase) });
    expect(supabase.rpc).toHaveBeenCalledWith("leave_duel_queue");
    expect(result).toEqual({ ok: true });
  });
});

describe("a failed call is an error, not a quiet result", () => {
  function rpcFailing() {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { message: "permission denied for table x" },
    });
    return supabase;
  }

  it("getWeeklyChallenges throws instead of returning no challenges", async () => {
    await expect(getWeeklyChallenges({ context: ctx(rpcFailing()) })).rejects.toThrow(
      "getWeeklyChallenges: request-failed",
    );
  });

  it("joinOpenDuelQueue throws instead of reporting 'queued, no match'", async () => {
    await expect(joinOpenDuelQueue({ context: ctx(rpcFailing()), data: {} })).rejects.toThrow(
      "joinOpenDuelQueue: request-failed",
    );
  });

  it("leaveOpenDuelQueue throws instead of always saying ok", async () => {
    await expect(leaveOpenDuelQueue({ context: ctx(rpcFailing()) })).rejects.toThrow(
      "leaveOpenDuelQueue: request-failed",
    );
  });
});

describe("getMyDuelQueue", () => {
  function queueRow(result: unknown) {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValueOnce(chainable(result));
    return supabase;
  }

  it("reports the caller's own fresh queue row as queued, with its course", async () => {
    const queuedAt = new Date(Date.now() - 60_000).toISOString();
    const supabase = queueRow({ data: { course: "fr", queued_at: queuedAt }, error: null });
    const result = await getMyDuelQueue({ context: ctx(supabase) });
    expect(supabase.from).toHaveBeenCalledWith("duel_queue");
    expect(result).toEqual({ queued: true, course: "fr", queuedAt });
  });

  it("reports not queued when there is no row", async () => {
    const supabase = queueRow({ data: null, error: null });
    expect(await getMyDuelQueue({ context: ctx(supabase) })).toEqual({ queued: false });
  });

  it("treats a row older than the queue's 10-minute lifetime as not queued (it can never be matched)", async () => {
    const queuedAt = new Date(Date.now() - 11 * 60_000).toISOString();
    const supabase = queueRow({ data: { course: "en", queued_at: queuedAt }, error: null });
    expect(await getMyDuelQueue({ context: ctx(supabase) })).toEqual({ queued: false });
  });

  it("throws when the read fails", async () => {
    const supabase = queueRow({ data: null, error: { message: "boom" } });
    await expect(getMyDuelQueue({ context: ctx(supabase) })).rejects.toThrow(
      "getMyDuelQueue: request-failed",
    );
  });
});
