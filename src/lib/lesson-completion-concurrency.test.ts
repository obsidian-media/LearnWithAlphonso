import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

/**
 * apply_lesson_completion (20261014100300) under real parallel transactions: no lost XP, no double XP. PGlite has one
 * connection, so this runs only against the local Supabase stack the e2e-signed-in CI job starts from the
 * migrations; every RPC below is its own HTTP request and its own Postgres transaction, sent all at once. Run it by
 * hand with `supabase start`, then E2E_SUPABASE_URL / E2E_SUPABASE_SERVICE_ROLE_KEY from `supabase status -o env`.
 *
 * The function is optimistic: the caller sends the snapshot it computed from, and a stale snapshot gets
 * { status: "conflict" } so the caller rereads, recomputes and retries (complete-lesson's handler does exactly
 * that). Two properties follow, one test each. Neither depends on timing: the outcome is the same whichever
 * transaction wins, so the test cannot flake on scheduling, only fail on a real defect.
 *
 * Skipped elsewhere; when the job says the stack is required (E2E_REQUIRED=1) a missing URL is a failure, so the job
 * cannot go green having tested nothing.
 */
const url = process.env.E2E_SUPABASE_URL;
const serviceKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
const required = process.env.E2E_REQUIRED === "1";

type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: { status?: string } | null; error: { message: string } | null }>;

const XP = 10;
const TODAY = "2026-11-12";

describe("lesson completion under parallel calls (local Supabase stack)", () => {
  it.runIf(required && !(url && serviceKey))("has the stack it was told to expect", () => {
    expect(url && serviceKey).toBeTruthy();
  });

  async function withUser(
    run: (admin: ReturnType<typeof createClient>, userId: string) => Promise<void>,
  ) {
    const admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: created, error } = await admin.auth.admin.createUser({
      email: `completion-race-${crypto.randomUUID()}@example.com`,
      password: `pw-${crypto.randomUUID()}`,
      email_confirm: true,
    });
    expect(error).toBeNull();
    const userId = created.user!.id;
    try {
      await run(admin, userId);
    } finally {
      await admin.auth.admin.deleteUser(userId);
    }
  }

  /** What the handler reads before it computes: the four values apply_lesson_completion checks. */
  async function snapshot(
    admin: ReturnType<typeof createClient>,
    userId: string,
    lessonId: string,
  ) {
    const one = async (table: string, cols: string, match: Record<string, string>) => {
      let q = admin.from(table).select(cols).eq("user_id", userId);
      for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
      const { data, error } = await q.maybeSingle();
      expect(error).toBeNull();
      return data as Record<string, unknown> | null;
    };
    const p = await one("user_progress", "updated_at", {});
    const lp = await one("language_progress", "updated_at, xp", { language: "en" });
    const comp = await one("lesson_completions", "xp_earned", { lesson_id: lessonId });
    const day = await one("activity_days", "xp_earned", { day: TODAY });
    return {
      lpXp: (lp?.xp as number | undefined) ?? 0,
      dayXp: (day?.xp_earned as number | undefined) ?? 0,
      expected: {
        p_updated_at: p?.updated_at ?? null,
        lp_updated_at: lp?.updated_at ?? null,
        completion_xp: comp?.xp_earned ?? null,
        day_xp: day?.xp_earned ?? null,
      },
    };
  }

  function args(userId: string, lessonId: string, s: Awaited<ReturnType<typeof snapshot>>) {
    return {
      _user_id: userId,
      _course: "en",
      _lesson_id: lessonId,
      _level: "A1",
      _today: TODAY,
      _expected: s.expected,
      _next: {
        streak: 1,
        longest_streak: 1,
        last_active_date: TODAY,
        hearts: 5,
        hearts_refill_at: null,
        streak_freezes: 0,
        xp: s.lpXp + XP,
        league_tier: "bronze",
        best_correct: 9,
        total: 10,
        best_xp: XP,
        day_xp: s.dayXp + XP,
      },
      _missed_question_ids: [],
      _activity_events: [],
    };
  }

  it.skipIf(!(url && serviceKey))(
    "twenty different lessons completed at once, each retrying on a conflict, lose no XP",
    async () => {
      await withUser(async (admin, userId) => {
        const rpc = admin.rpc.bind(admin) as unknown as Rpc;
        const n = 20;
        // The handler's loop: read, compute from what was read, apply; on "conflict" read again and retry.
        const complete = async (lessonId: string) => {
          for (let attempt = 0; attempt < 200; attempt++) {
            const s = await snapshot(admin, userId, lessonId);
            const { data, error } = await rpc("apply_lesson_completion", args(userId, lessonId, s));
            expect(error).toBeNull();
            if (data?.status === "applied") return attempt;
            expect(data?.status).toBe("conflict");
          }
          throw new Error(`${lessonId} never applied`);
        };
        await Promise.all(Array.from({ length: n }, (_, i) => complete(`race-lesson-${i}`)));

        const lp = await admin
          .from("language_progress")
          .select("xp")
          .eq("user_id", userId)
          .eq("language", "en")
          .single();
        expect(lp.data).toEqual({ xp: n * XP });
        const day = await admin
          .from("activity_days")
          .select("xp_earned")
          .eq("user_id", userId)
          .eq("day", TODAY)
          .single();
        expect(day.data).toEqual({ xp_earned: n * XP });
        const comps = await admin
          .from("lesson_completions")
          .select("lesson_id")
          .eq("user_id", userId);
        expect(comps.data).toHaveLength(n);
      });
    },
    120_000,
  );

  it.skipIf(!(url && serviceKey))(
    "the same lesson sent ten times from one snapshot is applied once, never twice",
    async () => {
      await withUser(async (admin, userId) => {
        const rpc = admin.rpc.bind(admin) as unknown as Rpc;
        const lessonId = "race-lesson-double";
        const s = await snapshot(admin, userId, lessonId);
        const results = await Promise.all(
          Array.from({ length: 10 }, () =>
            rpc("apply_lesson_completion", args(userId, lessonId, s)),
          ),
        );
        expect(results.map((r) => r.error)).toEqual(Array(10).fill(null));
        const statuses = results.map((r) => r.data?.status).sort();
        expect(statuses).toEqual(["applied", ...Array(9).fill("conflict")]);

        const lp = await admin
          .from("language_progress")
          .select("xp")
          .eq("user_id", userId)
          .eq("language", "en")
          .single();
        expect(lp.data).toEqual({ xp: XP });
        const day = await admin
          .from("activity_days")
          .select("xp_earned")
          .eq("user_id", userId)
          .eq("day", TODAY)
          .single();
        expect(day.data).toEqual({ xp_earned: XP });
      });
    },
    60_000,
  );
});
