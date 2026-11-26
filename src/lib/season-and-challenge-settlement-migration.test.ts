import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, buildFullSchema } from "./__testutils__/full-schema";
import {
  computePromotions,
  rankCohort,
} from "../../supabase/functions/get-season-status/season-math";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("season and challenge settlement (real Postgres, whole migration history)", () => {
  let db: PGlite;
  let nextUser = 1;
  beforeAll(async () => {
    db = await buildFullSchema();
  }, 300_000);
  afterAll(async () => {
    await db.close();
  });

  async function user(): Promise<string> {
    const id = uid(nextUser++);
    await db.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [id, `${id}@x.test`]);
    return id;
  }
  const monday = async (weeksAgo: number) =>
    (
      await db.query<{ d: string }>(
        `SELECT (current_date - (extract(isodow from current_date)::int - 1) - 7 * $1::int)::text AS d`,
        [weeksAgo],
      )
    ).rows[0]!.d;

  /** A cohort of `size` members whose XP for `week` is size-i, so member 0 ranks first. Returns the ids in rank order. */
  async function cohort(size: number, week: string, division: number, resolved = false) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO public.season_cohorts (division, week_start, resolved_at) VALUES ($1, $2, ${resolved ? "now()" : "NULL"}) RETURNING id`,
      [division, week],
    );
    const id = rows[0]!.id;
    const members: string[] = [];
    for (let i = 0; i < size; i++) {
      const u = await user();
      members.push(u);
      await db.query(
        "INSERT INTO public.season_cohort_members (cohort_id, user_id) VALUES ($1, $2)",
        [id, u],
      );
      await db.query(
        "INSERT INTO public.activity_days (user_id, day, xp_earned) VALUES ($1, $2, $3)",
        [u, week, (size - i) * 10],
      );
    }
    return { id, members };
  }
  const placements = async (week: string) =>
    (
      await db.query<{
        user_id: string;
        division: number;
        rank_in_cohort: number;
        cohort_size: number;
      }>(
        "SELECT user_id, division, rank_in_cohort, cohort_size FROM public.season_placements WHERE week_start = $1 ORDER BY rank_in_cohort",
        [week],
      )
    ).rows;

  describe("seasons", () => {
    it("ranks and places like season-math.ts, for every cohort size", async () => {
      for (const [k, size] of [1, 2, 3, 5, 6, 7, 12, 30].entries()) {
        const week = await monday(10 + k);
        const division = (k % 5) + 1;
        const { id, members } = await cohort(size, week, division);
        const ran = await db.query<{ r: boolean }>("SELECT public.resolve_season_cohort($1) AS r", [
          id,
        ]);
        expect(ran.rows[0]!.r).toBe(true);
        const expected = computePromotions(
          rankCohort(members.map((m, i) => ({ userId: m, xp: (size - i) * 10 }))),
          division,
        );
        const got = await placements(week);
        expect(got.map((p) => [p.user_id, p.division])).toEqual(
          expected.map((p) => [p.userId, p.newDivision]),
        );
        expect(got.every((p) => p.cohort_size === size)).toBe(true);
        const row = await db.query<{ resolved_at: string | null }>(
          "SELECT resolved_at FROM public.season_cohorts WHERE id = $1",
          [id],
        );
        expect(row.rows[0]!.resolved_at).not.toBeNull();
      }
    }, 120_000);

    it("a failing placement insert leaves the cohort unresolved (it used to be marked resolved first)", async () => {
      const week = await monday(30);
      const { id } = await cohort(3, week, 2);
      await db.exec(`
        CREATE FUNCTION public.fail_placement() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'injected placement failure'; END; $$;
        CREATE TRIGGER fail_placement BEFORE INSERT ON public.season_placements
          FOR EACH ROW EXECUTE FUNCTION public.fail_placement();
      `);
      try {
        await expect(db.query("SELECT public.resolve_season_cohort($1)", [id])).rejects.toThrow(
          /injected placement failure/,
        );
      } finally {
        await db.exec("DROP TRIGGER fail_placement ON public.season_placements");
      }
      const row = await db.query<{ resolved_at: string | null }>(
        "SELECT resolved_at FROM public.season_cohorts WHERE id = $1",
        [id],
      );
      expect(row.rows[0]!.resolved_at).toBeNull();
      expect(await placements(week)).toHaveLength(0);
      // The next run, once the cause is gone, settles it.
      expect(
        (await db.query<{ r: boolean }>("SELECT public.resolve_season_cohort($1) AS r", [id]))
          .rows[0]!.r,
      ).toBe(true);
      expect(await placements(week)).toHaveLength(3);
    });

    it("is idempotent, and completes a cohort that was marked resolved with placements missing", async () => {
      const week = await monday(31);
      const { id } = await cohort(4, week, 3);
      expect(
        (await db.query<{ r: boolean }>("SELECT public.resolve_season_cohort($1) AS r", [id]))
          .rows[0]!.r,
      ).toBe(true);
      const first = await placements(week);
      expect(
        (await db.query<{ r: boolean }>("SELECT public.resolve_season_cohort($1) AS r", [id]))
          .rows[0]!.r,
      ).toBe(false);
      expect(await placements(week)).toEqual(first);

      const week2 = await monday(32);
      const broken = await cohort(4, week2, 3, true); // the old failure: resolved_at set, no placements
      expect(await placements(week2)).toHaveLength(0);
      expect(
        (
          await db.query<{ r: boolean }>("SELECT public.resolve_season_cohort($1) AS r", [
            broken.id,
          ])
        ).rows[0]!.r,
      ).toBe(true);
      expect(await placements(week2)).toHaveLength(4);
    });

    it("the sweep settles every finished unresolved cohort and leaves this week's alone", async () => {
      const thisWeek = await monday(0);
      const a = await cohort(2, await monday(40), 1);
      const b = await cohort(3, await monday(41), 4);
      const current = await cohort(2, thisWeek, 1);
      const done = await db.query<{ n: number }>(
        "SELECT public.resolve_closed_season_cohorts() AS n",
      );
      expect(done.rows[0]!.n).toBeGreaterThanOrEqual(2);
      for (const c of [a, b]) {
        const r = await db.query(
          "SELECT 1 FROM public.season_cohorts WHERE id = $1 AND resolved_at IS NOT NULL",
          [c.id],
        );
        expect(r.rows).toHaveLength(1);
      }
      const cur = await db.query("SELECT resolved_at FROM public.season_cohorts WHERE id = $1", [
        current.id,
      ]);
      expect(cur.rows[0]).toMatchObject({ resolved_at: null });
      expect(
        (await db.query<{ n: number }>("SELECT public.resolve_closed_season_cohorts() AS n"))
          .rows[0]!.n,
      ).toBe(0);
    }, 60_000);

    it("the functions are not callable by a client role", async () => {
      await expect(
        asUser(db, uid(999), () => db.query("SELECT public.resolve_closed_season_cohorts()")),
      ).rejects.toThrow(/permission denied/);
    });
  });

  describe("weekly challenges", () => {
    /** Lessons completed last week (all perfect) and a study day on each of its 7 days: every template is satisfied. */
    async function busyLastWeek(u: string, language: string | null, lessons = 12) {
      const prev = await monday(1);
      if (language) {
        await db.query(
          "INSERT INTO public.language_progress (user_id, language, xp) VALUES ($1, $2, 0)",
          [u, language],
        );
      }
      for (let i = 0; i < lessons; i++) {
        await db.query(
          `INSERT INTO public.lesson_completions (user_id, lesson_id, correct, total, xp_earned, completed_at, language)
           VALUES ($1, $2, 5, 5, 10, ($3::date + 1 + (${i} % 5))::timestamptz, $4)`,
          [u, `L${i}`, prev, language ?? "en"],
        );
      }
      for (let d = 0; d < 7; d++) {
        await db.query(
          "INSERT INTO public.activity_days (user_id, day, xp_earned) VALUES ($1, ($2::date + $3::int), 10)",
          [u, prev, d],
        );
      }
      return prev;
    }
    const xp = async (u: string, lang: string) =>
      (
        await db.query<{ xp: number }>(
          "SELECT xp FROM public.language_progress WHERE user_id = $1 AND language = $2",
          [u, lang],
        )
      ).rows[0]!.xp;
    const receipts = async (u: string) =>
      (await db.query("SELECT 1 FROM public.challenge_completions WHERE user_id = $1", [u])).rows
        .length;

    it("pays last week's eligible challenges in the sweep, once", async () => {
      const u = await user();
      await busyLastWeek(u, "fr");
      const first = await db.query<{ n: number }>(
        "SELECT public.settle_closed_weekly_challenges() AS n",
      );
      expect(first.rows[0]!.n).toBeGreaterThanOrEqual(3);
      expect(await receipts(u)).toBe(3);
      expect(await xp(u, "fr")).toBe(300);
      await db.query("SELECT public.settle_closed_weekly_challenges()");
      expect(await xp(u, "fr")).toBe(300);
      expect(await receipts(u)).toBe(3);
    });

    it("writes no receipt when there is no row to pay, and pays once there is", async () => {
      const u = await user();
      const prev = await busyLastWeek(u, null);
      await db.query("SELECT public.settle_closed_weekly_challenges()");
      expect(await receipts(u)).toBe(0);
      void prev;
      await db.query(
        "INSERT INTO public.language_progress (user_id, language, xp) VALUES ($1, 'en', 0)",
        [u],
      );
      await db.query("SELECT public.settle_closed_weekly_challenges()");
      expect(await receipts(u)).toBe(3);
      expect(await xp(u, "en")).toBe(300);
    });

    it("counts a week's progress inside that week only", async () => {
      const u = await user();
      await db.query(
        "INSERT INTO public.language_progress (user_id, language, xp) VALUES ($1, 'en', 0)",
        [u],
      );
      // 12 lessons, but spread over the week before last and the one after: neither week alone reaches a threshold.
      const prev = await monday(1);
      for (let i = 0; i < 12; i++) {
        const offset = i < 6 ? -7 : 1;
        await db.query(
          `INSERT INTO public.lesson_completions (user_id, lesson_id, correct, total, xp_earned, completed_at, language)
           VALUES ($1, $2, 1, 5, 10, ($3::date + $4::int)::timestamptz, 'en')`,
          [u, `S${i}`, prev, offset],
        );
      }
      await db.query("SELECT public.settle_closed_weekly_challenges()");
      // 6 lessons last week reach only the 3- and 5-lesson challenges, when those were drawn: never the 10.
      const rows = await db.query<{ template_id: string }>(
        "SELECT template_id FROM public.challenge_completions WHERE user_id = $1",
        [u],
      );
      expect(rows.rows.map((r) => r.template_id)).not.toContain("lessons_10");
      expect(rows.rows.length).toBeLessThanOrEqual(2);
    });

    it("get_weekly_challenges pays a learner who has a row, and writes no receipt for one who does not", async () => {
      const withRow = await user();
      const without = await user();
      await db.query(
        "INSERT INTO public.language_progress (user_id, language, xp) VALUES ($1, 'en', 0)",
        [withRow],
      );
      for (const u of [withRow, without]) {
        for (let i = 0; i < 12; i++) {
          await db.query(
            `INSERT INTO public.lesson_completions (user_id, lesson_id, correct, total, xp_earned, completed_at, language)
             VALUES ($1, $2, 5, 5, 10, now(), 'en')`,
            [u, `G${i}`],
          );
        }
        for (let d = 0; d < 7; d++) {
          // The current week's days can lie in the future: study_every_day just needs 7 distinct days since Monday.
          await db.query(
            `INSERT INTO public.activity_days (user_id, day, xp_earned)
             VALUES ($1, (current_date - (extract(isodow from current_date)::int - 1) + $2::int), 10)`,
            [u, d],
          );
        }
      }
      await asUser(db, withRow, () => db.query("SELECT * FROM public.get_weekly_challenges()"));
      await asUser(db, without, () => db.query("SELECT * FROM public.get_weekly_challenges()"));
      expect(await receipts(withRow)).toBe(3);
      expect(await xp(withRow, "en")).toBe(300);
      expect(await receipts(without)).toBe(0);
    });
  });
});
