import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const USER = "00000000-0000-4000-8000-000000000001";
const ROW = "00000000-0000-4000-8000-000000000002";
const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261014100200_atomic_review_grade.sql"),
  "utf8",
);
const call = `SELECT public.apply_review_grade(
  $1::uuid,$2::text,$3::text,$4::text,$5::timestamptz,$6::date,
  $7::boolean,$8::boolean,$9::date,$10::real,$11::integer,$12::integer,$13::integer
) AS result`;

describe("atomic review grade migration (real Postgres)", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT NULL::uuid$$;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE public.review_items(
        id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id),
        item_key text NOT NULL, language text NOT NULL, source text,
        weakness_label text, due_on date NOT NULL,
        last_reviewed_at timestamptz, ease real, interval_days integer,
        repetitions integer, lapses integer
      );
      CREATE TABLE public.weakness_events(
        user_id uuid NOT NULL REFERENCES auth.users(id), category text NOT NULL,
        event_type text NOT NULL
      );
    `);
    await db.exec(migration);
    await db.query("INSERT INTO auth.users(id) VALUES ($1)", [USER]);
    await db.query(
      `INSERT INTO public.review_items
       (id,user_id,item_key,language,source,weakness_label,due_on,ease,interval_days,repetitions,lapses)
       VALUES ($1,$2,'weakness:one','en','weakness','past-tense',current_date,2.3,3,3,0)`,
      [ROW, USER],
    );
  }, 120_000);
  afterEach(async () => {
    await db.close();
  });

  // The database's own date: the fixture seeds with current_date, and a JS UTC date differs from it for part of
  // every day on a machine that is not on UTC.
  async function today(): Promise<string> {
    return (await db.query<{ d: string }>("SELECT current_date::text AS d")).rows[0]!.d;
  }

  async function retire(attempt = "queue-attempt-1") {
    return db.query<{ result: { status: string; retired: boolean; correct: boolean } }>(call, [
      USER,
      "weakness:one",
      "en",
      attempt,
      null,
      await today(),
      true,
      true,
      await today(),
      null,
      null,
      null,
      null,
    ]);
  }

  it("retires once, logs exactly one event, and replays a lost response idempotently", async () => {
    const first = await retire();
    const retry = await retire();
    expect(first.rows[0]?.result).toMatchObject({
      status: "applied",
      retired: true,
      correct: true,
    });
    expect(retry.rows[0]?.result).toEqual(first.rows[0]?.result);
    expect((await db.query("SELECT * FROM public.review_items")).rows).toHaveLength(0);
    expect((await db.query("SELECT * FROM public.weakness_events")).rows).toHaveLength(1);
    expect((await db.query("SELECT * FROM public.review_grade_attempts")).rows).toHaveLength(1);
  });

  it("rolls back retirement and attempt when the event insert fails", async () => {
    await db.exec(`
      CREATE FUNCTION public.fail_weakness_event() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'injected event failure'; END; $$;
      CREATE TRIGGER fail_weakness_event BEFORE INSERT ON public.weakness_events
        FOR EACH ROW EXECUTE FUNCTION public.fail_weakness_event();
    `);
    await expect(retire()).rejects.toThrow(/injected event failure/);
    expect((await db.query("SELECT * FROM public.review_items")).rows).toHaveLength(1);
    expect((await db.query("SELECT * FROM public.weakness_events")).rows).toHaveLength(0);
    expect((await db.query("SELECT * FROM public.review_grade_attempts")).rows).toHaveLength(0);
  });

  it("does not reuse an attempt result for a different review item", async () => {
    await retire();
    await expect(
      db.query(call, [
        USER,
        "weakness:other",
        "en",
        "queue-attempt-1",
        null,
        await today(),
        true,
        true,
        await today(),
        null,
        null,
        null,
        null,
      ]),
    ).rejects.toThrow(/identity collision/);
  });

  const LESSON_ROW = "00000000-0000-4000-8000-000000000003";
  async function seedLessonItem(dueOn = "current_date") {
    await db.query(
      `INSERT INTO public.review_items
       (id,user_id,item_key,language,source,due_on,ease,interval_days,repetitions,lapses)
       VALUES ($1,$2,'u1l1:q1','en','lesson',${dueOn},2.3,0,0,0)`,
      [LESSON_ROW, USER],
    );
  }
  async function grade(expectedDueOn: string, expectedLastReviewedAt: string | null = null) {
    const res = await db.query<{ result: { status: string } }>(call, [
      USER,
      "u1l1:q1",
      "en",
      null,
      expectedLastReviewedAt,
      expectedDueOn,
      false,
      true,
      "2099-01-01",
      2.4,
      1,
      1,
      0,
    ]);
    return res.rows[0]?.result.status;
  }

  it("updates a non-retired item in place and logs no weakness event", async () => {
    await seedLessonItem();
    expect(await grade(await today())).toBe("applied");
    const rows = (
      await db.query<{ due_on: string; repetitions: number; last_reviewed_at: string | null }>(
        "SELECT due_on::text, repetitions, last_reviewed_at::text FROM public.review_items WHERE id = $1",
        [LESSON_ROW],
      )
    ).rows;
    expect(rows[0]).toMatchObject({ due_on: "2099-01-01", repetitions: 1 });
    expect(rows[0]?.last_reviewed_at).not.toBeNull();
    expect((await db.query("SELECT * FROM public.weakness_events")).rows).toHaveLength(0);
  });

  it("rejects a grade computed from a stale due date or review time", async () => {
    await seedLessonItem();
    expect(await grade("2000-01-01")).toBe("conflict");
    expect(await grade(await today(), "2000-01-01T00:00:00Z")).toBe("conflict");
    expect(
      (
        await db.query("SELECT 1 FROM public.review_items WHERE repetitions = 0 AND id = $1", [
          LESSON_ROW,
        ])
      ).rows,
    ).toHaveLength(1);
  });

  it("refuses an item that is not due yet", async () => {
    await seedLessonItem("current_date + 5");
    const due = (
      await db.query<{ d: string }>(
        "SELECT due_on::text AS d FROM public.review_items WHERE id = $1",
        [LESSON_ROW],
      )
    ).rows[0]!.d;
    expect(await grade(due)).toBe("not_due");
  });
});
