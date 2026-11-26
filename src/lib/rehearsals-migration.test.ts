import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkNewTableGrants } from "./migration-grants";

/**
 * The Rehearsals tables (20261128220000_rehearsals.sql), EXECUTED in a real Postgres (PGlite) as seeded users: the
 * cascade on account delete, that the free-used marker outlives the rehearsal, that clients cannot write, the call
 * kind and the array caps.
 */
const read = (file: string) =>
  readFileSync(path.join(process.cwd(), "supabase/migrations", file), "utf8");
const PRACTICE_STARS = read("20261107032021_practice_stars.sql");
const MIGRATION = read("20261128220000_rehearsals.sql");

const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000b2";
const C = "00000000-0000-4000-8000-0000000000b3";
const R1 = "00000000-0000-4000-8000-0000000000d1";
const R2 = "00000000-0000-4000-8000-0000000000d2";
const CALL = "00000000-0000-4000-8000-0000000000c1";

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE service_role BYPASSRLS; CREATE ROLE authenticated; CREATE ROLE anon;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
    CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT NULLIF(current_setting('app.uid', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    INSERT INTO auth.users(id) VALUES ('${A}'), ('${B}'), ('${C}');
  `);
  await db.exec(PRACTICE_STARS);
  await db.exec(MIGRATION);
}, 120_000);
afterAll(async () => {
  await db.close();
});

const asRole = async <T>(role: string, fn: () => Promise<T>, uid = "") => {
  await db.exec(`SELECT set_config('app.uid', '${uid}', false); SET ROLE ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE; SELECT set_config('app.uid', '', false)");
  }
};
const server = <T>(fn: () => Promise<T>) => asRole("service_role", fn);
const asUser = <T>(uid: string, fn: () => Promise<T>) => asRole("authenticated", fn, uid);
const n = async (sql: string) => Number((await db.query<{ n: string }>(sql)).rows[0]!.n);

const brief = JSON.stringify({ setting: "x" });
const insertRehearsal = (id: string, user: string) =>
  server(() =>
    db.query(
      `INSERT INTO public.rehearsals (id, user_id, course, event_kind, counterpart, brief, free)
       VALUES ('${id}', '${user}', 'en', 'interview', 'a hiring manager', '${brief}'::jsonb, true)`,
    ),
  );

describe("the migration follows the repo's grant rules", () => {
  it("every new table states what clients may do", () => {
    expect(checkNewTableGrants(MIGRATION)).toEqual([]);
  });
});

describe("rows go with the account, the free marker goes only with the account", () => {
  it("deleting a rehearsal keeps rehearsal_free_used", async () => {
    await insertRehearsal(R1, A);
    await server(() =>
      db.query(`INSERT INTO public.rehearsal_free_used (user_id) VALUES ('${A}')`),
    );
    await server(() =>
      db.query(
        `INSERT INTO public.rehearsal_runs (rehearsal_id, user_id, stage) VALUES ('${R1}', '${A}', 'conversation')`,
      ),
    );
    await asUser(A, () => db.query(`DELETE FROM public.rehearsals WHERE id = '${R1}'`));
    expect(await n(`SELECT count(*)::text n FROM public.rehearsals`)).toBe(0);
    expect(await n(`SELECT count(*)::text n FROM public.rehearsal_runs`)).toBe(0); // runs go with it
    expect(await n(`SELECT count(*)::text n FROM public.rehearsal_free_used`)).toBe(1);
  });

  it("deleting the account removes all three tables' rows", async () => {
    await insertRehearsal(R2, B);
    await server(() =>
      db.query(`INSERT INTO public.rehearsal_free_used (user_id) VALUES ('${B}')`),
    );
    await server(() =>
      db.query(
        `INSERT INTO public.rehearsal_runs (rehearsal_id, user_id, stage) VALUES ('${R2}', '${B}', 'warmup')`,
      ),
    );
    await db.exec(`DELETE FROM auth.users WHERE id = '${B}'`);
    for (const t of ["rehearsals", "rehearsal_runs", "rehearsal_free_used"]) {
      expect(await n(`SELECT count(*)::text n FROM public.${t} WHERE user_id = '${B}'`)).toBe(0);
    }
  });
});

