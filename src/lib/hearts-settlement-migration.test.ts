import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

const U1 = "00000000-0000-4000-8000-000000000001";
const U2 = "00000000-0000-4000-8000-000000000002";
const T1 = "a".repeat(64);
const T2 = "b".repeat(64);
const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261105101000_hearts_settled_on_server.sql"),
  "utf8",
);

describe("hearts settled on the server (real Postgres)", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      INSERT INTO auth.users VALUES ('${U1}'), ('${U2}');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;
      CREATE TABLE public.user_progress (
        user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        hearts integer NOT NULL DEFAULT 5,
        hearts_refill_at timestamptz
      );
      INSERT INTO public.user_progress (user_id) VALUES ('${U1}'), ('${U2}');
    `);
    await db.exec(migration);
  });

  async function as(uid: string) {
    await db.query("SELECT set_config('test.uid', $1, false)", [uid]);
  }
  async function loseHeart(uid = U1) {
    await as(uid);
    const r = await db.query<{ hearts: number }>("SELECT * FROM public.lose_heart()");
    return r.rows[0]!.hearts;
  }
  async function settle(
    misses: number,
    opts: { token?: string; enforce?: boolean; pro?: boolean; since?: string; user?: string } = {},
  ) {
    const r = await db.query<{
      hearts: number;
      hearts_refill_at: string | null;
      charged: number;
      settled_now: boolean;
    }>("SELECT * FROM public.settle_lesson_hearts($1::uuid, $2, $3, $4::timestamptz, $5, $6)", [
      opts.user ?? U1,
      opts.token ?? T1,
      misses,
      opts.since ?? new Date(Date.now() - 60_000).toISOString(),
      opts.enforce ?? true,
      opts.pro ?? false,
    ]);
    return r.rows[0]!;
  }
  async function hearts(uid = U1) {
    const r = await db.query<{ hearts: number; hearts_refill_at: string | null }>(
      "SELECT hearts, hearts_refill_at FROM public.user_progress WHERE user_id = $1",
      [uid],
    );
    return r.rows[0]!;
  }

  it("an app that reported every miss pays exactly once: the settlement charges nothing more", async () => {
    await loseHeart();
    await loseHeart();
    await loseHeart();
    const s = await settle(3);
    expect(s).toMatchObject({ hearts: 2, charged: 0, settled_now: true });
    expect((await hearts()).hearts).toBe(2);
  });

  it("misses nobody reported are charged by the settlement", async () => {
    const s = await settle(3);
    expect(s).toMatchObject({ hearts: 2, charged: 3 });
    expect((await hearts()).hearts).toBe(2);
  });

  it("a partly reported lesson is charged only the difference", async () => {
    await loseHeart();
    expect((await settle(3)).charged).toBe(2);
    expect((await hearts()).hearts).toBe(2);
  });

  it("shadow mode records what it would charge and changes no hearts", async () => {
    const s = await settle(3, { enforce: false });
    expect(s.charged).toBe(0);
    expect((await hearts()).hearts).toBe(5);
    const row = await db.query<{ would_charge: number; credits_left: number }>(
      "SELECT would_charge, credits_left FROM public.lesson_heart_settlements",
    );
    expect(row.rows[0]).toEqual({ would_charge: 3, credits_left: 0 });
  });

  it("settles a session once: a retried completion charges nothing", async () => {
    await settle(2);
    const again = await settle(2);
    expect(again).toMatchObject({ charged: 0, settled_now: false, hearts: 3 });
    expect((await hearts()).hearts).toBe(3);
    // A different session is settled on its own.
    expect((await settle(1, { token: T2 })).charged).toBe(1);
  });

  it("a report from before this learner's previous settlement is never counted against a later lesson", async () => {
    await loseHeart(); // an earlier lesson's miss, already settled below
    await settle(0, { token: T2 });
    const s = await settle(2, { since: new Date(Date.now() + 1000).toISOString() });
    expect(s.charged).toBe(2);
    expect((await hearts()).hearts).toBe(2);
  });

  it("a token issued after the lesson's own lose_heart calls (minted at finish, or re-minted at sync) charges nothing extra", async () => {
    await loseHeart();
    await loseHeart();
    const s = await settle(2, { since: new Date(Date.now() + 60_000).toISOString() });
    expect(s.charged).toBe(0);
    expect((await hearts()).hearts).toBe(3);
  });

  it("reports older than the token lifetime before the session start are not counted", async () => {
    await loseHeart();
    await db.query("UPDATE public.heart_loss_reports SET at = now() - interval '4 hours'");
    const s = await settle(1);
    expect(s.charged).toBe(1);
  });

  it("this session's own reports are claimed before earlier unclaimed ones", async () => {
    await loseHeart(); // before the session
    await db.query("UPDATE public.heart_loss_reports SET at = now() - interval '10 minutes'");
    await loseHeart(); // during the session
    expect((await settle(1, { since: new Date(Date.now() - 60_000).toISOString() })).charged).toBe(0);
    const left = await db.query<{ n: number }>(
      "SELECT count(*)::int n FROM public.heart_loss_reports WHERE NOT claimed AND at < now() - interval '5 minutes'",
    );
    expect(left.rows[0]!.n).toBe(1);
  });

  it("a lose_heart arriving after its lesson was settled uses the settlement's credit instead of charging again", async () => {
    await settle(2); // charged 2, two credits
    expect(await loseHeart()).toBe(3);
    expect(await loseHeart()).toBe(3);
    // Credits used up: the next one is a new miss and costs a heart.
    expect(await loseHeart()).toBe(2);
  });

  it("shadow mode leaves no credits, so late calls deduct as they always did", async () => {
    await settle(2, { enforce: false });
    expect(await loseHeart()).toBe(4);
  });

  it("charging to zero starts the refill timer and never goes below zero", async () => {
    const s = await settle(9);
    expect(s.hearts).toBe(0);
    expect(s.charged).toBe(5);
    expect((await hearts()).hearts_refill_at).not.toBeNull();
  });

  it("a refill that is already due is applied before the charge", async () => {
    await db.query(
      "UPDATE public.user_progress SET hearts = 0, hearts_refill_at = now() - interval '1 minute' WHERE user_id = $1",
      [U1],
    );
    const s = await settle(1);
    expect(s.hearts).toBe(4);
    expect(s.hearts_refill_at).toBeNull();
  });

  it("Pro: lose_heart never deducts and the settlement refills to full", async () => {
    await db.query("UPDATE public.user_progress SET hearts = 2 WHERE user_id = $1", [U1]);
    await db.query("INSERT INTO public.hearts_pro_status (user_id, pro) VALUES ($1, true)", [U1]);
    expect(await loseHeart()).toBe(2);
    const n = await db.query<{ n: number }>(
      "SELECT count(*)::int n FROM public.heart_loss_reports",
    );
    expect(n.rows[0]!.n).toBe(0);
    const s = await settle(4, { pro: true });
    expect(s).toMatchObject({ hearts: 5, charged: 0 });
  });

  it("a Pro check older than an hour no longer counts", async () => {
    await db.query(
      "INSERT INTO public.hearts_pro_status (user_id, pro, checked_at) VALUES ($1, true, now() - interval '2 hours')",
      [U1],
    );
    expect(await loseHeart()).toBe(4);
  });

  it("a confirmed non-Pro status does not give unlimited hearts", async () => {
    await db.query("INSERT INTO public.hearts_pro_status (user_id, pro) VALUES ($1, false)", [U1]);
    expect(await loseHeart()).toBe(4);
  });

  it("one learner's reports and credits never affect another learner", async () => {
    await loseHeart(U2);
    await settle(1, { user: U1 });
    expect((await hearts(U1)).hearts).toBe(4);
    expect(await loseHeart(U2)).toBe(3);
  });

  it("rejects malformed input", async () => {
    await expect(settle(-1)).rejects.toThrow(/invalid hearts settlement/);
    await expect(settle(1, { token: "not-a-hash" })).rejects.toThrow(/invalid hearts settlement/);
  });

  it("the settlement is server-only; learners can still call lose_heart but cannot read the new tables", async () => {
    await as(U1);
    await db.exec("SET ROLE authenticated");
    await expect(settle(1)).rejects.toThrow(/permission denied/);
    await expect(db.query("SELECT * FROM public.heart_loss_reports")).rejects.toThrow(
      /permission denied/,
    );
    await expect(db.query("SELECT * FROM public.hearts_pro_status")).rejects.toThrow(
      /permission denied/,
    );
    await expect(db.query("SELECT public.hearts_unlimited($1::uuid)", [U1])).rejects.toThrow(
      /permission denied/,
    );
    await db.exec("RESET ROLE");
  });
});
