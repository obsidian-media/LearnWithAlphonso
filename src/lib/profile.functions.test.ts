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
import { threeMonthsWindow, weekStart, streakToday } from "./profile-overview";

/**
 * A fake client answering by table, in call order per table (activity_days and review_items are each read twice).
 */
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

describe("getProfileOverview", () => {
  it("reads every section in one round of parallel queries and maps the rows", async () => {
    const today = streakToday();
    const { supabase, calls } = fakeClient(
      {
        profiles: [
          ok({
            display_name: "Sam",
            avatar_seed: "animal:fox",
            country: "CA",
            created_at: "2026-10-02T00:00:00Z",
          }),
        ],
        language_progress: [
          ok([{ language: "es", xp: 4820, cefr_level: "B1", league_tier: "ruby" }]),
        ],
        user_progress: [ok({ streak: 12, longest_streak: 21, streak_freezes: 1 })],
        lesson_completions: [ok([{ lesson_id: "x", language: "es", correct: 7, total: 8 }])],
        activity_days: [ok([{ day: today, xp_earned: 40 }]), ok([{ xp_earned: 180 }])],
        speech_days: [ok([{ day: today, speech_seconds: 90 }])],
        review_items: [
          ok([
            {
              weakness_label: "ser-estar",
              weakness_display: "Ser or estar",
              lapses: 3,
              repetitions: 0,
            },
          ]),
          ok(null, 34),
        ],
        weakness_events: [
          ok([{ category: "ser-estar", event_type: "detected", created_at: today }]),
        ],
        user_achievements: [ok([{ achievement_id: "streak_3", progress: 3, unlocked_at: today }])],
      },
      {
        get_friends_progress: ok([
          {
            user_id: "f1",
            display_name: "Mina",
            avatar_seed: "animal:owl",
            streak: 4,
            week_xp: 520,
          },
        ]),
      },
    );
    const o = await getProfileOverview({
      data: { course: "es" },
      context: { supabase, userId: "u1" },
    });

    expect(o).toMatchObject({
      today,
      course: "es",
      profile: { displayName: "Sam", avatarSeed: "animal:fox", country: "CA" },
      courses: [{ course: "es", xp: 4820, cefrLevel: "B1", leagueTier: "ruby" }],
      progress: { streak: 12, longestStreak: 21, streakFreezes: 1 },
      completions: [{ lessonId: "x", language: "es", correct: 7, total: 8 }],
      activity: [{ day: today, xp: 40 }],
      bestDayXp: 180,
      speech: [{ day: today, seconds: 90 }],
      weakItems: [{ label: "ser-estar", display: "Ser or estar", lapses: 3, repetitions: 0 }],
      savedWords: 34,
      achievements: [{ id: "streak_3", progress: 3 }],
      friends: [{ userId: "f1", displayName: "Mina", weekXp: 520 }],
    });

    // Every table is read for this learner only.
    for (const [table, logs] of Object.entries(calls)) {
      const key = table === "profiles" ? "id" : "user_id";
      for (const log of logs)
        expect(log, table).toContainEqual({ method: "eq", args: [key, "u1"] });
    }
    // The heat-map window starts on the Monday of the week holding the first of the 3 months.
    expect(calls.activity_days![0]).toContainEqual({
      method: "gte",
      args: ["day", weekStart(threeMonthsWindow(today).start)],
    });
    // Weak spots and saved words are this course's only.
    for (const log of calls.review_items!)
      expect(log).toContainEqual({ method: "eq", args: ["language", "es"] });
    expect(calls.review_items![0]).toContainEqual({ method: "eq", args: ["source", "weakness"] });
    expect(calls.review_items![1]).toContainEqual({ method: "eq", args: ["source", "saved_word"] });
  });

  it("fails loudly instead of showing a new learner's zeros when a core read fails", async () => {
    const { supabase } = fakeClient({
      user_progress: [
        { data: null, error: { message: "permission denied for table user_progress" } },
      ],
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      getProfileOverview({ data: { course: "en" }, context: { supabase, userId: "u1" } }),
    ).rejects.toThrow("getProfileOverview: request-failed");
    log.mockRestore();
  });

  it("refuses an unknown course", async () => {
    const { supabase } = fakeClient({});
    await expect(
      getProfileOverview({ data: { course: "de" }, context: { supabase, userId: "u1" } }),
    ).rejects.toThrow();
  });
});
