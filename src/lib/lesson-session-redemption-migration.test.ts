import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const USER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const T1 = "a".repeat(64);
const T2 = "b".repeat(64);
const read = (f: string) =>
  readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const atomic = read("20261014100300_atomic_lesson_completion.sql");
const migration = read("20261123110000_lesson_session_single_use.sql");

const next = (xp: number) => ({
  streak: 1,
  longest_streak: 1,
  last_active_date: new Date().toISOString().slice(0, 10),
  hearts: 5,
  hearts_refill_at: null,
  streak_freezes: 0,
  xp,
  league_tier: "bronze",
  best_correct: 8,
  total: 8,
  best_xp: xp,
  day_xp: xp,
});
const RESULT = { xpGain: 100, correct: 8, newlyUnlocked: [], heartsBonus: null, progress: { xp: 100 } };

describe("single-use lesson sessions (real Postgres)", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE public.user_progress(
        user_id uuid PRIMARY KEY REFERENCES auth.users(id), streak integer,
        longest_streak integer, last_active_date date, hearts integer,
        hearts_refill_at timestamptz, streak_freezes integer,
        updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE public.language_progress(
        user_id uuid REFERENCES auth.users(id), language text, xp integer,
        league_tier text, updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY(user_id,language));
      CREATE TABLE public.lesson_completions(
        user_id uuid REFERENCES auth.users(id), lesson_id text, language text,
        correct integer, total integer, xp_earned integer,
        UNIQUE(user_id,lesson_id));
      CREATE TABLE public.activity_days(
        user_id uuid REFERENCES auth.users(id), day date, xp_earned integer,
        PRIMARY KEY(user_id,day));
      CREATE TABLE public.review_items(
        user_id uuid REFERENCES auth.users(id), item_key text, lesson_id text,
        level text, language text, ease real, interval_days integer,
        repetitions integer, due_on date,
        UNIQUE(user_id,item_key,language));
      CREATE TABLE public.friend_activity_events(
        user_id uuid REFERENCES auth.users(id), event_type text, payload jsonb);
    `);
    await db.exec(atomic);
    await db.exec(migration);
    await db.query("INSERT INTO auth.users(id) VALUES ($1), ($2)", [USER, OTHER]);
  }, 120_000);
  afterEach(async () => {
    await db.close();
  });

  type Once = { status: string; result?: unknown; misses?: number; settle_since?: string };
  async function once(
    opts: { token?: string; user?: string; xp?: number; expected?: object; misses?: number } = {},
  ): Promise<Once> {
    const r = await db.query<{ r: Once }>(
      `SELECT public.apply_lesson_completion_once(
         $1::uuid,'en','u1l1','A1',current_date,$2::jsonb,$3::jsonb,'["q2"]'::jsonb,
         '[{"event_type":"lesson_completed","payload":{}}]'::jsonb,
         $4,$5::jsonb,$6::integer,'2026-11-17T10:00:00Z'::timestamptz) AS r`,
      [
        opts.user ?? USER,
        JSON.stringify(opts.expected ?? {}),
        JSON.stringify(next(opts.xp ?? 100)),
        opts.token ?? T1,
        JSON.stringify({ ...RESULT, xpGain: opts.xp ?? 100 }),
        opts.misses ?? 1,
      ],
    );
    return r.rows[0]!.r;
  }
  const count = async (t: string) =>
    Number((await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.${t}`)).rows[0]!.n);

  it("a token redeems once: the repeat returns the stored result and writes nothing", async () => {
    expect((await once()).status).toBe("applied");
    const xpBefore = (await db.query("SELECT xp FROM public.language_progress")).rows;
    const eventsBefore = await count("friend_activity_events");
    // The repeat carries a different "better" payload and a stale snapshot: it is still answered from the original.
    const again = await once({ xp: 999, misses: 0 });
    expect(again).toMatchObject({ status: "redeemed", misses: 1 });
    expect((again.result as { xpGain: number }).xpGain).toBe(100);
    expect(again.settle_since).toBeTruthy();
    expect((await db.query("SELECT xp FROM public.language_progress")).rows).toEqual(xpBefore);
    expect(await count("friend_activity_events")).toBe(eventsBefore);
    expect(await count("lesson_completions")).toBe(1);
    expect(await count("lesson_session_redemptions")).toBe(1);
  });

  it("a different token is a separate redemption (a replay of the lesson is still allowed, paying only the delta in the caller)", async () => {
    await once();
    const second = await once({ token: T2, expected: {} });
    // The caller's snapshot is stale after the first save, so the database refuses it as a conflict, and a
    // refused save claims nothing: the token stays usable for the retry that re-reads.
    expect(second.status).toBe("conflict");
    expect(await count("lesson_session_redemptions")).toBe(1);
  });

  it("a conflict claims nothing, so the retry with fresh state can still redeem the token", async () => {
    await once();
    const conflict = await once({ token: T2 });
    expect(conflict.status).toBe("conflict");
    const snap = (
      await db.query<{ p: string; lp: string }>(
        `SELECT (SELECT updated_at::text FROM public.user_progress) AS p,
                (SELECT updated_at::text FROM public.language_progress) AS lp`,
      )
    ).rows[0]!;
    const retry = await once({
      token: T2,
      xp: 100,
      expected: { p_updated_at: snap.p, lp_updated_at: snap.lp, completion_xp: 100, day_xp: 100 },
    });
    expect(retry.status).toBe("applied");
    expect(await count("lesson_session_redemptions")).toBe(2);
  });

  it("the save and the claim are one transaction: a failing save leaves the token unclaimed", async () => {
    await db.exec(`
      CREATE FUNCTION public.reject_event() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'injected event failure'; END; $$;
      CREATE TRIGGER reject_event BEFORE INSERT ON public.friend_activity_events
      FOR EACH ROW EXECUTE FUNCTION public.reject_event();
    `);
    await expect(once()).rejects.toThrow(/injected event failure/);
    expect(await count("lesson_session_redemptions")).toBe(0);
    expect(await count("lesson_completions")).toBe(0);
  });

  it("a token redeemed by one account is never an answer for another", async () => {
    await once();
    await expect(once({ user: OTHER })).rejects.toThrow(/different completion/);
  });

  it("finalize replaces the stored result, only for its owner", async () => {
    await once();
    const fin = { ...RESULT, newlyUnlocked: ["first_lesson"] };
    await db.query("SELECT public.finalize_lesson_session_result($1::uuid,$2,$3::jsonb)", [
      OTHER,
      T1,
      JSON.stringify({ ...RESULT, xpGain: 1 }),
    ]);
    expect(((await once()).result as { xpGain: number }).xpGain).toBe(100);
    await db.query("SELECT public.finalize_lesson_session_result($1::uuid,$2,$3::jsonb)", [
      USER,
      T1,
      JSON.stringify(fin),
    ]);
    expect((await once()).result).toEqual(fin);
  });

  it("rows older than 7 days are purged on the user's next redemption", async () => {
    await once();
    await db.exec(
      "UPDATE public.lesson_session_redemptions SET created_at = now() - interval '8 days'",
    );
    const snap = (
      await db.query<{ p: string; lp: string }>(
        `SELECT (SELECT updated_at::text FROM public.user_progress) AS p,
                (SELECT updated_at::text FROM public.language_progress) AS lp`,
      )
    ).rows[0]!;
    await once({
      token: T2,
      expected: { p_updated_at: snap.p, lp_updated_at: snap.lp, completion_xp: 100, day_xp: 100 },
    });
    const rows = (await db.query<{ token_hash: string }>("SELECT token_hash FROM public.lesson_session_redemptions")).rows;
    expect(rows.map((r) => r.token_hash)).toEqual([T2]);
  });

  it("clients can do nothing to the table or the functions (zero client writes)", async () => {
    for (const role of ["anon", "authenticated"]) {
      const priv = await db.query<{ p: boolean }>(
        `SELECT has_table_privilege('${role}', 'public.lesson_session_redemptions', 'INSERT,UPDATE,DELETE,SELECT') AS p`,
      );
      expect(priv.rows[0]!.p).toBe(false);
      for (const priv of ["INSERT", "UPDATE", "DELETE", "SELECT"]) {
        const r = await db.query<{ p: boolean }>(
          `SELECT has_table_privilege('${role}', 'public.lesson_session_redemptions', '${priv}') AS p`,
        );
        expect(r.rows[0]!.p).toBe(false);
      }
      const fn = await db.query<{ p: boolean }>(
        `SELECT has_function_privilege('${role}', 'public.finalize_lesson_session_result(uuid,text,jsonb)', 'EXECUTE') AS p`,
      );
      expect(fn.rows[0]!.p).toBe(false);
    }
  });
});

describe("redemption retention in the maintenance sweep", () => {
  it("the newest run_maintenance_sweep deletes redemptions older than 7 days and keeps the earlier pruning", () => {
    const dir = path.join(process.cwd(), "supabase/migrations");
    let latest = "";
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
      const sql = readFileSync(path.join(dir, f), "utf8");
      for (const m of sql.matchAll(
        /CREATE (?:OR REPLACE )?FUNCTION public\.run_maintenance_sweep\(\)[\s\S]*?\n\$\$;/g,
      )) {
        latest = m[0];
      }
    }
    expect(latest).toMatch(
      /DELETE FROM public\.lesson_session_redemptions WHERE created_at < now\(\) - interval '7 days'/,
    );
    // Not a truncated copy: the support purge and the web call are still there.
    expect(latest).toContain("support_purge_old");
    expect(latest).toContain("net.http_post");
    expect(latest).toContain("DELETE FROM public.review_grade_attempts");
  });
});
