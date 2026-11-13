import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { PODCAST_QUIZZES } from "@/data/podcast-quizzes";
import { buildPodcastQuizSeedSql } from "./podcast-quiz-seed";

const root = process.cwd();
const read = (f: string) => readFileSync(path.join(root, "supabase/migrations", f), "utf8");
const hitsSql = read("20261104100100_lesson_completion_hits.sql");
const quizSql = read("20261104100200_podcast_quiz.sql");
const seedSql = read("20261104100300_podcast_quiz_seed.sql");
const REVIEW_FILE = "20261112140000_podcast_quiz_review.sql";
const reviewSql = read(REVIEW_FILE);
const LOCAL_DAYS_FILE = "20261114100000_local_days.sql";
const localDaysSql = read(LOCAL_DAYS_FILE);
const atomicSql = read("20261014100300_atomic_lesson_completion.sql");

const U1 = "00000000-0000-4000-8000-000000000001";
const U2 = "00000000-0000-4000-8000-000000000002";
const AT = "2026-11-04T12:00:00Z";
const DAY = "2026-11-04";
// Anything that reads lesson_completion_hits, or relies on a slot still being counted, runs at RECENT instead of AT:
// consume_lesson_completion_slot prunes rows older than two days by the database's real now(), so a hit dated AT is
// deleted the moment it is inserted once AT is two days past, and those assertions would fail or pass vacuously.
// AT stays for the day and streak logic, which needs fixed calendar dates and never reads the hits table.
const RECENT_MS = Math.floor(Date.now() / 1000) * 1000 - 60 * 60_000; // an hour ago, whole seconds
const RECENT = new Date(RECENT_MS).toISOString();

describe("podcast quiz seed migration", () => {
  it("is exactly what the generator builds from src/data/podcast-quizzes.ts", () => {
    expect(seedSql).toBe(buildPodcastQuizSeedSql(PODCAST_QUIZZES));
  });

  it("never ships the transcript excerpts", () => {
    for (const quiz of PODCAST_QUIZZES) {
      for (const question of quiz.questions) {
        expect(seedSql).not.toContain(question.evidence);
      }
    }
  });
});

describe("podcast quiz schema carries the repo's grant rules", () => {
  it("grants the awards table a read for the owner only and no write to any client role", () => {
    expect(quizSql).toMatch(/GRANT SELECT ON public\.podcast_quiz_awards TO authenticated;/);
    expect(quizSql).toMatch(
      /podcast_quiz_awards_select_own[\s\S]*?USING \(user_id = auth\.uid\(\)\)/,
    );
    expect(quizSql).not.toMatch(
      /GRANT[^;]*(INSERT|UPDATE|DELETE|ALL)[^;]*podcast_quiz_awards[^;]*TO[^;]*(authenticated|anon|PUBLIC)/i,
    );
  });
  it("is versioned after the completion-slot migration it calls", () => {
    expect("20261104100200_podcast_quiz.sql" > "20261104100100_lesson_completion_hits.sql").toBe(
      true,
    );
  });
});

