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

// user_progress/language_progress/lesson_completions/activity_days/
// user_achievements/review_items no longer grant direct INSERT/UPDATE to
// `authenticated` (supabase/migrations/20260920050000_revoke_direct_gamification_writes.sql)
// -- sync.functions.ts writes those via supabaseAdmin now, same pattern
// account.functions.test.ts already established for deleteMyAccount.
const supabaseAdminFrom = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: supabaseAdminFrom },
}));

const {
  fetchProgress,
  startLessonSession,
  completeLessonRemote,
  loseHeartRemote,
  restoreHeartsRemote,
  buyHeartWithXpRemote,
  mergeGuestProgress,
  setCefrLevel,
  savePlacementResult,
} = asTestFns(await import("./sync.functions"));
const { issueLessonSessionToken } = await import("./lesson-session.server");

const USER_ID = "user-1";
const LESSON_ID = "u1l1"; // real lesson: 8 questions, q1..q8

function ctx(supabase: ReturnType<typeof createSupabaseMock>) {
  return { supabase, userId: USER_ID };
}

beforeEach(() => {
  process.env.LESSON_SESSION_SECRET = "test-secret";
  supabaseAdminFrom.mockReset();
  supabaseAdminFrom.mockReturnValue(chainable({ data: null, error: null }));
});

afterEach(() => {
  delete process.env.LESSON_SESSION_SECRET;
});

