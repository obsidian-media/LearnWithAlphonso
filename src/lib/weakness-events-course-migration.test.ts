import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * 20261128210000: weakness_events carries the course. Executed in a real Postgres (PGlite): the column exists and
 * defaults to English for old rows, only a real course is accepted, and both writers inside the database put the
 * course on the row, so a French learner's weak spots are never counted as English ones.
 */
const MIGRATION = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261128210000_weakness_events_course.sql"),
  "utf8",
);

const USER = "00000000-0000-4000-8000-0000000000a1";
const CALL = "00000000-0000-4000-8000-0000000000c1";
const SINGLE_FR = "00000000-0000-4000-8000-0000000000b1";
const MIXED = "00000000-0000-4000-8000-0000000000b2";
const ROW_FR = "00000000-0000-4000-8000-0000000000f1";

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;
    CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
    INSERT INTO auth.users(id) VALUES ('${USER}'), ('${SINGLE_FR}'), ('${MIXED}');
    CREATE TABLE public.weakness_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES auth.users(id), category text NOT NULL, event_type text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO public.weakness_events (user_id, category, event_type) VALUES ('${USER}', 'articles', 'detected'),
      ('${SINGLE_FR}', 'articles', 'detected'), ('${MIXED}', 'articles', 'detected');
    CREATE TABLE public.review_items (id uuid PRIMARY KEY, user_id uuid NOT NULL, item_key text NOT NULL,
      language text NOT NULL, source text, weakness_label text, saved_word text, due_on date NOT NULL,
      last_reviewed_at timestamptz, ease real, interval_days integer, repetitions integer, lapses integer);
    CREATE TABLE public.mastered_words (user_id uuid NOT NULL, language text NOT NULL, item_key text NOT NULL,
      PRIMARY KEY (user_id, language, item_key));
    CREATE TABLE public.review_grade_attempts (user_id uuid NOT NULL, attempt_id text NOT NULL, item_key text NOT NULL,
      language text NOT NULL, result jsonb NOT NULL, PRIMARY KEY (user_id, attempt_id));
    CREATE TABLE public.tutor_memory (user_id uuid NOT NULL, course text NOT NULL, kind text NOT NULL,
      memory_key text NOT NULL, text text NOT NULL, detail text, call_id uuid, seen_count integer NOT NULL DEFAULT 1,
      last_seen_at timestamptz NOT NULL DEFAULT now(), UNIQUE (user_id, course, kind, memory_key));
    INSERT INTO public.review_items (id, user_id, item_key, language, source, weakness_label, due_on)
      VALUES ('${ROW_FR}', '${USER}', 'weakness:fr1', 'fr', 'weakness', 'articles', current_date),
        (gen_random_uuid(), '${USER}', 'weakness:en1', 'en', 'weakness', 'plurals', current_date),
        (gen_random_uuid(), '${SINGLE_FR}', 'weakness:s1', 'fr', 'weakness', 'articles', current_date),
        (gen_random_uuid(), '${MIXED}', 'weakness:m1', 'fr', 'weakness', 'articles', current_date),
        (gen_random_uuid(), '${MIXED}', 'weakness:m2', 'es', 'weakness', 'plurals', current_date);
  `);
  await db.exec(MIGRATION);
}, 120_000);
afterAll(async () => {
  await db.close();
});

describe("weakness_events.course", () => {
  it("backfills old events for a learner whose weakness items are all in one language, and leaves a mixed one English", async () => {
    const course = async (u: string) =>
      (
        await db.query<{ course: string }>(
          `SELECT course FROM public.weakness_events WHERE user_id = '${u}' AND category = 'articles'`,
        )
      ).rows;
    expect(await course(SINGLE_FR)).toEqual([{ course: "fr" }]);
    expect(await course(MIXED)).toEqual([{ course: "en" }]);
  });

  it("existing rows are English, and only a real course is accepted", async () => {
    const old = await db.query<{ course: string }>(
      `SELECT course FROM public.weakness_events WHERE category = 'articles' AND user_id = '${USER}'`,
    );
    expect(old.rows).toEqual([{ course: "en" }]);
    await expect(
      db.query(
        `INSERT INTO public.weakness_events (user_id, category, event_type, course) VALUES ('${USER}', 'x', 'detected', 'de')`,
      ),
    ).rejects.toThrow();
  });

  it("a recap writes its weak-spot events with the call's course", async () => {
    await db.query(
      `SELECT public.remember_call_recap('${USER}', 'es', '${CALL}', ARRAY['ser-estar']::text[], '[]'::jsonb, false)`,
    );
    const rows = await db.query<{ course: string }>(
      "SELECT course FROM public.weakness_events WHERE category = 'ser-estar'",
    );
    expect(rows.rows).toEqual([{ course: "es" }]);
  });

  it("retiring a French weakness item logs the resolve in French, not English", async () => {
    await db.query(
      `SELECT public.apply_review_grade('${USER}', 'weakness:fr1', 'fr', 'attempt-1', NULL, current_date,
        true, true, current_date, NULL, NULL, NULL, NULL)`,
    );
    const rows = await db.query<{ course: string; event_type: string }>(
      "SELECT course, event_type FROM public.weakness_events WHERE event_type = 'resolved'",
    );
    expect(rows.rows).toEqual([{ course: "fr", event_type: "resolved" }]);
  });
});

describe("apply_review_grade with a language outside the three courses", () => {
  it("still retires the item and logs the resolve as English instead of failing the grade", async () => {
    await db.query(
      `INSERT INTO public.review_items (id, user_id, item_key, language, source, weakness_label, due_on)
       VALUES (gen_random_uuid(), '${USER}', 'weakness:de1', 'de', 'weakness', 'spelling', current_date)`,
    );
    await db.query(
      `SELECT public.apply_review_grade('${USER}', 'weakness:de1', 'de', 'attempt-de', NULL, current_date,
        true, true, current_date, NULL, NULL, NULL, NULL)`,
    );
    const rows = await db.query<{ course: string }>(
      "SELECT course FROM public.weakness_events WHERE category = 'spelling' AND event_type = 'resolved'",
    );
    expect(rows.rows).toEqual([{ course: "en" }]);
  });
});
