import { describe, expect, it, vi } from "vitest";
import { chainable, asTestFns, type ChainCall } from "./__testutils__/supabase-mock";

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
        async (opts: { data?: unknown; context?: unknown } = {}) =>
          fn({ data: validator ? validator(opts.data) : opts.data, context: opts.context ?? {} }),
    };
    return builder;
  },
}));

const mod = await import("./profile.functions");
const { getProfileOverview } = asTestFns({ getProfileOverview: mod.getProfileOverview });
import { streakToday } from "./profile-overview";

function fakeClient(tables: Record<string, unknown[]>, rpc: Record<string, unknown> = {}) {
  const calls: Record<string, ChainCall[][]> = {};
  const seen: Record<string, number> = {};
  const supabase = {
    from: vi.fn((table: string) => {
      const i = (seen[table] = (seen[table] ?? 0) + 1) - 1;
      const log: ChainCall[] = [];
      (calls[table] ??= []).push(log);
      return chainable(tables[table]?.[i] ?? { data: [], error: null }, log);
    }),
    rpc: vi.fn((name: string) => chainable(rpc[name] ?? { data: [], error: null })),
  };
  return { supabase, calls };
}
const ok = (data: unknown, count?: number) => ({ data, error: null, count });

describe("getProfileOverview: profile data (20261107120000)", () => {
  it("maps learning minutes, mastered words, league standing, time zone and skills, and degrades to empty", async () => {
    const today = streakToday();
    const { supabase, calls } = fakeClient(
      {
        learning_days: [ok([{ day: today, lesson_seconds: 300, practice_seconds: 120 }])],
        mastered_words: [ok(null, 7)],
        learner_time_zones: [ok({ time_zone: "Europe/Paris" })],
        skill_days: [ok([{ day: today, skill: "listening", right_answers: 3, total_answers: 4 }])],
      },
      {
        get_my_league_standing: ok([
          {
            league_tier: "silver",
            rank: 2,
            size: 9,
            week_start: "2026-11-02",
            week_end: "2026-11-08",
            week_xp: 120,
          },
        ]),
      },
    );
    const o = await getProfileOverview({
      data: { course: "es" },
      context: { supabase, userId: "u1" },
    });
    expect(o.learning).toEqual([{ day: today, lessonSeconds: 300, practiceSeconds: 120 }]);
    expect(o.masteredWords).toBe(7);
    expect(o.timeZone).toBe("Europe/Paris");
    expect(o.skills).toEqual([{ day: today, skill: "listening", right: 3, total: 4 }]);
    expect(o.league).toEqual({
      leagueTier: "silver",
      rank: 2,
      size: 9,
      weekStart: "2026-11-02",
      weekEnd: "2026-11-08",
      weekXp: 120,
    });
    expect(supabase.rpc).toHaveBeenCalledWith("get_my_league_standing", { _course: "es" });
    expect(JSON.stringify(calls.mastered_words)).toContain('"es"');

    const empty = fakeClient({});
    const e = await getProfileOverview({
      data: { course: "es" },
      context: { supabase: empty.supabase, userId: "u1" },
    });
    expect(e).toMatchObject({
      learning: [],
      masteredWords: 0,
      league: null,
      timeZone: null,
      skills: [],
    });
  });
});