describe("fetchProgress", () => {
  it("passes through existing rows unchanged when no seeding or refill is needed", async () => {
    const supabase = createSupabaseMock();
    supabase.from
      .mockReturnValueOnce(
        chainable({
          data: { xp: 999, streak: 4, longest_streak: 10, hearts: 5, hearts_refill_at: null },
        }),
      ) // user_progress select
      .mockReturnValueOnce(
        chainable({ data: { xp: 120, cefr_level: "A2", league_tier: "silver" } }),
      ) // language_progress select
      .mockReturnValueOnce(chainable({ data: [{ lesson_id: "u1l1", correct: 8, total: 8 }] })) // lesson_completions
      .mockReturnValueOnce(chainable({ data: [{ day: "2026-09-01", xp_earned: 40 }] })) // activity_days
      .mockReturnValueOnce(chainable({ data: [{ achievement_id: "first_lesson" }] })); // user_achievements

    const result = await fetchProgress({ context: ctx(supabase), data: { course: "en" } });

    expect(result.xp).toBe(120); // from language_progress, not the legacy user_progress.xp
    expect(result.streak).toBe(4);
    expect(result.leagueTier).toBe("silver");
    expect(result.completedLessons).toEqual(["u1l1"]);
    expect(result.answersByLesson).toEqual({ u1l1: { correct: 8, total: 8 } });
    expect(result.unlockedAchievements).toEqual(["first_lesson"]);
    // No 6th/7th/8th .from() call: no insert, upsert, or refill update needed.
    expect(supabase.from).toHaveBeenCalledTimes(5);
  });

  it("seeds a first-time 'en' language_progress row from the legacy user_progress row", async () => {
    // Only "en" inherits the legacy user_progress values (the pre-multi-course
    // migration case); any other course always starts fresh at the defaults.
    const supabase = createSupabaseMock();
    const seedUpsert = chainable({ data: { xp: 500, cefr_level: "B1", league_tier: "ruby" } });
    supabase.from
      .mockReturnValueOnce(chainable({ data: { xp: 500, cefr_level: "B1", league_tier: "ruby" } })) // user_progress select
      .mockReturnValueOnce(chainable({ data: null })) // language_progress select: nothing yet for "en"
      .mockReturnValueOnce(chainable({ data: [] }))
      .mockReturnValueOnce(chainable({ data: [] }))
      .mockReturnValueOnce(chainable({ data: [] }));
    supabaseAdminFrom.mockReturnValueOnce(seedUpsert); // language_progress upsert().select().single() -- via admin now

    await fetchProgress({ context: ctx(supabase), data: { course: "en" } });

    expect(supabase.from).toHaveBeenCalledTimes(5);
    expect(supabaseAdminFrom).toHaveBeenNthCalledWith(1, "language_progress");
    const upsertPayload = seedUpsert.calls.find((c) => c.method === "upsert")?.args[0] as Record<
      string,
      unknown
    >;
    expect(upsertPayload).toMatchObject({
      user_id: USER_ID,
      language: "en",
      xp: 500,
      cefr_level: "B1",
      league_tier: "ruby",
    });
  });

  it("starts a first-time non-'en' course fresh, ignoring the legacy row", async () => {
    const supabase = createSupabaseMock();
    const seedUpsert = chainable({ data: { xp: 0, cefr_level: "A1", league_tier: "bronze" } });
    supabase.from
      .mockReturnValueOnce(chainable({ data: { xp: 500, cefr_level: "B1", league_tier: "ruby" } })) // legacy user_progress select
      .mockReturnValueOnce(chainable({ data: null })) // language_progress select: nothing yet for "fr"
      .mockReturnValueOnce(chainable({ data: [] }))
      .mockReturnValueOnce(chainable({ data: [] }))
      .mockReturnValueOnce(chainable({ data: [] }));
    supabaseAdminFrom.mockReturnValueOnce(seedUpsert);

    await fetchProgress({ context: ctx(supabase), data: { course: "fr" } });

    const upsertPayload = seedUpsert.calls.find((c) => c.method === "upsert")?.args[0] as Record<
      string,
      unknown
    >;
    expect(upsertPayload).toMatchObject({
      user_id: USER_ID,
      language: "fr",
      xp: 0,
      cefr_level: "A1",
      league_tier: "bronze",
    });
  });

  it("resolves an elapsed hearts refill timer and persists the reset", async () => {
    const supabase = createSupabaseMock();
    const pastRefill = Date.now() - 1000;
    supabase.from
      .mockReturnValueOnce(
        chainable({
          data: { xp: 0, hearts: 0, hearts_refill_at: new Date(pastRefill).toISOString() },
        }),
      )
      .mockReturnValueOnce(chainable({ data: { xp: 0, cefr_level: "A1", league_tier: "bronze" } }))
      .mockReturnValueOnce(chainable({ data: [] }))
      .mockReturnValueOnce(chainable({ data: [] }))
      .mockReturnValueOnce(chainable({ data: [] }));
    supabaseAdminFrom.mockReturnValueOnce(chainable({ data: null })); // the hearts-refill update, via admin now

    const result = await fetchProgress({ context: ctx(supabase), data: { course: "en" } });

    expect(result.hearts).toBe(5);
    expect(result.heartsRefillAt).toBeNull();
    expect(supabase.from).toHaveBeenCalledTimes(5);
    expect(supabaseAdminFrom).toHaveBeenNthCalledWith(1, "user_progress");
  });
});

describe("startLessonSession", () => {
  it("issues a token for a real lesson", async () => {
    const result = await startLessonSession({
      context: { userId: USER_ID },
      data: { lessonId: LESSON_ID, course: "en" },
    });
    expect(typeof result.token).toBe("string");
    expect(result.token.split(".")).toHaveLength(2);
  });

  it("throws for a lesson that doesn't exist", async () => {
    await expect(
      startLessonSession({
        context: { userId: USER_ID },
        data: { lessonId: "nope999", course: "en" },
      }),
    ).rejects.toThrow("Lesson not found");
  });
});

