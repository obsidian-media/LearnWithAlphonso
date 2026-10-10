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

  async function retire(attempt = "queue-attempt-1") {
    return db.query<{ result: { status: string; retired: boolean; correct: boolean } }>(call, [
      USER,
      "weakness:one",
      "en",
      attempt,
      null,
      new Date().toISOString().slice(0, 10),
      true,
      true,
      new Date().toISOString().slice(0, 10),
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
        new Date().toISOString().slice(0, 10),
        true,
        true,
        new Date().toISOString().slice(0, 10),
        null,
        null,
        null,
        null,
      ]),
    ).rejects.toThrow(/identity collision/);
  });
});
