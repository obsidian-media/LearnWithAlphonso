import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const { getWeeklyRecap } = asTestFns(await import("./leaderboard.functions"));

const USER_ID = "user-1";

function ctx(supabase: ReturnType<typeof createSupabaseMock>) {
  return { supabase, userId: USER_ID };
}

describe("getWeeklyRecap", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 10, 18, 12, 0))); // Wednesday 2026-11-18
  });
  afterEach(() => vi.useRealTimers());

  it("sums the caller's own activity days between the two Mondays and finds their rank today", async () => {
    const supabase = createSupabaseMock();
    const days = chainable({
      data: [{ xp_earned: 120 }, { xp_earned: 80 }, { xp_earned: null }],
      error: null,
    });
    supabase.from.mockReturnValueOnce(days);
    supabase.rpc.mockResolvedValue({
      data: [{ user_id: "a" }, { user_id: "b" }, { user_id: USER_ID }],
      error: null,
    });

    const result = await getWeeklyRecap({ context: ctx(supabase) });

    expect(result).toEqual({ lastWeekXp: 200, currentRank: 3 });
    expect(supabase.from).toHaveBeenCalledWith("activity_days");
    expect(days.calls).toEqual([
      { method: "select", args: ["xp_earned"] },
      { method: "eq", args: ["user_id", USER_ID] },
      { method: "gte", args: ["day", "2026-11-09"] },
      { method: "lt", args: ["day", "2026-11-16"] },
    ]);
    expect(supabase.rpc).toHaveBeenCalledWith("get_leaderboard", {
      _scope: "global",
      _period: "weekly",
    });
  });

  it("scopes the XP to the caller: it asks for their own user id, nobody else's", async () => {
    const supabase = createSupabaseMock();
    const days = chainable({ data: [], error: null });
    supabase.from.mockReturnValueOnce(days);
    supabase.rpc.mockResolvedValue({ data: [], error: null });
    await getWeeklyRecap({ context: { supabase, userId: "someone-else" } });
    expect(days.calls).toContainEqual({ method: "eq", args: ["user_id", "someone-else"] });
  });

  it("has no rank when the caller is not on the board, and 0 XP for a quiet week", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValueOnce(chainable({ data: [], error: null }));
    supabase.rpc.mockResolvedValue({ data: [{ user_id: "a" }], error: null });
    expect(await getWeeklyRecap({ context: ctx(supabase) })).toEqual({
      lastWeekXp: 0,
      currentRank: null,
    });
  });

  it("a part that cannot be read comes back as 0 or none, never an error", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValueOnce(
      chainable({ data: [{ xp_earned: 50 }], error: { code: "x" } }),
    );
    supabase.rpc.mockResolvedValue({ data: [{ user_id: USER_ID }], error: { code: "x" } });
    expect(await getWeeklyRecap({ context: ctx(supabase) })).toEqual({
      lastWeekXp: 0,
      currentRank: null,
    });
  });
});