describe("completeLessonRemote", () => {
  function validToken(course: "en" | "fr" = "en") {
    return issueLessonSessionToken({ userId: USER_ID, lessonId: LESSON_ID, course });
  }

  it("pays full XP for a first-ever perfect completion and awards the perfect-lesson heart", async () => {
    const supabase = createSupabaseMock();
    supabase.from
      .mockReturnValueOnce(
        chainable({
          data: {
            streak: 0,
            longest_streak: 0,
            last_active_date: null,
            hearts: 4,
            hearts_refill_at: null,
            streak_freezes: 0,
          },
        }),
      ) // user_progress
      .mockReturnValueOnce(chainable({ data: { xp: 0, league_tier: "bronze" } })) // language_progress
      .mockReturnValueOnce(chainable({ data: null })) // existing lesson_completions row
      .mockReturnValueOnce(chainable({ data: null })) // existing activity_days row
      .mockReturnValueOnce(chainable({})) // friend_activity_events insert (xpGain > 0)
      .mockReturnValueOnce(chainable({ data: [{ correct: 8, total: 8 }] })) // lesson_completions re-read
      .mockReturnValueOnce(chainable({ data: [] })); // user_achievements re-read
    // user_progress/language_progress/lesson_completions/activity_days
    // upserts, plus the user_achievements upsert, all go via admin now.
    supabaseAdminFrom
      .mockReturnValueOnce(chainable({})) // user_progress upsert
      .mockReturnValueOnce(chainable({})) // language_progress upsert
      .mockReturnValueOnce(chainable({})) // lesson_completions upsert
      .mockReturnValueOnce(chainable({})) // activity_days upsert
      .mockReturnValueOnce(chainable({})); // user_achievements upsert

    const result = await completeLessonRemote({
      context: ctx(supabase),
      data: {
        lessonId: LESSON_ID,
        total: 8,
        missedQuestionIds: [],
        course: "en",
        sessionToken: validToken(),
      },
    });

    expect(result.xpGain).toBe(8 * 10 + 20); // computeXpGain(8, 8)
    expect(result.heartsBonus).toBe("perfect");
    expect(result.progress.hearts).toBe(5);
    // First-ever perfect completion crosses the xp_100 and perfect_1 thresholds.
    expect(result.newlyUnlocked).toEqual(expect.arrayContaining(["xp_100", "perfect_1"]));
  });

  it("pays only the XP delta on a replay that doesn't beat the previous best", async () => {
    const supabase = createSupabaseMock();
    supabase.from
      .mockReturnValueOnce(
        chainable({
          data: {
            streak: 1,
            longest_streak: 1,
            last_active_date: new Date().toISOString().slice(0, 10), // "today", so the streak stays unchanged
            hearts: 5,
            hearts_refill_at: null,
            streak_freezes: 0,
          },
        }),
      )
      .mockReturnValueOnce(chainable({ data: { xp: 100, league_tier: "bronze" } }))
      .mockReturnValueOnce(chainable({ data: { correct: 8, total: 8, xp_earned: 100 } })) // already perfect before
      .mockReturnValueOnce(chainable({ data: { xp_earned: 100 } }))
      // no friend_activity_events insert (xpGain is 0)
      .mockReturnValueOnce(chainable({ data: [{ correct: 8, total: 8 }] }))
      .mockReturnValueOnce(chainable({ data: [{ achievement_id: "first_lesson" }] }));
    // Already-unlocked "first_lesson" + no xp/league change -> no newly
    // crossed threshold, so the user_achievements upsert is skipped
    // entirely (rows.length === 0) -- only the 4 progress-table upserts run.
    supabaseAdminFrom
      .mockReturnValueOnce(chainable({}))
      .mockReturnValueOnce(chainable({}))
      .mockReturnValueOnce(chainable({}))
      .mockReturnValueOnce(chainable({}));

    const result = await completeLessonRemote({
      context: ctx(supabase),
      data: {
        lessonId: LESSON_ID,
        total: 8,
        missedQuestionIds: ["q1"], // this attempt is worse than the stored best
        course: "en",
        sessionToken: validToken(),
      },
    });

    expect(result.xpGain).toBe(0);
    expect(result.heartsBonus).toBeNull(); // gated on xpGain > 0
    expect(result.progress.xp).toBe(100); // unchanged
  });

  it("grants a full hearts refill on a streak milestone", async () => {
    // Anchor "today" once, before freezing time, and derive "yesterday"
    // from it -- a hardcoded pair of calendar-date literals only stays a
    // 1-day gap on the one real-world date they were written for.
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(new Date(today).getTime() - 86400000).toISOString().slice(0, 10);

    const supabase = createSupabaseMock();
    supabase.from
      .mockReturnValueOnce(
        chainable({
          data: {
            streak: 6,
            longest_streak: 6,
            last_active_date: yesterday,
            hearts: 2,
            hearts_refill_at: null,
            streak_freezes: 0,
          },
        }),
      )
      .mockReturnValueOnce(chainable({ data: { xp: 0, league_tier: "bronze" } }))
      .mockReturnValueOnce(chainable({ data: null }))
      .mockReturnValueOnce(chainable({ data: null }))
      .mockReturnValueOnce(chainable({})) // friend_activity_events insert (xpGain > 0)
      .mockReturnValueOnce(chainable({ data: [{ correct: 8, total: 8 }] }))
      .mockReturnValueOnce(chainable({ data: [] }));
    supabaseAdminFrom
      .mockReturnValueOnce(chainable({})) // user_progress upsert
      .mockReturnValueOnce(chainable({})) // language_progress upsert
      .mockReturnValueOnce(chainable({})) // lesson_completions upsert
      .mockReturnValueOnce(chainable({})) // activity_days upsert
      .mockReturnValueOnce(chainable({})); // user_achievements upsert (first-ever perfect completion again)

    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${today}T12:00:00Z`));
    try {
      const result = await completeLessonRemote({
        context: ctx(supabase),
        data: {
          lessonId: LESSON_ID,
          total: 8,
          missedQuestionIds: [],
          course: "en",
          sessionToken: issueLessonSessionToken({
            userId: USER_ID,
            lessonId: LESSON_ID,
            course: "en",
          }),
        },
      });
      expect(result.heartsBonus).toBe("streak");
      expect(result.progress.hearts).toBe(5);
      expect(result.progress.streak).toBe(7);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a forged or expired session token", async () => {
    const supabase = createSupabaseMock();
    await expect(
      completeLessonRemote({
        context: ctx(supabase),
        data: {
          lessonId: LESSON_ID,
          total: 8,
          missedQuestionIds: [],
          course: "en",
          sessionToken: "forged.token",
        },
      }),
    ).rejects.toThrow("Invalid or expired lesson session");
  });

  it("rejects a completion payload whose total doesn't match the real lesson", async () => {
    const supabase = createSupabaseMock();
    await expect(
      completeLessonRemote({
        context: ctx(supabase),
        data: {
          lessonId: LESSON_ID,
          total: 3, // real lesson has 8 questions
          missedQuestionIds: [],
          course: "en",
          sessionToken: validToken(),
        },
      }),
    ).rejects.toThrow("Invalid lesson completion payload");
  });
});

describe("loseHeartRemote", () => {
  // Now calls the lose_heart RPC (supabase/migrations/
  // 20260920050000_revoke_direct_gamification_writes.sql) instead of a
  // direct user_progress read+update.
  it("returns the RPC's resolved hearts count", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({ data: [{ hearts: 0, hearts_refill_at: null }], error: null });
    const result = await loseHeartRemote({ context: ctx(supabase) });
    expect(supabase.rpc).toHaveBeenCalledWith("lose_heart");
    expect(result.hearts).toBe(0);
  });

  it("throws when the RPC errors", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({ data: null, error: new Error("db down") });
    await expect(loseHeartRemote({ context: ctx(supabase) })).rejects.toThrow(
      "Could not record heart loss",
    );
  });
});

describe("restoreHeartsRemote", () => {
  it("returns the RPC's resolved hearts state", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({ data: [{ hearts: 5, hearts_refill_at: null }], error: null });
    const result = await restoreHeartsRemote({ context: ctx(supabase) });
    expect(result).toEqual({ hearts: 5, heartsRefillAt: null });
  });

  it("throws when the RPC errors", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({ data: null, error: new Error("db down") });
    await expect(restoreHeartsRemote({ context: ctx(supabase) })).rejects.toThrow(
      "Could not check hearts refill",
    );
  });
});

describe("buyHeartWithXpRemote", () => {
  it("returns the successful purchase result", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({ data: [{ ok: true, hearts: 3, xp: 450 }], error: null });
    const result = await buyHeartWithXpRemote({ context: ctx(supabase), data: { course: "en" } });
    expect(result).toEqual({ ok: true, hearts: 3, xp: 450, cost: 50 });
  });

  it("surfaces an insufficient-xp rejection from the RPC", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({
      data: [{ ok: false, reason: "insufficient-xp", hearts: 2 }],
      error: null,
    });
    const result = await buyHeartWithXpRemote({ context: ctx(supabase), data: { course: "en" } });
    expect(result).toEqual({ ok: false, reason: "insufficient-xp", hearts: 2 });
  });
});

describe("mergeGuestProgress", () => {
  it("merges guest progress into a fresh account with zero progress", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValueOnce(chainable({ data: { xp: 0, streak: 0 } })); // user_progress select (guard read)
    // The three writes (user_progress/lesson_completions/activity_days
    // upserts) all go via admin now.
    supabaseAdminFrom
      .mockReturnValueOnce(chainable({}))
      .mockReturnValueOnce(chainable({}))
      .mockReturnValueOnce(chainable({}));

    const result = await mergeGuestProgress({
      context: ctx(supabase),
      data: {
        xp: 200,
        streak: 3,
        longestStreak: 3,
        completedLessons: ["u1l1"],
        answersByLesson: { u1l1: { correct: 7, total: 8 } },
        activityDates: ["2026-09-18", "2026-09-19"],
      },
    });

    expect(result).toEqual({ merged: true });
    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(supabaseAdminFrom).toHaveBeenCalledTimes(3);
  });

  it("does not merge over an account that already has progress", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValueOnce(chainable({ data: { xp: 500, streak: 10 } }));

    const result = await mergeGuestProgress({
      context: ctx(supabase),
      data: {
        xp: 200,
        streak: 3,
        longestStreak: 3,
        completedLessons: [],
        answersByLesson: {},
        activityDates: [],
      },
    });

    expect(result).toEqual({ merged: true });
    expect(supabase.from).toHaveBeenCalledTimes(1); // only the guard read, no writes
  });
});

describe("setCefrLevel", () => {
  // Now calls the set_cefr_level RPC (supabase/migrations/
  // 20260920050000_revoke_direct_gamification_writes.sql) instead of a
  // direct language_progress upsert.
  it("calls set_cefr_level and echoes the level back", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({ data: null, error: null });
    const result = await setCefrLevel({
      context: ctx(supabase),
      data: { level: "B2", course: "en" },
    });
    expect(supabase.rpc).toHaveBeenCalledWith("set_cefr_level", {
      _language: "en",
      _level: "B2",
    });
    expect(result).toEqual({ cefrLevel: "B2" });
  });

  it("throws when the RPC errors", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({ data: null, error: new Error("db down") });
    await expect(
      setCefrLevel({ context: ctx(supabase), data: { level: "B2", course: "en" } }),
    ).rejects.toThrow("Could not set CEFR level");
  });
});

describe("savePlacementResult", () => {
  // Now calls the save_placement_result RPC (same migration as
  // setCefrLevel above), which returns the server-set timestamp directly.
  it("calls save_placement_result and returns its timestamp", async () => {
    const supabase = createSupabaseMock();
    const takenAt = "2026-09-20T12:00:00.000Z";
    supabase.rpc.mockResolvedValue({ data: takenAt, error: null });
    const result = await savePlacementResult({
      context: ctx(supabase),
      data: { level: "A2", score: 73, course: "en" },
    });
    expect(supabase.rpc).toHaveBeenCalledWith("save_placement_result", {
      _language: "en",
      _level: "A2",
      _score: 73,
    });
    expect(result).toEqual({
      cefrLevel: "A2",
      placementLevel: "A2",
      placementScore: 73,
      placementTakenAt: takenAt,
    });
  });

  it("throws when the RPC errors", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({ data: null, error: new Error("db down") });
    await expect(
      savePlacementResult({
        context: ctx(supabase),
        data: { level: "A2", score: 73, course: "en" },
      }),
    ).rejects.toThrow("Could not save placement result");
  });
});
