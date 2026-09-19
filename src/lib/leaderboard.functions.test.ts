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

const { getLeaderboard, updateProfile, getMyProfile } = asTestFns(
  await import("./leaderboard.functions"),
);

const USER_ID = "user-1";

function ctx(supabase: ReturnType<typeof createSupabaseMock>) {
  return { supabase, userId: USER_ID };
}

describe("getLeaderboard", () => {
  it("maps RPC rows, flags the caller's own row, and fills in defaults", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({
      data: [
        { user_id: USER_ID, display_name: "Me", country: "US", avatar_seed: "1", xp: 500 },
        { user_id: "other", display_name: null, country: null, avatar_seed: null, xp: null },
      ],
    });
    const result = await getLeaderboard({
      context: ctx(supabase),
      data: { scope: "global", period: "weekly" },
    });
    expect(result).toEqual([
      {
        user_id: USER_ID,
        display_name: "Me",
        country: "US",
        avatar_seed: "1",
        xp: 500,
        isYou: true,
      },
      {
        user_id: "other",
        display_name: "Learner",
        country: null,
        avatar_seed: "0",
        xp: 0,
        isYou: false,
      },
    ]);
    expect(supabase.rpc).toHaveBeenCalledWith("get_leaderboard", {
      _scope: "global",
      _period: "weekly",
    });
  });

  it("rejects an invalid scope/period at the validator", async () => {
    const supabase = createSupabaseMock();
    await expect(
      getLeaderboard({
        context: ctx(supabase),
        data: { scope: "planet" as never, period: "weekly" },
      }),
    ).rejects.toThrow();
  });
});

describe("updateProfile", () => {
  it("updates only the caller's own profile row", async () => {
    const supabase = createSupabaseMock();
    const updateChain = chainable({});
    supabase.from.mockReturnValueOnce(updateChain);
    const result = await updateProfile({
      context: ctx(supabase),
      data: { display_name: "New Name" },
    });
    expect(result).toEqual({ ok: true });
    expect(supabase.from).toHaveBeenCalledWith("profiles");
    expect(updateChain.calls.find((c) => c.method === "update")?.args[0]).toEqual({
      display_name: "New Name",
    });
    expect(updateChain.calls.find((c) => c.method === "eq")?.args).toEqual(["id", USER_ID]);
  });

  it("rejects a display name over the length limit", async () => {
    const supabase = createSupabaseMock();
    await expect(
      updateProfile({ context: ctx(supabase), data: { display_name: "x".repeat(41) } }),
    ).rejects.toThrow();
  });
});

describe("getMyProfile", () => {
  it("returns the caller's profile row", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValueOnce(chainable({ data: { id: USER_ID, display_name: "Ada" } }));
    const result = await getMyProfile({ context: ctx(supabase) });
    expect(result).toEqual({ id: USER_ID, display_name: "Ada" });
  });

  it("returns null when the caller has no profile row yet", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValueOnce(chainable({ data: null }));
    const result = await getMyProfile({ context: ctx(supabase) });
    expect(result).toBeNull();
  });
});
