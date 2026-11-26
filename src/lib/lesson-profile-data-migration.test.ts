import { readFileSync } from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { buildFullSchema, MIGRATIONS_DIR } from "./__testutils__/full-schema";

const FILE = "20261128160000_lesson_profile_data_in_transaction.sql";
const U1 = "00000000-0000-4000-8000-0000000000a1";
const TODAY = "2026-11-20";

const nextOf = (profile?: unknown) => ({
  streak: 1,
  longest_streak: 1,
  last_active_date: TODAY,
  hearts: 5,
  hearts_refill_at: null,
  streak_freezes: 0,
  day_basis: "local",
  xp: 20,
  league_tier: "bronze",
  best_correct: 5,
  total: 5,
  best_xp: 20,
  day_xp: 20,
  ...(profile === undefined ? {} : { profile }),
});

describe("a lesson's profile data is booked in the completion's own transaction (real Postgres)", () => {
  let db: PGlite;
  afterEach(async () => {
    await db.close();
  });

  async function setup(skipMigration = false) {
    db = await buildFullSchema({ skip: skipMigration ? [FILE] : [] });
    await db.query("INSERT INTO auth.users (id, email) VALUES ($1, 'a@x.test')", [U1]);
  }
  const apply = (lessonId: string, next: unknown) =>
    db.query<{ r: { status: string } }>(
      `SELECT public.apply_lesson_completion($1::uuid, 'en', $2, 'A1', $3::date,
         jsonb_build_object(
           'p_updated_at', (SELECT updated_at FROM public.user_progress WHERE user_id = $1::uuid),
           'lp_updated_at', (SELECT updated_at FROM public.language_progress WHERE user_id = $1::uuid AND language = 'en'),
           'completion_xp', (SELECT xp_earned FROM public.lesson_completions WHERE user_id = $1::uuid AND lesson_id = $2),
           'day_xp', (SELECT xp_earned FROM public.activity_days WHERE user_id = $1::uuid AND day = $3::date)),
         $4::jsonb, '[]'::jsonb, '[]'::jsonb) AS r`,
      [U1, lessonId, TODAY, JSON.stringify(next)],
    );
  const learning = async () =>
    (
      await db.query<{ day: string; lesson_seconds: number }>(
        "SELECT day::text, lesson_seconds FROM public.learning_days WHERE user_id = $1",
        [U1],
      )
    ).rows;
  const skills = async () =>
    (
      await db.query<{ skill: string; right_answers: number; total_answers: number }>(
        "SELECT skill, right_answers, total_answers FROM public.skill_days WHERE user_id = $1 ORDER BY skill",
        [U1],
      )
    ).rows;
  const lessons = async () =>
    (await db.query("SELECT 1 FROM public.lesson_completions WHERE user_id = $1", [U1])).rows
      .length;

  const profile = {
    lesson_seconds: 95,
    skills: [
      { skill: "vocabulary", right: 3, total: 4 },
      { skill: "grammar", right: 1, total: 1 },
    ],
  };

  it("books the learning time and the skill results with the lesson, and adds up across lessons", async () => {
    await setup();
    expect((await apply("u1l1", nextOf(profile))).rows[0]!.r.status).toBe("applied");
    expect(await learning()).toEqual([{ day: TODAY, lesson_seconds: 95 }]);
    expect(await skills()).toEqual([
      { skill: "grammar", right_answers: 1, total_answers: 1 },
      { skill: "vocabulary", right_answers: 3, total_answers: 4 },
    ]);
    await apply("u1l2", nextOf(profile));
    expect((await learning())[0]!.lesson_seconds).toBe(190);
  }, 300_000);

  it("the old function booked nothing from the same call (this is what was missing)", async () => {
    await setup(true);
    await apply("u1l1", nextOf(profile));
    expect(await lessons()).toBe(1);
    expect(await learning()).toEqual([]);
    expect(await skills()).toEqual([]);
  }, 300_000);

  it("a caller that sends no profile books nothing (an older deploy still calls the two functions itself)", async () => {
    await setup();
    await apply("u1l1", nextOf());
    expect(await lessons()).toBe(1);
    expect(await learning()).toEqual([]);
  }, 300_000);

  it("is atomic: if the profile write fails the lesson is not saved either, so nothing is half-booked", async () => {
    await setup();
    await db.exec(`
      CREATE FUNCTION public.fail_skill_day() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'injected skill_days failure'; END; $$;
      CREATE TRIGGER fail_skill_day BEFORE INSERT ON public.skill_days
        FOR EACH ROW EXECUTE FUNCTION public.fail_skill_day();
    `);
    await expect(apply("u1l1", nextOf(profile))).rejects.toThrow(/injected skill_days failure/);
    expect(await lessons()).toBe(0);
    expect(await learning()).toEqual([]);
  }, 300_000);

  it("skips a malformed entry and clamps the seconds, without failing the lesson", async () => {
    await setup();
    await apply(
      "u1l1",
      nextOf({
        lesson_seconds: 999999,
        skills: [
          { skill: "vocabulary", right: 9, total: 4 },
          { skill: "cooking", right: 1, total: 1 },
          { skill: "grammar", right: "1", total: 1 },
          { skill: "reading", right: 2, total: 3 },
        ],
      }),
    );
    expect(await lessons()).toBe(1);
    expect((await learning())[0]!.lesson_seconds).toBe(3600);
    expect(await skills()).toEqual([{ skill: "reading", right_answers: 2, total_answers: 3 }]);
  }, 300_000);

  it("the backfill gives every lesson-day without a learning_days row one, and running it again changes nothing", async () => {
    await setup(true);
    await apply("u1l1", nextOf());
    await db.query(
      `INSERT INTO public.lesson_completions (user_id, lesson_id, correct, total, xp_earned, completed_at, language)
       VALUES ($1, 'old1', 3, 5, 10, '2026-11-10 12:00:00+00', 'en'), ($1, 'old2', 4, 5, 10, '2026-11-11 12:00:00+00', 'en')`,
      [U1],
    );
    // One of those days already has minutes: the backfill must not touch it.
    await db.query(
      "INSERT INTO public.learning_days (user_id, day, lesson_seconds) VALUES ($1, '2026-11-11', 240)",
      [U1],
    );
    const sql = readFileSync(path.join(MIGRATIONS_DIR, FILE), "utf8");
    await db.exec(sql);
    const days = (await learning()).map((r) => [r.day, r.lesson_seconds]).sort();
    expect(days).toEqual([
      ["2026-11-10", 0],
      ["2026-11-11", 240],
      [expect.any(String), 0],
    ]);
    const before = JSON.stringify(await learning());
    await db.exec(sql.slice(sql.indexOf("-- ---- backfill")));
    expect(JSON.stringify(await learning())).toBe(before);
  }, 300_000);
});
