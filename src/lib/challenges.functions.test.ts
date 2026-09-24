import { describe, expect, it, vi } from "vitest";
import { asTestFns, createSupabaseMock } from "./__testutils__/supabase-mock";

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

const { getWeeklyChallenges, joinOpenDuelQueue, leaveOpenDuelQueue } = asTestFns(
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
    expect(result).toEqual({ matched: true, duelId: "d1" });
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
    const result = await joinOpenDuelQueue({ context: ctx(supabase), data: {} });
    expect(result).toEqual({ matched: false, duelId: null });
  });

  it("fails closed when the RPC returns no rows", async () => {
    const supabase = rpcReturning([]);
    const result = await joinOpenDuelQueue({ context: ctx(supabase), data: {} });
    expect(result).toEqual({ matched: false, duelId: null });
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
