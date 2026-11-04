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

const U1 = "00000000-0000-4000-8000-000000000001";
const U2 = "00000000-0000-4000-8000-000000000002";
const AT = "2026-11-04T12:00:00Z";
const DAY = "2026-11-04";

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
        xp integer NOT NULL DEFAULT 0, league_tier text NOT NULL DEFAULT 'bronze', PRIMARY KEY (user_id, language));
      CREATE TABLE public.activity_days (
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, day date NOT NULL,
        xp_earned integer NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day));
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
  async function submit(user: string, slug: string, answers: unknown, limit = 60, at = AT) {
    const r = await db.query<{ r: Record<string, unknown> }>(
      "SELECT public.submit_podcast_quiz($1::uuid,$2::uuid,$3::jsonb,$4::timestamptz,$5::date,$6::integer) AS r",
      [user, E[slug], JSON.stringify(answers), at, DAY, limit],
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
    await submit(U1, COFFEE, answersFor(COFFEE, 1));
    const before = await hits();
    const same = await submit(U1, COFFEE, answersFor(COFFEE, 1));
    const lower = await submit(U1, COFFEE, answersFor(COFFEE, 5));
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
    expect(await submit(U1, COFFEE, answersFor(COFFEE, 0), 1)).toMatchObject({ status: "applied" });
    const refused = await submit(U1, "au-cafe", answersFor("au-cafe", 0), 1);
    expect(refused).toEqual({ status: "rate-limited" });
    expect(await xp(U1, "fr")).toBe(0);
    const awards = await db.query<{ n: number }>(
      "SELECT count(*)::int n FROM public.podcast_quiz_awards",
    );
    expect(awards.rows[0]!.n).toBe(1);
  });

  it("still answers a zero-gain replay when the learner is at the ceiling", async () => {
    await submit(U1, COFFEE, answersFor(COFFEE, 0), 1);
    expect(await submit(U1, COFFEE, answersFor(COFFEE, 0), 1)).toMatchObject({
      status: "applied",
      xpGain: 0,
    });
  });

  it("counts against the same ceiling lessons use (consume_lesson_completion_slot)", async () => {
    await db.query("SELECT public.consume_lesson_completion_slot($1::uuid,$2::timestamptz,1)", [
      U1,
      AT,
    ]);
    expect(await submit(U1, COFFEE, answersFor(COFFEE, 0), 1)).toEqual({ status: "rate-limited" });
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
          "SELECT public.submit_podcast_quiz($1::uuid,$2::uuid,$3::jsonb,$4::timestamptz,$5::date,60) AS r",
          [U1, E[COFFEE], JSON.stringify(answers), AT, DAY],
        )
        .catch(() => ({ rows: [{ r: { status: "raised" } }] }));
      expect(["invalid", "raised"]).toContain(r.rows[0]!.r.status);
    }
    expect(await xp(U1, "en")).toBe(0);
    expect(await hits()).toBe(0);
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
      "SELECT public.submit_podcast_quiz($1::uuid,$2::uuid,'[]'::jsonb,$3::timestamptz,$4::date,60) AS r",
      [U1, e.rows[0]!.id, AT, DAY],
    );
    expect(r.rows[0]!.r).toEqual({ status: "not-found" });
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
          `SELECT has_function_privilege('${role}','public.submit_podcast_quiz(uuid,uuid,jsonb,timestamptz,date,integer)','EXECUTE') ok`,
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
        `SELECT has_function_privilege('service_role','public.submit_podcast_quiz(uuid,uuid,jsonb,timestamptz,date,integer)','EXECUTE') ok`,
      ),
    ).toBe(true);
  });
});