describe("podcast quiz (real Postgres)", () => {
  let db: PGlite;
  // Episode ids by slug.
  const E: Record<string, string> = {};

  async function setup() {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.uid', true), '')::uuid $$;
      INSERT INTO auth.users VALUES ('${U1}'), ('${U2}');
      CREATE TABLE public.podcast_folders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL);
      CREATE TABLE public.podcast_episodes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), folder_id uuid NOT NULL REFERENCES public.podcast_folders(id),
        slug text NOT NULL, course text, published boolean NOT NULL DEFAULT false);
      CREATE TABLE public.language_progress (
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, language text NOT NULL,
        xp integer NOT NULL DEFAULT 0, league_tier text NOT NULL DEFAULT 'bronze',
        updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, language));
      CREATE TABLE public.user_progress (
        user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, streak integer NOT NULL DEFAULT 0,
        longest_streak integer NOT NULL DEFAULT 0, last_active_date date, hearts integer NOT NULL DEFAULT 5,
        hearts_refill_at timestamptz, streak_freezes integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE public.activity_days (
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, day date NOT NULL,
        xp_earned integer NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day));
      -- Tables the local-days migration touches. learner_time_zones is as 20261107120000 made it (the zone is validated on
      -- write there; the tests below also insert a bad one directly to prove the fallback).
      CREATE TABLE public.learner_time_zones (
        user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, time_zone text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE public.learning_days (
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, day date NOT NULL,
        lesson_seconds integer NOT NULL DEFAULT 0, practice_seconds integer NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, day));
      CREATE TABLE public.skill_days (
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, day date NOT NULL, skill text NOT NULL,
        right_answers integer NOT NULL DEFAULT 0, total_answers integer NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, day, skill));
      CREATE TABLE public.speech_days (
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, day date NOT NULL,
        speech_seconds integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, day));
      CREATE TABLE public.lesson_completions (
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, lesson_id text NOT NULL,
        language text NOT NULL, correct integer NOT NULL, total integer NOT NULL, xp_earned integer NOT NULL,
        PRIMARY KEY (user_id, lesson_id));
      CREATE TABLE public.friend_activity_events (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_id uuid NOT NULL, event_type text NOT NULL, payload jsonb);
      -- review_items as it stands before the new migration: the columns and constraints of the base table plus
      -- 20260908020628 (language), 20260912040533 (unique with language), 20260920040000 (weakness) and
      -- 20261005120000 (saved_word, which also fixed the constraint names used below).
      CREATE TABLE public.review_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        item_key text NOT NULL, lesson_id text NOT NULL, level text NOT NULL DEFAULT 'A1',
        ease real NOT NULL DEFAULT 2.5, interval_days integer NOT NULL DEFAULT 0,
        repetitions integer NOT NULL DEFAULT 0, lapses integer NOT NULL DEFAULT 0,
        due_on date NOT NULL DEFAULT CURRENT_DATE, last_reviewed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
        language text NOT NULL DEFAULT 'en',
        source text NOT NULL DEFAULT 'lesson',
        weakness_label text, weakness_display text, prompt text, choices jsonb, answer_index integer, explanation text,
        saved_word text, saved_context text,
        CONSTRAINT review_items_user_id_item_key_language_key UNIQUE (user_id, item_key, language),
        CONSTRAINT review_items_source_check CHECK (source IN ('lesson', 'weakness', 'saved_word')),
        CONSTRAINT weakness_shape_matches_source CHECK (
          (source = 'lesson') OR
          (source = 'weakness' AND weakness_label IS NOT NULL AND weakness_display IS NOT NULL
             AND prompt IS NOT NULL AND choices IS NOT NULL AND answer_index IS NOT NULL) OR
          (source = 'saved_word' AND saved_word IS NOT NULL AND saved_context IS NOT NULL
             AND prompt IS NOT NULL AND choices IS NOT NULL AND answer_index IS NOT NULL
             AND explanation IS NOT NULL))
      );
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_items TO authenticated;
      GRANT ALL ON public.review_items TO service_role;
      ALTER TABLE public.review_items ENABLE ROW LEVEL SECURITY;
      CREATE POLICY ri_own_all ON public.review_items FOR ALL TO authenticated
        USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    `);
    for (const quiz of PODCAST_QUIZZES) {
      const f = await db.query<{ id: string }>(
        "INSERT INTO public.podcast_folders (slug) VALUES ($1) RETURNING id",
        [quiz.folder],
      );
      const e = await db.query<{ id: string }>(
        "INSERT INTO public.podcast_episodes (folder_id, slug, course, published) VALUES ($1,$2,$3,true) RETURNING id",
        [f.rows[0]!.id, quiz.slug, quiz.course],
      );
      E[quiz.slug] = e.rows[0]!.id;
    }
    await db.exec(hitsSql);
    await db.exec(quizSql);
    await db.exec(seedSql);
    await db.exec(reviewSql);
    await db.exec(atomicSql);
    await db.exec(localDaysSql);
  }

  beforeEach(async () => {
    await setup();
  });

  const COFFEE = "ordering-coffee-v2";
  const answersFor = (slug: string, wrong: number) => {
    const quiz = PODCAST_QUIZZES.find((x) => x.slug === slug)!;
    return quiz.questions.map((qq, i) => ({
      questionId: qq.id,
      choiceIndex: i < wrong ? (qq.answerIndex + 1) % qq.choices.length : qq.answerIndex,
    }));
  };
  async function submit(
    user: string,
    slug: string,
    answers: unknown,
    limit = 60,
    at = AT,
    completedAt: string | null = null,
  ) {
    const r = await db.query<{ r: Record<string, unknown> }>(
      "SELECT public.submit_podcast_quiz($1::uuid,$2::uuid,$3::jsonb,$4::timestamptz,$5::timestamptz,$6::integer) AS r",
      [user, E[slug], JSON.stringify(answers), at, completedAt, limit],
    );
    return r.rows[0]!.r;
  }
  const xp = async (user: string, lang: string) =>
    (
      await db.query<{ xp: number }>(
        "SELECT xp FROM public.language_progress WHERE user_id=$1 AND language=$2",
        [user, lang],
      )
    ).rows[0]?.xp ?? 0;
  const hits = async () =>
    (await db.query<{ n: number }>("SELECT count(*)::int n FROM public.lesson_completion_hits"))
      .rows[0]!.n;

  it("seeds every authored question, with the right answer inside the choices", async () => {
    for (const quiz of PODCAST_QUIZZES) {
      const r = await db.query<{ id: string; answer_index: number; n: number }>(
        "SELECT id, answer_index, jsonb_array_length(choices) n FROM public.podcast_quiz_questions WHERE episode_id=$1 ORDER BY sort_order",
        [E[quiz.slug]],
      );
      expect(r.rows.map((x) => x.id)).toEqual(quiz.questions.map((x) => x.id));
      expect(r.rows.map((x) => x.answer_index)).toEqual(quiz.questions.map((x) => x.answerIndex));
    }
  });

  it("is idempotent: running the seed again changes nothing", async () => {
    await db.exec(seedSql);
    const n = await db.query<{ n: number }>(
      "SELECT count(*)::int n FROM public.podcast_quiz_questions",
    );
    expect(n.rows[0]!.n).toBe(PODCAST_QUIZZES.reduce((s, x) => s + x.questions.length, 0));
  });

  it("pays 10 XP per correct answer with no perfect bonus (7 of 7 = 70)", async () => {
    const r = await submit(U1, COFFEE, answersFor(COFFEE, 0));
    expect(r).toMatchObject({
      status: "applied",
      correct: 7,
      total: 7,
      xpGain: 70,
      missedQuestionIds: [],
    });
    expect(await xp(U1, "en")).toBe(70);
  });

  it("pays for a partial score and reports exactly the missed questions", async () => {
    const r = await submit(U1, COFFEE, answersFor(COFFEE, 3));
    expect(r).toMatchObject({ correct: 4, xpGain: 40, missedQuestionIds: ["q1", "q2", "q3"] });
  });

  it("pays the improvement only on a replay, never the whole score again", async () => {
    await submit(U1, COFFEE, answersFor(COFFEE, 3)); // 4 correct -> 40
    const second = await submit(U1, COFFEE, answersFor(COFFEE, 1)); // 6 correct -> +20
    expect(second).toMatchObject({ xpGain: 20, bestCorrect: 6, bestXp: 60 });
    expect(await xp(U1, "en")).toBe(60);
  });

  it("pays nothing for the same or a lower score, keeps the best, and uses no hourly slot", async () => {
    await submit(U1, COFFEE, answersFor(COFFEE, 1), 60, RECENT);
    const before = await hits();
    expect(before).toBe(1); // the paying submission did take a slot, so "unchanged" below means something
    const same = await submit(U1, COFFEE, answersFor(COFFEE, 1), 60, RECENT);
    const lower = await submit(U1, COFFEE, answersFor(COFFEE, 5), 60, RECENT);
    expect(same).toMatchObject({ status: "applied", xpGain: 0 });
    expect(lower).toMatchObject({ status: "applied", xpGain: 0, bestCorrect: 6 });
    expect(await hits()).toBe(before);
    expect(await xp(U1, "en")).toBe(60);
  });

  it("pays each episode separately and each user separately", async () => {
    await submit(U1, COFFEE, answersFor(COFFEE, 0));
    await submit(U1, "au-cafe", answersFor("au-cafe", 0));
    await submit(U2, COFFEE, answersFor(COFFEE, 0));
    expect(await xp(U1, "en")).toBe(70);
    expect(await xp(U1, "fr")).toBe(60); // French episode pays into French
    expect(await xp(U2, "en")).toBe(70);
  });

  it("adds to the day's activity instead of overwriting it", async () => {
    await db.query("INSERT INTO public.activity_days VALUES ($1,$2,25)", [U1, DAY]);
    await submit(U1, COFFEE, answersFor(COFFEE, 0));
    const r = await db.query<{ xp_earned: number }>(
      "SELECT xp_earned FROM public.activity_days WHERE user_id=$1 AND day=$2",
      [U1, DAY],
    );
    expect(r.rows[0]!.xp_earned).toBe(95);
  });

  it("adds to existing course XP instead of overwriting it", async () => {
    await db.query(
      "INSERT INTO public.language_progress (user_id, language, xp) VALUES ($1,'en',500)",
      [U1],
    );
    await submit(U1, COFFEE, answersFor(COFFEE, 0));
    expect(await xp(U1, "en")).toBe(570);
  });

  it("shares the hourly ceiling: an improving submission over the limit is refused and writes nothing", async () => {
    expect(await submit(U1, COFFEE, answersFor(COFFEE, 0), 1, RECENT)).toMatchObject({
      status: "applied",
    });
    const refused = await submit(U1, "au-cafe", answersFor("au-cafe", 0), 1, RECENT);
    expect(refused).toEqual({ status: "rate-limited" });
    expect(await xp(U1, "fr")).toBe(0);
    const awards = await db.query<{ n: number }>(
      "SELECT count(*)::int n FROM public.podcast_quiz_awards",
    );
    expect(awards.rows[0]!.n).toBe(1);
  });

  it("still answers a zero-gain replay when the learner is at the ceiling", async () => {
    await submit(U1, COFFEE, answersFor(COFFEE, 0), 1, RECENT);
    expect(await submit(U1, COFFEE, answersFor(COFFEE, 0), 1, RECENT)).toMatchObject({
      status: "applied",
      xpGain: 0,
    });
  });

  it("counts against the same ceiling lessons use (consume_lesson_completion_slot)", async () => {
    await db.query("SELECT public.consume_lesson_completion_slot($1::uuid,$2::timestamptz,1)", [
      U1,
      RECENT,
    ]);
    expect(await submit(U1, COFFEE, answersFor(COFFEE, 0), 1, RECENT)).toEqual({
      status: "rate-limited",
    });
  });

  it("rejects a submission that is not exactly one answer per question, changing nothing", async () => {
    const good = answersFor(COFFEE, 0);
    const bad = [
      good.slice(1), // missing one
      [...good, good[0]], // extra
      [...good.slice(0, 6), good[0]], // duplicate id, one missing
      [...good.slice(0, 6), { questionId: "q99", choiceIndex: 0 }], // foreign id
      good.map((a, i) => (i === 0 ? { ...a, choiceIndex: String(a.choiceIndex) } : a)), // index as text
      good.map((a, i) => (i === 0 ? { questionId: a.questionId } : a)), // no index
      "nope",
    ];
    for (const answers of bad) {
      const r = await db
        .query<{ r: Record<string, unknown> }>(
          "SELECT public.submit_podcast_quiz($1::uuid,$2::uuid,$3::jsonb,$4::timestamptz,NULL,60) AS r",
          [U1, E[COFFEE], JSON.stringify(answers), RECENT],
        )
        .catch(() => ({ rows: [{ r: { status: "raised" } }] }));
      expect(["invalid", "raised"]).toContain(r.rows[0]!.r.status);
    }
    expect(await xp(U1, "en")).toBe(0);
    expect(await hits()).toBe(0);
    // Not vacuous: a valid submission at the same instant does take a slot.
    await submit(U1, COFFEE, good, 60, RECENT);
    expect(await hits()).toBe(1);
  });

  it("an out-of-range or negative choice is just wrong, never an error and never a win", async () => {
    const answers = answersFor(COFFEE, 0).map((a, i) =>
      i < 2 ? { ...a, choiceIndex: i === 0 ? 99 : -1 } : a,
    );
    expect(await submit(U1, COFFEE, answers)).toMatchObject({
      correct: 5,
      missedQuestionIds: ["q1", "q2"],
    });
  });

  it("follows the episode's own access: an unpublished episode has no quiz", async () => {
    await db.query("UPDATE public.podcast_episodes SET published=false WHERE id=$1", [E[COFFEE]]);
    expect(await submit(U1, COFFEE, answersFor(COFFEE, 0))).toEqual({ status: "not-found" });
    expect(await xp(U1, "en")).toBe(0);
  });

  it("an episode with no authored questions is not found", async () => {
    const f = await db.query<{ id: string }>(
      "INSERT INTO public.podcast_folders (slug) VALUES ('x') RETURNING id",
    );
    const e = await db.query<{ id: string }>(
      "INSERT INTO public.podcast_episodes (folder_id, slug, course, published) VALUES ($1,'bare','en',true) RETURNING id",
      [f.rows[0]!.id],
    );
    const r = await db.query<{ r: Record<string, unknown> }>(
      "SELECT public.submit_podcast_quiz($1::uuid,$2::uuid,'[]'::jsonb,$3::timestamptz,NULL,60) AS r",
      [U1, e.rows[0]!.id, AT],
    );
    expect(r.rows[0]!.r).toEqual({ status: "not-found" });
  });

  describe("day and streak (mirrors a lesson completion)", () => {
    const progress = async (user: string) =>
      (
        await db.query<{
          streak: number;
          longest_streak: number;
          last_active_date: string | null;
          streak_freezes: number;
          hearts: number;
        }>(
          "SELECT streak, longest_streak, to_char(last_active_date,'YYYY-MM-DD') last_active_date, streak_freezes, hearts FROM public.user_progress WHERE user_id=$1",
          [user],
        )
      ).rows[0];
    const days = async (user: string) =>
      (
        await db.query<{ day: string; xp_earned: number }>(
          "SELECT to_char(day,'YYYY-MM-DD') AS day, xp_earned FROM public.activity_days WHERE user_id=$1 ORDER BY day",
          [user],
        )
      ).rows;
    const seed = (user: string, last: string, streak: number, freezes = 0, longest = streak) =>
      db.query(
        // These learners count local days already (day_basis 'local'): the UTC-to-local bridge has its own tests below.
        "INSERT INTO public.user_progress (user_id, streak, longest_streak, last_active_date, streak_freezes, day_basis) VALUES ($1,$2,$3,$4,$5,'local')",
        [user, streak, longest, last, freezes],
      );
    const q = (slug: string) => answersFor(slug, 0);

    it("a first quiz starts the streak at 1 on today's activity day", async () => {
      await submit(U1, COFFEE, q(COFFEE));
      expect(await progress(U1)).toMatchObject({
        streak: 1,
        longest_streak: 1,
        last_active_date: "2026-11-04",
      });
      expect(await days(U1)).toEqual([{ day: "2026-11-04", xp_earned: 70 }]);
    });

    it("extends yesterday's streak by one, and keeps the longest", async () => {
      await seed(U1, "2026-11-03", 4, 0, 9);
      await submit(U1, COFFEE, q(COFFEE));
      expect(await progress(U1)).toMatchObject({
        streak: 5,
        longest_streak: 9,
        last_active_date: "2026-11-04",
      });
    });

    it("a second quiz the same day does not add another streak day", async () => {
      await submit(U1, COFFEE, q(COFFEE));
      await submit(U1, "au-cafe", q("au-cafe"));
      expect((await progress(U1))?.streak).toBe(1);
      expect(await days(U1)).toEqual([{ day: "2026-11-04", xp_earned: 130 }]);
    });

    it("a replay that pays 0 XP still counts for the streak, as a lesson replay does", async () => {
      await seed(U1, "2026-11-03", 4);
      await submit(U1, COFFEE, q(COFFEE), 60, "2026-11-03T12:00:00Z"); // banked yesterday
      await db.query("UPDATE public.user_progress SET streak=4, last_active_date='2026-11-03'");
      const replay = await submit(U1, COFFEE, q(COFFEE)); // nothing to pay today
      expect(replay).toMatchObject({ status: "applied", xpGain: 0 });
      expect(await progress(U1)).toMatchObject({ streak: 5, last_active_date: "2026-11-04" });
      // That a 0-XP replay takes no hourly slot is asserted on the real clock in "pays nothing for the same or a lower
      // score": these fixed dates are pruned from the slot table on insert, so a count here could not fail.
    });

    it("a missed day resets the streak, unless a freeze covers exactly one", async () => {
      await seed(U1, "2026-11-02", 6, 1);
      await submit(U1, COFFEE, q(COFFEE));
      expect(await progress(U1)).toMatchObject({ streak: 7, streak_freezes: 0 });
      await seed(U2, "2026-10-30", 6, 3);
      await submit(U2, COFFEE, q(COFFEE));
      expect(await progress(U2)).toMatchObject({ streak: 1, streak_freezes: 3 });
    });

    it("every 10th streak day earns a freeze and every 7th refills the hearts", async () => {
      await seed(U1, "2026-11-03", 9);
      await db.query("UPDATE public.user_progress SET hearts = 1 WHERE user_id=$1", [U1]);
      await submit(U1, COFFEE, q(COFFEE));
      expect(await progress(U1)).toMatchObject({ streak: 10, streak_freezes: 1, hearts: 1 });
      await seed(U2, "2026-11-03", 6);
      await db.query("UPDATE public.user_progress SET hearts = 1 WHERE user_id=$1", [U2]);
      await submit(U2, COFFEE, q(COFFEE));
      expect(await progress(U2)).toMatchObject({ streak: 7, hearts: 5 });
    });

    it("a user ahead of UTC (+14) is credited the UTC day of the moment they finished, not their local date", async () => {
      // 01:30 on 5 Nov in Kiritimati is 11:30 on 4 Nov UTC.
      await submit(U1, COFFEE, q(COFFEE), 60, AT, "2026-11-05T01:30:00+14:00");
      expect((await progress(U1))?.last_active_date).toBe("2026-11-04");
      expect(await days(U1)).toEqual([{ day: "2026-11-04", xp_earned: 70 }]);
    });

    it("a user behind UTC (-8) finishing at 9pm local is credited the UTC day, so the streak continues from UTC yesterday", async () => {
      await seed(U1, "2026-11-04", 3);
      // 9pm on 4 Nov in Los Angeles is 05:00 on 5 Nov UTC.
      await submit(U1, COFFEE, q(COFFEE), 60, "2026-11-05T05:00:30Z", "2026-11-04T21:00:00-08:00");
      expect(await progress(U1)).toMatchObject({ streak: 4, last_active_date: "2026-11-05" });
    });

    it("a claimed time more than 3 hours old is clamped, so a stale device cannot back-date the day", async () => {
      await submit(U1, COFFEE, q(COFFEE), 60, "2026-11-05T01:00:00Z", "2026-11-03T20:00:00Z");
      expect((await progress(U1))?.last_active_date).toBe("2026-11-04"); // 22:00Z on the 4th, not the 3rd
    });

    it("a claimed time in the future is clamped to now", async () => {
      await submit(U1, COFFEE, q(COFFEE), 60, AT, "2026-11-09T00:00:00Z");
      expect((await progress(U1))?.last_active_date).toBe("2026-11-04");
    });

    it("never moves the activity marker backwards", async () => {
      await seed(U1, "2026-11-10", 5);
      await submit(U1, COFFEE, q(COFFEE));
      expect(await progress(U1)).toMatchObject({ last_active_date: "2026-11-10", streak: 5 });
      expect(await days(U1)).toEqual([{ day: "2026-11-10", xp_earned: 70 }]);
    });

    it("counts the hourly slot at the clamped instant, as lessons do", async () => {
      const iso = (ms: number) => new Date(ms).toISOString();
      // Within the 3-hour window the claimed instant is kept; older than it, the slot lands at RECENT - 3 hours.
      await submit(U1, COFFEE, q(COFFEE), 60, RECENT, iso(RECENT_MS - 2 * 3600_000));
      await submit(U1, "au-cafe", q("au-cafe"), 60, RECENT, iso(RECENT_MS - 9 * 3600_000));
      const r = await db.query<{ at: string }>(
        "SELECT at::text FROM public.lesson_completion_hits ORDER BY at",
      );
      expect(r.rows.map((x) => new Date(x.at).toISOString())).toEqual([
        iso(RECENT_MS - 3 * 3600_000),
        iso(RECENT_MS - 2 * 3600_000),
      ]);
    });

    it("a refused submission (rate limit) changes neither XP, streak nor day", async () => {
      await submit(U1, COFFEE, q(COFFEE), 1, RECENT);
      await db.query("DELETE FROM public.user_progress");
      await db.query("DELETE FROM public.activity_days");
      const refused = await submit(U1, "au-cafe", q("au-cafe"), 1, RECENT);
      expect(refused).toEqual({ status: "rate-limited" });
      expect(await progress(U1)).toBeUndefined();
      expect(await days(U1)).toEqual([]);
    });
  });

  it("serialises on the user's row: the lock line is in the function (PGlite is single-connection and cannot race)", () => {
    // Removing this lets a quiz and a lesson finishing together both compute XP and streak from the same stale state.
    // It is the same lock apply_lesson_completion takes.
    const body = quizSql.slice(quizSql.indexOf("CREATE FUNCTION public.submit_podcast_quiz"));
    expect(body).toMatch(/PERFORM 1 FROM auth\.users WHERE id = _user_id FOR NO KEY UPDATE;/);
    // And the rows it then reads and writes are locked too.
    expect(body).toMatch(/FROM public\.podcast_quiz_awards[\s\S]*?FOR UPDATE;/);
    expect(body).toMatch(/FROM public\.user_progress WHERE user_id = _user_id FOR UPDATE;/);
  });

  it("deleting the account removes its awards (ON DELETE CASCADE)", async () => {
    await submit(U1, COFFEE, answersFor(COFFEE, 0));
    await db.query("DELETE FROM auth.users WHERE id=$1", [U1]);
    const n = await db.query<{ n: number }>(
      "SELECT count(*)::int n FROM public.podcast_quiz_awards WHERE user_id=$1",
      [U1],
    );
    expect(n.rows[0]!.n).toBe(0);
  });

  it("deleting an episode removes its questions and awards (ON DELETE CASCADE)", async () => {
    await submit(U1, COFFEE, answersFor(COFFEE, 0));
    await db.query("DELETE FROM public.podcast_episodes WHERE id=$1", [E[COFFEE]]);
    const q = await db.query<{ n: number }>(
      "SELECT count(*)::int n FROM public.podcast_quiz_questions WHERE episode_id=$1",
      [E[COFFEE]],
    );
    const a = await db.query<{ n: number }>(
      "SELECT count(*)::int n FROM public.podcast_quiz_awards WHERE episode_id=$1",
      [E[COFFEE]],
    );
    expect([q.rows[0]!.n, a.rows[0]!.n]).toEqual([0, 0]);
  });

  it("a learner reads only their own awards, and only for episodes they banked", async () => {
    await submit(U1, COFFEE, answersFor(COFFEE, 0));
    await submit(U2, COFFEE, answersFor(COFFEE, 3));
    await db.exec("SET ROLE authenticated; SET app.uid = '" + U1 + "'");
    const mine = await db.query<{ best_correct: number }>(
      "SELECT best_correct FROM public.podcast_quiz_awards",
    );
    await db.exec("RESET ROLE");
    expect(mine.rows.map((r) => r.best_correct)).toEqual([7]);
  });

  it("gives clients no write path: no privileges on awards, no EXECUTE on the function", async () => {
    const has = async (sql: string) => (await db.query<{ ok: boolean }>(sql)).rows[0]!.ok;
    for (const role of ["authenticated", "anon"]) {
      for (const priv of ["INSERT", "UPDATE", "DELETE"]) {
        expect(
          await has(
            `SELECT has_table_privilege('${role}','public.podcast_quiz_awards','${priv}') ok`,
          ),
        ).toBe(false);
      }
      expect(
        await has(
          `SELECT has_function_privilege('${role}','public.submit_podcast_quiz(uuid,uuid,jsonb,timestamptz,timestamptz,integer)','EXECUTE') ok`,
        ),
      ).toBe(false);
    }
    expect(
      await has(`SELECT has_table_privilege('anon','public.podcast_quiz_awards','SELECT') ok`),
    ).toBe(false);
    expect(
      await has(
        `SELECT has_table_privilege('authenticated','public.podcast_quiz_awards','SELECT') ok`,
      ),
    ).toBe(true);
    expect(
      await has(
        `SELECT has_table_privilege('authenticated','public.podcast_quiz_questions','INSERT') ok`,
      ),
    ).toBe(false);
    expect(
      await has(
        `SELECT has_table_privilege('authenticated','public.podcast_quiz_questions','SELECT') ok`,
      ),
    ).toBe(true);
    expect(
      await has(
        `SELECT has_function_privilege('service_role','public.submit_podcast_quiz(uuid,uuid,jsonb,timestamptz,timestamptz,integer)','EXECUTE') ok`,
      ),
    ).toBe(true);
  });

  describe("missed questions become review items", () => {
    const reviews = async (user: string) =>
      (
        await db.query<{
          item_key: string;
          source: string;
          language: string;
          prompt: string;
          choices: string[];
          answer_index: number;
          explanation: string | null;
          due_on: string;
        }>(
          "SELECT item_key, source, language, prompt, choices, answer_index, explanation, due_on::text FROM public.review_items WHERE user_id=$1 ORDER BY item_key",
          [user],
        )
      ).rows;
    const quizOf = (slug: string) => PODCAST_QUIZZES.find((x) => x.slug === slug)!;

    it("adds exactly the missed questions, with the stored prompt, choices and answer, in the episode's course", async () => {
      await submit(U1, "au-cafe", answersFor("au-cafe", 2));
      const rows = await reviews(U1);
      const missed = quizOf("au-cafe").questions.slice(0, 2);
      expect(rows).toHaveLength(2);
      for (const q of missed) {
        const row = rows.find((r) => r.item_key.endsWith(q.id))!;
        expect(row).toMatchObject({
          source: "podcast_quiz",
          language: "fr",
          prompt: q.prompt,
          choices: q.choices,
          answer_index: q.answerIndex,
          // The native review players need an explanation on every self-contained row: the right answer, stated.
          explanation: `Correct answer: ${q.choices[q.answerIndex]}`,
          due_on: AT.slice(0, 10),
        });
      }
    });

    it("adds nothing for a perfect score, nor for another learner's miss", async () => {
      await submit(U1, COFFEE, answersFor(COFFEE, 0));
      await submit(U2, COFFEE, answersFor(COFFEE, 2));
      expect(await reviews(U1)).toEqual([]);
      expect(await reviews(U2)).toHaveLength(2);
    });

    it("builds a key the review grader accepts (letters and digits, one colon, short)", async () => {
      await submit(U1, COFFEE, answersFor(COFFEE, 3));
      const rows = await reviews(U1);
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.item_key).toMatch(/^[a-z0-9]+:[a-z0-9]+$/);
        expect(r.item_key.length).toBeLessThanOrEqual(120);
      }
    });

    it("keeps one row per question however often it is missed, and never pushes a due date later", async () => {
      await submit(U1, COFFEE, answersFor(COFFEE, 2));
      await db.query("UPDATE public.review_items SET due_on = '2026-11-01' WHERE user_id=$1", [U1]);
      await submit(U1, COFFEE, answersFor(COFFEE, 2));
      const rows = await reviews(U1);
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.due_on === "2026-11-01")).toBe(true);
    });

    it("brings back a question that was retired (its row deleted) when it is missed again", async () => {
      await submit(U1, COFFEE, answersFor(COFFEE, 1));
      await db.query("DELETE FROM public.review_items WHERE user_id=$1", [U1]);
      await submit(U1, COFFEE, answersFor(COFFEE, 1));
      expect(await reviews(U1)).toHaveLength(1);
    });

    it("adds nothing when the submission is refused", async () => {
      await submit(U1, COFFEE, answersFor(COFFEE, 0), 1, RECENT);
      await submit(U1, "au-cafe", answersFor("au-cafe", 3), 1, RECENT); // rate-limited
      await submit(U1, COFFEE, [{ questionId: "q99", choiceIndex: 0 }]); // invalid
      expect(await reviews(U1)).toEqual([]);
    });

    it("is readable by its owner through RLS and by nobody else", async () => {
      await submit(U1, COFFEE, answersFor(COFFEE, 2));
      const countAs = async (uid: string) => {
        await db.query("SELECT set_config('app.uid', $1, false)", [uid]);
        await db.exec("SET ROLE authenticated");
        try {
          return (await db.query<{ n: number }>("SELECT count(*)::int n FROM public.review_items"))
            .rows[0]!.n;
        } finally {
          await db.exec("RESET ROLE");
        }
      };
      expect(await countAs(U1)).toBe(2);
      expect(await countAs(U2)).toBe(0);
    });

    it("requires the question itself on the row, and leaves the other sources as they were", async () => {
      await expect(
        db.query(
          "INSERT INTO public.review_items (user_id,item_key,lesson_id,source) VALUES ($1,'podcast:x','podcast','podcast_quiz')",
          [U1],
        ),
      ).rejects.toThrow();
      await db.query(
        "INSERT INTO public.review_items (user_id,item_key,lesson_id) VALUES ($1,'a1:q1','a1')",
        [U1],
      );
      await expect(
        db.query(
          "INSERT INTO public.review_items (user_id,item_key,lesson_id,source) VALUES ($1,'w:1','w','weakness')",
          [U1],
        ),
      ).rejects.toThrow();
    });
  });

  describe("migration file", () => {
    it("is versioned after everything that was on main", () => {
      expect(REVIEW_FILE.slice(0, 14) > "20261107130000").toBe(true);
    });
    it("keeps the function private to the service role, as the original", () => {
      expect(reviewSql).toMatch(
        /REVOKE ALL ON FUNCTION public\.submit_podcast_quiz[\s\S]*FROM PUBLIC, anon, authenticated;/,
      );
      expect(reviewSql).toMatch(
        /GRANT EXECUTE ON FUNCTION public\.submit_podcast_quiz[\s\S]*TO service_role;/,
      );
    });
    it("adds no client write grant on review_items", () => {
      expect(reviewSql.replace(/^--.*$/gm, "")).not.toMatch(
        /GRANT[^;]*(INSERT|UPDATE|DELETE|ALL)[^;]*review_items/i,
      );
    });
  });

  describe("local days (owner decision 2026-11-12)", () => {
    const zone = (user: string, tz: string) =>
      db.query("INSERT INTO public.learner_time_zones (user_id, time_zone) VALUES ($1,$2)", [
        user,
        tz,
      ]);
    const localDate = async (user: string, at: string) =>
      (
        await db.query<{ d: string }>(
          "SELECT public.learner_local_date($1::uuid, $2::timestamptz)::text AS d",
          [user, at],
        )
      ).rows[0]!.d;
    const jsDay = (tz: string, ms = Date.now()) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(ms));

    it("the helper is the learner's calendar day, UTC with no zone, a bad zone or no row", async () => {
      await zone(U1, "Australia/Sydney");
      await zone(U2, "Not/AZone"); // written around the validating function, to prove the fallback
      const at = "2026-11-12T23:30:00Z";
      expect(await localDate(U1, at)).toBe("2026-11-13");
      expect(await localDate(U2, at)).toBe("2026-11-12");
      expect(await localDate("00000000-0000-4000-8000-0000000000ff", at)).toBe("2026-11-12");
    });

    it("follows daylight saving time", async () => {
      await zone(U1, "America/New_York");
      expect(await localDate(U1, "2026-07-01T04:30:00Z")).toBe("2026-07-01");
      expect(await localDate(U1, "2026-01-01T04:30:00Z")).toBe("2025-12-31");
    });

    it("learning seconds, skill results and speech seconds are booked on the learner's day", async () => {
      await zone(U1, "Pacific/Kiritimati"); // UTC+14
      await zone(U2, "Pacific/Pago_Pago"); // UTC-11
      for (const [u, tz] of [
        [U1, "Pacific/Kiritimati"],
        [U2, "Pacific/Pago_Pago"],
      ] as const) {
        const want = jsDay(tz);
        const learning = await db.query<{ d: string }>(
          "SELECT public.add_learning_seconds($1::uuid, 60, 0)::text AS d",
          [u],
        );
        expect(learning.rows[0]!.d).toBe(want);
        const speech = await db.query<{ d: string }>(
          "SELECT public.add_speech_seconds($1::uuid, 30)::text AS d",
          [u],
        );
        expect(speech.rows[0]!.d).toBe(want);
        await db.query(
          `SELECT public.add_skill_results($1::uuid, '[{"skill":"listening","right":1,"total":2}]'::jsonb)`,
          [u],
        );
        const skill = await db.query<{ d: string }>(
          "SELECT day::text AS d FROM public.skill_days WHERE user_id=$1",
          [u],
        );
        expect(skill.rows[0]!.d).toBe(want);
      }
    });

    const progress = (user: string, last: string | null, basis: string, streak = 4, freezes = 0) =>
      db.query(
        `INSERT INTO public.user_progress (user_id, streak, longest_streak, last_active_date, streak_freezes, day_basis)
         VALUES ($1,$2,$2,$3,$4,$5)`,
        [user, streak, last, freezes, basis],
      );
    const progressOf = async (user: string) =>
      (
        await db.query<{
          streak: number;
          last_active_date: string;
          streak_freezes: number;
          day_basis: string;
        }>(
          "SELECT streak, last_active_date::text, streak_freezes, day_basis FROM public.user_progress WHERE user_id=$1",
          [user],
        )
      ).rows[0]!;
    const activityDays = async (user: string) =>
      (
        await db.query<{ day: string }>(
          "SELECT day::text FROM public.activity_days WHERE user_id=$1 ORDER BY day",
          [user],
        )
      ).rows.map((r) => r.day);

    it("a quiz books the streak day and the activity day in the learner's zone", async () => {
      await zone(U1, "Australia/Sydney");
      await submit(U1, COFFEE, answersFor(COFFEE, 0), 60, "2026-11-04T23:30:00Z");
      expect(await activityDays(U1)).toEqual(["2026-11-05"]);
      expect((await progressOf(U1)).last_active_date).toBe("2026-11-05");
      expect((await progressOf(U1)).day_basis).toBe("local");
    });

    it("a learner with no zone still books UTC days", async () => {
      await submit(U1, COFFEE, answersFor(COFFEE, 0), 60, "2026-11-04T23:30:00Z");
      expect(await activityDays(U1)).toEqual(["2026-11-04"]);
    });

    it("EAST of UTC the switch drops nobody: yesterday's local day stored as a UTC date two back still continues", async () => {
      await zone(U1, "Australia/Brisbane"); // UTC+10
      // Studied Tuesday 08:00 local = Monday 22:00 UTC: the old rule stored Monday 2026-11-02. It is now Wednesday
      // 08:00 local (2026-11-04, Tuesday 22:00 UTC): two dates on, but only one local day.
      await progress(U1, "2026-11-02", "utc", 4, 0);
      await submit(U1, COFFEE, answersFor(COFFEE, 0), 60, "2026-11-03T22:00:00Z");
      const p = await progressOf(U1);
      expect(p.streak).toBe(5);
      expect(p.streak_freezes).toBe(0);
      expect(p.last_active_date).toBe("2026-11-04");
      expect(p.day_basis).toBe("local");
    });

    it("WEST of UTC the switch drops nobody either: the local day behind the stored date is the same day", async () => {
      await zone(U1, "America/Los_Angeles"); // UTC-8
      // Studied Tuesday 20:00 local = Wednesday 04:00 UTC: stored 2026-11-04. Now Tuesday 20:30 local the NEXT week day
      // is not reached; the local date (2026-11-04) is not after the stored one: no drop, no double count.
      await progress(U1, "2026-11-04", "utc", 4, 0);
      await submit(U1, COFFEE, answersFor(COFFEE, 0), 60, "2026-11-05T04:30:00Z");
      const p = await progressOf(U1);
      expect(p.streak).toBe(4);
      expect(p.last_active_date).toBe("2026-11-04");
    });

    it("the bridge happens once: on the local basis a two-date gap is a real missed day", async () => {
      await progress(U1, "2026-11-02", "local", 4, 0);
      await submit(U1, COFFEE, answersFor(COFFEE, 0), 60, "2026-11-04T12:00:00Z");
      expect((await progressOf(U1)).streak).toBe(1);
    });

    it("on the local basis a freeze still covers a missed day", async () => {
      await progress(U1, "2026-11-02", "local", 4, 1);
      await submit(U1, COFFEE, answersFor(COFFEE, 0), 60, "2026-11-04T12:00:00Z");
      const p = await progressOf(U1);
      expect(p.streak).toBe(5);
      expect(p.streak_freezes).toBe(0);
    });

    it("the bridge never carries a gap of three or more dates", async () => {
      await progress(U1, "2026-11-01", "utc", 4, 0);
      await submit(U1, COFFEE, answersFor(COFFEE, 0), 60, "2026-11-04T12:00:00Z");
      expect((await progressOf(U1)).streak).toBe(1);
    });

    it("a consecutive day continues on either basis", async () => {
      await progress(U1, "2026-11-03", "utc", 4, 0);
      await submit(U1, COFFEE, answersFor(COFFEE, 0), 60, "2026-11-04T12:00:00Z");
      expect((await progressOf(U1)).streak).toBe(5);
    });

    it("apply_lesson_completion records the basis the caller sends, and leaves it alone when the caller says nothing", async () => {
      const call = (uid: string, next: Record<string, unknown>) =>
        db.query(
          "SELECT public.apply_lesson_completion($1::uuid,'en','u1l1','A1','2026-11-04'::date,$2::jsonb,$3::jsonb,'[]'::jsonb,'[]'::jsonb) AS r",
          [
            uid,
            JSON.stringify({
              p_updated_at: null,
              lp_updated_at: null,
              completion_xp: null,
              day_xp: null,
            }),
            JSON.stringify({
              streak: 1,
              longest_streak: 1,
              last_active_date: "2026-11-04",
              hearts: 5,
              hearts_refill_at: null,
              streak_freezes: 0,
              xp: 10,
              league_tier: "bronze",
              best_correct: 1,
              total: 1,
              best_xp: 10,
              day_xp: 10,
              ...next,
            }),
          ],
        );
      await call(U1, { day_basis: "local" });
      expect((await progressOf(U1)).day_basis).toBe("local");
      // A brand-new learner whose caller predates the field starts on the local basis; an existing UTC one stays utc.
      await progress(U2, "2026-11-01", "utc", 4, 0);
      const before = (
        await db.query<{ u: string }>(
          "SELECT updated_at::text u FROM public.user_progress WHERE user_id=$1",
          [U2],
        )
      ).rows[0]!.u;
      await db.query(
        "SELECT public.apply_lesson_completion($1::uuid,'en','u1l1','A1','2026-11-04'::date,$2::jsonb,$3::jsonb,'[]'::jsonb,'[]'::jsonb)",
        [
          U2,
          JSON.stringify({
            p_updated_at: before,
            lp_updated_at: null,
            completion_xp: null,
            day_xp: null,
          }),
          JSON.stringify({
            streak: 5,
            longest_streak: 5,
            last_active_date: "2026-11-04",
            hearts: 5,
            hearts_refill_at: null,
            streak_freezes: 0,
            xp: 10,
            league_tier: "bronze",
            best_correct: 1,
            total: 1,
            best_xp: 10,
            day_xp: 10,
          }),
        ],
      );
      expect((await progressOf(U2)).day_basis).toBe("utc");
    });
  });

  describe("local days migration file", () => {
    it("is versioned after the migration whose function it replaces", () => {
      expect(LOCAL_DAYS_FILE.slice(0, 14) > "20261112140000").toBe(true);
    });
    it("keeps every function private to the service role and grants no client write", () => {
      expect(localDaysSql).toMatch(
        /GRANT EXECUTE ON FUNCTION public\.learner_local_date\(uuid, timestamptz\) TO service_role;/,
      );
      expect(localDaysSql).toMatch(
        /REVOKE ALL ON FUNCTION public\.learner_local_date\(uuid, timestamptz\) FROM PUBLIC, anon, authenticated;/,
      );
      expect(localDaysSql.replace(/^--.*$/gm, "")).not.toMatch(
        /GRANT[^;]*(INSERT|UPDATE|DELETE|ALL)[^;]*TO[^;]*(authenticated|anon|PUBLIC)/i,
      );
    });
    it("books no day with the hard-coded UTC expression; only the review due date (a due day, not a streak day) keeps it", () => {
      const uses = localDaysSql.replace(/^--.*$/gm, "").match(/AT TIME ZONE 'UTC'\)::date/g) ?? [];
      expect(uses).toHaveLength(1);
      expect(localDaysSql).toMatch(
        /\(_at AT TIME ZONE 'UTC'\)::date\s+FROM public\.podcast_quiz_questions/,
      );
    });
  });
});
