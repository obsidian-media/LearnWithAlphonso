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

const { getWeeklyQuestProgress, claimWeeklyQuest } = asTestFns(await import("./quests.functions"));

const USER_ID = "user-1";
function ctx(supabase: ReturnType<typeof createSupabaseMock>) {
  return { supabase, userId: USER_ID };
}

describe("getWeeklyQuestProgress", () => {
  it("sums this week's XP and lesson count, and marks claimed quests", async () => {
    const supabase = createSupabaseMock();
    supabase.from
      .mockReturnValueOnce(chainable({ data: [{ xp_earned: 80 }, { xp_earned: 90 }] })) // activity_days
      .mockReturnValueOnce(chainable({ data: [{ id: "a" }, { id: "b" }] })) // lesson_completions
      .mockReturnValueOnce(chainable({ data: [{ quest_id: "weekly_xp_150" }] })); // claims

    const result = await getWeeklyQuestProgress({ context: ctx(supabase), data: { course: "en" } });

    const xp150 = result.find((r) => r.questId === "weekly_xp_150");
    const lessons5 = result.find((r) => r.questId === "weekly_lessons_5");
    expect(xp150).toEqual({ questId: "weekly_xp_150", progress: 170, target: 150, claimed: true });
    expect(lessons5).toEqual({
      questId: "weekly_lessons_5",
      progress: 2,
      target: 5,
      claimed: false,
    });
  });

  it("defaults to zero progress when nothing happened this week", async () => {
    const supabase = createSupabaseMock();
    supabase.from
      .mockReturnValueOnce(chainable({ data: [] }))
      .mockReturnValueOnce(chainable({ data: [] }))
      .mockReturnValueOnce(chainable({ data: [] }));
    const result = await getWeeklyQuestProgress({ context: ctx(supabase), data: { course: "en" } });
    expect(result.every((r) => r.progress === 0 && !r.claimed)).toBe(true);
  });
});

describe("claimWeeklyQuest", () => {
  it("returns the granted XP on success", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({ data: [{ ok: true, xp: 130 }], error: null });
    const result = await claimWeeklyQuest({
      context: ctx(supabase),
      data: { questId: "weekly_xp_150", course: "en" },
    });
    expect(result).toEqual({ ok: true, xp: 130 });
  });

  it("surfaces a not-yet-completed rejection from the RPC", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({
      data: [{ ok: false, reason: "not-yet-completed" }],
      error: null,
    });
    const result = await claimWeeklyQuest({
      context: ctx(supabase),
      data: { questId: "weekly_xp_150", course: "en" },
    });
    expect(result).toEqual({ ok: false, reason: "not-yet-completed" });
  });

  it("treats an RPC error as a server-error result rather than throwing", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({ data: null, error: new Error("db down") });
    const result = await claimWeeklyQuest({
      context: ctx(supabase),
      data: { questId: "weekly_xp_150", course: "en" },
    });
    expect(result).toEqual({ ok: false, reason: "server-error" });
  });
});
