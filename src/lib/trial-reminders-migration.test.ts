import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

const MIGRATIONS = path.join(process.cwd(), "supabase/migrations");
const FILE = "20261128150000_trial_reminders.sql";
const migration = readFileSync(path.join(MIGRATIONS, FILE), "utf8");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("trial reminders migration ordering", () => {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"));
  it("sorts after the video drafts migration on main and has no duplicate version", () => {
    expect(FILE.slice(0, 14) > "20261128140000").toBe(true);
    const versions = files.map((f) => f.slice(0, 14));
    expect(new Set(versions).size).toBe(versions.length);
  });
  it("carries the no-client-grants marker for both tables and grants clients nothing", () => {
    expect(migration).toContain("-- client-grants: none public.trial_reminders");
    expect(migration).toContain("-- client-grants: none public.trial_reminder_checked");
    expect(migration).not.toMatch(/GRANT [^;]*TO (anon|authenticated)/i);
  });
});

describe("trial_reminder_candidates (real Postgres)", () => {
  let db: PGlite;
  const select = async (since: string, before: string, limit = 100) =>
    (
      await db.query<{ user_id: string }>(
        `SELECT user_id FROM public.trial_reminder_candidates($1::date, $2::timestamptz, $3)`,
        [since, before, limit],
      )
    ).rows.map((r) => r.user_id);

  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      GRANT USAGE ON SCHEMA public TO service_role, authenticated, anon;
      CREATE TABLE public.activity_days (user_id uuid NOT NULL, day date NOT NULL, PRIMARY KEY (user_id, day));
    `);
    for (let n = 1; n <= 6; n += 1) await db.exec(`INSERT INTO auth.users VALUES ('${id(n)}')`);
    await db.exec(migration);
    // 1: active, never checked.  2: active two days, checked 25h ago.  3: active, checked 30h ago.
    // 4: active, checked 1h ago.  5: active but already reminded.  6: not active recently.
    await db.exec(`
      INSERT INTO public.activity_days VALUES
        ('${id(1)}', '2026-11-25'), ('${id(2)}', '2026-11-25'), ('${id(2)}', '2026-11-24'),
        ('${id(3)}', '2026-11-25'), ('${id(4)}', '2026-11-25'), ('${id(5)}', '2026-11-25'),
        ('${id(6)}', '2026-10-01');
      INSERT INTO public.trial_reminder_checked VALUES
        ('${id(2)}', '2026-11-25T09:00:00Z'), ('${id(3)}', '2026-11-25T04:00:00Z'),
        ('${id(4)}', '2026-11-26T09:00:00Z');
      INSERT INTO public.trial_reminders (user_id, trial_ends_at) VALUES ('${id(5)}', '2026-11-28T00:00:00Z');
    `);
  });

  it("returns never-checked first, then the least recently checked, once each", async () => {
    expect(await select("2026-11-17", "2026-11-25T14:00:00Z")).toEqual([id(1), id(3), id(2)]);
  });

  it("leaves out anyone checked since the cutoff, anyone already reminded and anyone not recently active", async () => {
    const ids = await select("2026-11-17", "2026-11-25T14:00:00Z");
    expect(ids).not.toContain(id(4));
    expect(ids).not.toContain(id(5));
    expect(ids).not.toContain(id(6));
  });

  it("respects the limit, taking the front of the order", async () => {
    expect(await select("2026-11-17", "2026-11-25T14:00:00Z", 2)).toEqual([id(1), id(3)]);
  });

  it("after a learner is marked checked they drop out until the cutoff passes, so successive sweeps cover everyone", async () => {
    const first = await select("2026-11-17", "2026-11-25T14:00:00Z", 2);
    for (const u of first) {
      await db.query(
        `INSERT INTO public.trial_reminder_checked VALUES ($1, '2026-11-26T10:00:00Z')
         ON CONFLICT (user_id) DO UPDATE SET checked_at = EXCLUDED.checked_at`,
        [u],
      );
    }
    expect(await select("2026-11-17", "2026-11-25T14:00:00Z", 2)).toEqual([id(2)]);
  });

  it("is executable by the service role only", async () => {
    const r = await db.query<{ anon: boolean; auth: boolean; svc: boolean }>(
      `SELECT has_function_privilege('anon', 'public.trial_reminder_candidates(date, timestamptz, integer)', 'EXECUTE') AS anon,
              has_function_privilege('authenticated', 'public.trial_reminder_candidates(date, timestamptz, integer)', 'EXECUTE') AS auth,
              has_function_privilege('service_role', 'public.trial_reminder_candidates(date, timestamptz, integer)', 'EXECUTE') AS svc`,
    );
    expect(r.rows[0]).toEqual({ anon: false, auth: false, svc: true });
  });
});
