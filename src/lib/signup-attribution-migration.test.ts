import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const FILE = "20261018110000_signup_attribution.sql";
const migration = readFileSync(path.join(process.cwd(), "supabase/migrations", FILE), "utf8");

const NEW_USER = "00000000-0000-4000-8000-0000000000a1";
const OLD_USER = "00000000-0000-4000-8000-0000000000a2";
const OTHER_USER = "00000000-0000-4000-8000-0000000000a3";

describe("signup_attribution migration (real Postgres)", () => {
  let db: PGlite;

  async function as(user: string | null) {
    await db.exec(
      user === null
        ? "RESET request.jwt.claim.sub"
        : `SELECT set_config('request.jwt.claim.sub', '${user}', false)`,
    );
  }
  async function record(
    source: string | null,
    medium: string | null,
    campaign: string | null,
    landedAt: string | null = null,
  ) {
    const r = await db.query<{ r: string }>(
      "SELECT public.record_signup_attribution($1,$2,$3,$4::timestamptz) AS r",
      [source, medium, campaign, landedAt],
    );
    return r.rows[0]!.r;
  }
  async function rows() {
    const r = await db.query<Record<string, unknown>>(
      "SELECT user_id, utm_source, utm_medium, utm_campaign, landed_at FROM public.signup_attribution ORDER BY user_id",
    );
    return r.rows;
  }

  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA auth, public TO authenticated, anon, service_role;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon, service_role;
      GRANT SELECT ON auth.users TO service_role;
    `);
    await db.exec(migration);
    await db.query("INSERT INTO auth.users(id, created_at) VALUES ($1, now())", [NEW_USER]);
    await db.query(
      "INSERT INTO auth.users(id, created_at) VALUES ($1, now() - interval '30 days')",
      [OLD_USER],
    );
    await db.query("INSERT INTO auth.users(id, created_at) VALUES ($1, now())", [OTHER_USER]);
  }, 120_000);
  afterEach(async () => {
    await db.close();
  });

  it("is newer than the latest migration it follows", () => {
    expect(FILE.slice(0, 14) > "20261018100000").toBe(true);
  });

  it("records the first sign-up attribution for a new account", async () => {
    await as(NEW_USER);
    expect(await record("r_testflight", "post", "beta1", "2026-10-17T10:00:00Z")).toBe("recorded");
    const [row] = await rows();
    expect(row).toMatchObject({
      user_id: NEW_USER,
      utm_source: "r_testflight",
      utm_medium: "post",
      utm_campaign: "beta1",
    });
    expect(new Date(row!.landed_at as string).toISOString()).toBe("2026-10-17T10:00:00.000Z");
  });

  it("never overwrites: the second call keeps the first touch", async () => {
    await as(NEW_USER);
    await record("site", "button", "beta1");
    expect(await record("r_languagelearning", "post", "beta1")).toBe("already");
    expect((await rows())[0]).toMatchObject({ utm_source: "site" });
  });

  it("ignores an account older than 7 days (stale storage on a returning learner)", async () => {
    await as(OLD_USER);
    expect(await record("site", "button", "beta1")).toBe("not_new");
    expect(await rows()).toHaveLength(0);
  });

  it("does nothing without a signed-in user", async () => {
    await as(null);
    expect(await record("site", "button", "beta1")).toBe("unauthenticated");
    expect(await rows()).toHaveLength(0);
  });

  it("lowercases and trims, and drops values that are not short plain tags", async () => {
    await as(NEW_USER);
    expect(await record("  Site ", "<script>alert(1)</script>", "x".repeat(65))).toBe("recorded");
    expect((await rows())[0]).toMatchObject({
      utm_source: "site",
      utm_medium: null,
      utm_campaign: null,
    });
  });

  it("stores nothing when every value is empty or invalid", async () => {
    await as(NEW_USER);
    expect(await record("", "has space", null)).toBe("empty");
    expect(await rows()).toHaveLength(0);
  });

  it("clamps a landing time in the future to now", async () => {
    await as(NEW_USER);
    await record("site", null, null, "2999-01-01T00:00:00Z");
    const r = await db.query<{ ok: boolean }>(
      "SELECT landed_at <= now() AS ok FROM public.signup_attribution",
    );
    expect(r.rows[0]!.ok).toBe(true);
  });

  it("collects no network or device data: the table holds only the tags and two timestamps", async () => {
    const cols = await db.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'signup_attribution' ORDER BY ordinal_position",
    );
    expect(cols.rows.map((c) => c.column_name)).toEqual([
      "user_id",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "landed_at",
      "created_at",
    ]);
  });

  it("lets a learner read only their own row and gives clients no write privilege", async () => {
    await as(NEW_USER);
    await record("site", "button", "beta1");
    await as(OTHER_USER);
    await record("video", "post", "beta1");

    await db.exec("SET ROLE authenticated");
    await as(NEW_USER);
    const own = await db.query("SELECT user_id FROM public.signup_attribution");
    expect(own.rows).toEqual([{ user_id: NEW_USER }]);
    await expect(
      db.query("INSERT INTO public.signup_attribution(user_id, utm_source) VALUES ($1,'x')", [
        NEW_USER,
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(db.query("UPDATE public.signup_attribution SET utm_source = 'x'")).rejects.toThrow(
      /permission denied/,
    );
    await expect(db.query("DELETE FROM public.signup_attribution")).rejects.toThrow(
      /permission denied/,
    );
    await db.exec("RESET ROLE");

    await db.exec("SET ROLE anon");
    await expect(db.query("SELECT * FROM public.signup_attribution")).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      db.query("SELECT public.record_signup_attribution('a','b','c',NULL)"),
    ).rejects.toThrow(/permission denied/);
    await db.exec("RESET ROLE");
  });

  it("is removed with the account", async () => {
    await as(NEW_USER);
    await record("site", "button", "beta1");
    await db.query("DELETE FROM auth.users WHERE id = $1", [NEW_USER]);
    expect(await rows()).toHaveLength(0);
  });
});