describe("what a learner can touch", () => {
  it("cannot insert or update rehearsals, runs or the marker", async () => {
    await expect(
      asUser(A, () =>
        db.query(
          `INSERT INTO public.rehearsals (user_id, course, event_kind, counterpart, brief, free)
           VALUES ('${A}', 'en', 'interview', 'x', '${brief}'::jsonb, false)`,
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await insertRehearsal(R1, A);
    await expect(
      asUser(A, () => db.query(`UPDATE public.rehearsals SET status = 'done'`)),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(A, () =>
        db.query(
          `INSERT INTO public.rehearsal_runs (rehearsal_id, user_id, stage) VALUES ('${R1}', '${A}', 'warmup')`,
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(A, () => db.query(`DELETE FROM public.rehearsal_free_used`)),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(A, () => db.query(`INSERT INTO public.rehearsal_free_used (user_id) VALUES ('${A}')`)),
    ).rejects.toThrow(/permission denied/);
  });

  it("reads only its own rows and anon reads nothing", async () => {
    expect(await asUser(A, () => n(`SELECT count(*)::text n FROM public.rehearsals`))).toBe(1);
    expect(await asUser(C, () => n(`SELECT count(*)::text n FROM public.rehearsals`))).toBe(0);
    await expect(asRole("anon", () => db.query("SELECT * FROM public.rehearsals"))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("cannot delete someone else's rehearsal", async () => {
    await asUser(C, () => db.query(`DELETE FROM public.rehearsals WHERE id = '${R1}'`));
    expect(await n(`SELECT count(*)::text n FROM public.rehearsals WHERE id = '${R1}'`)).toBe(1);
  });
});

describe("constraints", () => {
  it("accepts a 'rehearsal' practice call and star, rejects 'bogus'", async () => {
    await server(() =>
      db.query(
        `INSERT INTO public.practice_calls (id, user_id, course, kind, item_key) VALUES ('${CALL}', '${A}', 'en', 'rehearsal', '${R1}:conversation')`,
      ),
    );
    await server(() =>
      db.query(
        `INSERT INTO public.practice_stars (user_id, course, kind, item_key, best_stars) VALUES ('${A}', 'en', 'rehearsal', '${R1}:conversation', 2)`,
      ),
    );
    await expect(
      server(() =>
        db.query(
          `INSERT INTO public.practice_calls (id, user_id, course, kind, item_key) VALUES (gen_random_uuid(), '${A}', 'en', 'bogus', 'k')`,
        ),
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      server(() =>
        db.query(
          `INSERT INTO public.practice_stars (user_id, course, kind, item_key, best_stars) VALUES ('${A}', 'en', 'bogus', 'k', 1)`,
        ),
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("rejects an unknown event kind, status, stage and text over 200 characters", async () => {
    const ins = (kind: string, counterpart: string, worries = "NULL") =>
      server(() =>
        db.query(
          `INSERT INTO public.rehearsals (user_id, course, event_kind, counterpart, worries, brief, free)
           VALUES ('${A}', 'en', '${kind}', '${counterpart}', ${worries}, '${brief}'::jsonb, false)`,
        ),
      );
    await expect(ins("party", "x")).rejects.toThrow(/check constraint/);
    await expect(ins("interview", "x".repeat(201))).rejects.toThrow(/check constraint/);
    await expect(ins("interview", "x", `'${"w".repeat(201)}'`)).rejects.toThrow(/check constraint/);
    await expect(
      server(() => db.query(`UPDATE public.rehearsals SET status = 'bogus' WHERE id = '${R1}'`)),
    ).rejects.toThrow(/check constraint/);
    await expect(
      server(() =>
        db.query(
          `INSERT INTO public.rehearsal_runs (rehearsal_id, user_id, stage) VALUES ('${R1}', '${A}', 'bogus')`,
        ),
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("allows one active rehearsal per learner and course, and a second after it closes", async () => {
    const ins = (course: string) =>
      server(() =>
        db.query(
          `INSERT INTO public.rehearsals (user_id, course, event_kind, counterpart, brief, free)
           VALUES ('${C}', '${course}', 'meeting', 'x', '${brief}'::jsonb, false)`,
        ),
      );
    await ins("fr");
    await expect(ins("fr")).rejects.toThrow(/duplicate key|unique/);
    await ins("es"); // another course is fine
    await server(() =>
      db.query(
        `UPDATE public.rehearsals SET status = 'done' WHERE user_id = '${C}' AND course = 'fr'`,
      ),
    );
    await ins("fr");
  });

  it("caps each run array at 5 items of at most 140 characters", async () => {
    const run = (col: string, value: string) =>
      server(() =>
        db.query(
          `INSERT INTO public.rehearsal_runs (rehearsal_id, user_id, stage, ${col}) VALUES ('${R1}', '${A}', 'warmup', ${value})`,
        ),
      );
    for (const col of ["moments_shown", "went_well", "corrections"]) {
      await run(col, `ARRAY['a','b','c','d','e']`); // five is fine
      await expect(run(col, `ARRAY['a','b','c','d','e','f']`)).rejects.toThrow(/check constraint/);
      await expect(run(col, `ARRAY['${"x".repeat(141)}']`)).rejects.toThrow(/check constraint/);
      await run(col, `ARRAY['${"x".repeat(140)}']`);
    }
  });
});
