import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkNewTableGrants } from "./migration-grants";
import { REHEARSAL_FINISH_MIN_REPLIES } from "./practice-calls.server";

/**
 * Rehearsals slice 0 (20261130100000), EXECUTED in a real Postgres (PGlite): the per-account switch, the closing of a
 * rehearsal by time, and the finish floor passed as an argument. Built on the real migrations in production order.
 */
const read = (file: string) =>
  readFileSync(path.join(process.cwd(), "supabase/migrations", file), "utf8");
const MIGRATIONS = [
  "20261107032021_practice_stars.sql",
  "20261113100000_staff_console.sql",
  "20261119100000_call_recap_memory.sql",
  "20261128170000_call_recap_retryable_claim.sql",
  "20261128210000_weakness_events_course.sql",
  "20261129100000_rehearsals.sql",
  "20261129110000_rehearsal_run_memory.sql",
];
const NEW_FILE = "20261130100000_rehearsals_switch_and_auto_close.sql";
const NEW = read(NEW_FILE);

const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000b2";
const STAFF = "00000000-0000-4000-8000-0000000000e1";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

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
    INSERT INTO auth.users(id) VALUES ('${A}'), ('${B}'), ('${STAFF}');
    CREATE TABLE public.weakness_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
      category text NOT NULL, event_type text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.review_items (user_id uuid NOT NULL, item_key text NOT NULL, language text NOT NULL DEFAULT 'en',
      source text NOT NULL DEFAULT 'lesson', weakness_label text, PRIMARY KEY (user_id, item_key, language));
    CREATE TABLE public.ai_usage (user_id uuid NOT NULL, day date NOT NULL, kind text NOT NULL,
      count integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, day, kind));
    CREATE TABLE public.ai_rate_limits (user_id uuid NOT NULL, kind text NOT NULL, minute_bucket timestamptz NOT NULL,
      count integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, kind, minute_bucket));
    CREATE TABLE public.admin_users (user_id uuid PRIMARY KEY);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, display_name text);
  `);
  for (const m of MIGRATIONS) await db.exec(read(m));
  await db.exec(NEW);
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
const n = async (sql: string) => Number((await db.query<{ n: string }>(sql)).rows[0]!.n);

describe("the migration follows the repo's rules", () => {
  it("states what clients may do for the new table", () => {
    expect(checkNewTableGrants(NEW)).toEqual([]);
  });
});

describe("rehearsals_off and set_rehearsals_off", () => {
  it("gives clients nothing on the table, and only the server the function", async () => {
    await expect(
      asRole("authenticated", () => db.query(`SELECT 1 FROM public.rehearsals_off`), A),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asRole(
        "authenticated",
        () =>
          db.query(`INSERT INTO public.rehearsals_off (user_id, reason) VALUES ('${A}', 'x y z')`),
        A,
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asRole(
        "authenticated",
        () => db.query(`SELECT public.set_rehearsals_off('${A}', false, 'turn me on')`),
        A,
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("turns an account off with a reason, records the action, and turns it back on", async () => {
    const off = await server(() =>
      db.query<{ r: boolean }>(
        `SELECT public.set_rehearsals_off('${A}', true, 'asked to opt out', '${STAFF}') r`,
      ),
    );
    expect(off.rows[0]!.r).toBe(true);
    expect(await n(`SELECT count(*) n FROM public.rehearsals_off WHERE user_id = '${A}'`)).toBe(1);
    expect(await n(`SELECT count(*) n FROM public.rehearsals_off WHERE user_id = '${B}'`)).toBe(0);
    const audit = await db.query<{ action: string; reason: string }>(
      `SELECT action, reason FROM public.staff_audit_log WHERE target_user_id = '${A}' ORDER BY id`,
    );
    expect(audit.rows).toEqual([{ action: "user.rehearsals_off", reason: "asked to opt out" }]);
    // Again: nothing changes, nothing is recorded twice.
    const again = await server(() =>
      db.query<{ r: boolean }>(`SELECT public.set_rehearsals_off('${A}', true, 'asked again') r`),
    );
    expect(again.rows[0]!.r).toBe(false);
    expect(
      await n(`SELECT count(*) n FROM public.staff_audit_log WHERE target_user_id = '${A}'`),
    ).toBe(1);
    const on = await server(() =>
      db.query<{ r: boolean }>(`SELECT public.set_rehearsals_off('${A}', false, 'back on') r`),
    );
    expect(on.rows[0]!.r).toBe(true);
    expect(await n(`SELECT count(*) n FROM public.rehearsals_off`)).toBe(0);
    expect(
      (
        await db.query<{ action: string }>(
          `SELECT action FROM public.staff_audit_log ORDER BY id DESC LIMIT 1`,
        )
      ).rows[0]!.action,
    ).toBe("user.rehearsals_on");
  });

  it("refuses a missing reason", async () => {
    await expect(
      server(() => db.query(`SELECT public.set_rehearsals_off('${A}', true, '  ')`)),
    ).rejects.toThrow(/reason is required/);
  });
});

describe("close_stale_rehearsals", () => {
  const insert = (
    rid: string,
    user: string,
    course: string,
    eventDate: string | null,
    ageDays: number,
  ) =>
    db.exec(`
      INSERT INTO public.rehearsals (id, user_id, course, event_kind, event_date, counterpart, brief, free, created_at)
      VALUES ('${rid}', '${user}', '${course}', 'interview', ${eventDate ? `'${eventDate}'` : "NULL"}, 'a manager',
              '{}'::jsonb, false, now() - interval '${ageDays} days')`);
  const row = async (rid: string) =>
    (
      await db.query<{ status: string; outcome: unknown; closed_at: string | null }>(
        `SELECT status, outcome, closed_at FROM public.rehearsals WHERE id = '${rid}'`,
      )
    ).rows[0]!;
  const close = (user: string | null, today: string) =>
    server(async () =>
      Number(
        (
          await db.query<{ c: number }>(
            `SELECT public.close_stale_rehearsals(${user ? `'${user}'` : "NULL"}, '${today}') c`,
          )
        ).rows[0]!.c,
      ),
    );

  it("closes a dated rehearsal 7 days after its event date, by the learner's own day, with outcome none", async () => {
    await insert(id(11), A, "en", "2026-12-01", 3);
    expect(await close(A, "2026-12-07")).toBe(0);
    expect((await row(id(11))).status).toBe("active");
    expect(await close(A, "2026-12-08")).toBe(1);
    const closed = await row(id(11));
    expect(closed.status).toBe("done");
    expect(closed.outcome).toEqual({ choice: "none" });
    expect(closed.closed_at).not.toBeNull();
  });

  it("closes an undated rehearsal 30 days after its last activity, and a finished run keeps it open", async () => {
    await insert(id(12), A, "fr", null, 29);
    await insert(id(13), A, "es", null, 40);
    expect(await close(A, "2026-12-08")).toBe(1);
    expect((await row(id(12))).status).toBe("active");
    expect((await row(id(13))).status).toBe("done");
    // A finished run 5 days ago keeps an old undated rehearsal alive.
    await db.exec(`
      UPDATE public.rehearsals SET status = 'active', closed_at = NULL, outcome = NULL WHERE id = '${id(13)}';
      INSERT INTO public.rehearsal_runs (rehearsal_id, user_id, stage, finished_at)
        VALUES ('${id(13)}', '${A}', 'warmup', now() - interval '5 days');`);
    expect(await close(A, "2026-12-08")).toBe(0);
    expect((await row(id(13))).status).toBe("active");
  });

  it("only touches the named learner, leaves ended history alone, and frees the one-active slot", async () => {
    await insert(id(14), B, "en", "2026-11-01", 40);
    // B's rehearsal is long past, but only A is named: it stays active. A's own two are inside their windows.
    expect(await close(A, "2026-12-30")).toBe(0);
    expect((await row(id(14))).status).toBe("active");
    await db.exec(
      `UPDATE public.rehearsals SET status = 'cancelled', closed_at = now() WHERE id = '${id(14)}'`,
    );
    expect(await close(null, "2026-12-30")).toBe(0);
    expect((await row(id(14))).status).toBe("cancelled");
    // A new active rehearsal in the course is now allowed again (the slot is free).
    await insert(id(15), B, "en", "2027-03-01", 0);
    expect((await row(id(15))).status).toBe("active");
  });

  it("with no learner named closes everyone's, and is not callable by a client", async () => {
    await insert(id(16), B, "fr", "2026-06-01", 2);
    await insert(id(17), A, "en", "2026-06-02", 2);
    expect(await close(null, "2026-12-30")).toBeGreaterThanOrEqual(2);
    expect((await row(id(16))).status).toBe("done");
    expect((await row(id(17))).status).toBe("done");
    await expect(
      asRole(
        "authenticated",
        () => db.query(`SELECT public.close_stale_rehearsals(NULL, '2026-12-30')`),
        A,
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe("the finish floor", () => {
  it("has one default in SQL, and it is the one the server passes", () => {
    const def = /_min_replies integer DEFAULT (\d+)/.exec(NEW);
    expect(def).not.toBeNull();
    expect(Number(def![1])).toBe(REHEARSAL_FINISH_MIN_REPLIES);
  });

  it("is the argument: a call with 3 replies finishes under a floor of 3 and not under 4", async () => {
    await db.exec(`
      INSERT INTO public.rehearsals (id, user_id, course, event_kind, counterpart, brief, free)
        VALUES ('${id(30)}', '${B}', 'es', 'meeting', 'a lead', '{}'::jsonb, false);
      INSERT INTO public.practice_calls (id, user_id, course, kind, item_key, replies, finished_at, stars) VALUES
        ('${id(31)}', '${B}', 'es', 'rehearsal', '${id(30)}:warmup', 3, now(), 0);`);
    await server(() => db.query(`SELECT public.claim_call_recap('${B}', '${id(31)}')`));
    const call = (min: number) =>
      server(async () =>
        Number(
          (
            await db.query<{ r: number }>(
              `SELECT public.finish_rehearsal_recap('${B}', 'es', '${id(31)}', ARRAY[]::text[], '[]'::jsonb, true,
                 ARRAY[]::text[], ARRAY[]::text[], ARRAY[]::text[], ${min}) r`,
            )
          ).rows[0]!.r,
        ),
      );
    expect(await call(4)).toBe(-2);
    expect(
      await n(`SELECT count(*) n FROM public.rehearsal_runs WHERE rehearsal_id = '${id(30)}'`),
    ).toBe(0);
    expect(await call(3)).toBeGreaterThanOrEqual(0);
    expect(
      await n(`SELECT count(*) n FROM public.rehearsal_runs WHERE rehearsal_id = '${id(30)}'`),
    ).toBe(1);
  });

  it("leaves exactly one finish_rehearsal_recap function", async () => {
    expect(await n(`SELECT count(*) n FROM pg_proc WHERE proname = 'finish_rehearsal_recap'`)).toBe(
      1,
    );
  });
});
