import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * 20261128200000: the claim of /api/hector-call-end, EXECUTED in a real Postgres (PGlite). A call is claimed once; a
 * live claim blocks a second; a release re-opens it; a claim whose holder died is taken over after the 2 minute lease;
 * only a completed call is 'done', and it is never claimed or released again; clients hold nothing; the rows go with
 * the account.
 */
const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261128200000_hector_call_ends.sql"),
  "utf8",
);
const U = "00000000-0000-4000-8000-0000000000a1";
const C = "00000000-0000-4000-8000-0000000000c1";

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated, anon, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated, anon, service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES ('${U}');
  `);
  await db.exec(migration);
}, 120_000);
afterAll(async () => {
  await db.close();
});

const one = async (sql: string) => (await db.query<{ r: unknown }>(sql)).rows[0]!.r;
const claim = () => one(`SELECT public.claim_hector_call('${U}', '${C}') r`);

describe("20261128200000_hector_call_ends.sql (real Postgres)", () => {
  it("claims once, blocks a second while the lease is live, and re-opens on release", async () => {
    expect(await claim()).toBe("claimed");
    expect(await claim()).toBe("busy");
    expect(await one(`SELECT public.release_hector_call('${U}', '${C}') r`)).toBe(true);
    expect(await claim()).toBe("claimed");
  });

  it("takes over an unfinished claim after the lease, but never before", async () => {
    await db.exec(
      `UPDATE public.hector_call_ends SET claimed_at = now() - interval '1 minute' WHERE call_id = '${C}'`,
    );
    expect(await claim()).toBe("busy");
    await db.exec(
      `UPDATE public.hector_call_ends SET claimed_at = now() - interval '3 minutes' WHERE call_id = '${C}'`,
    );
    expect(await claim()).toBe("claimed");
  });

  it("only a completed call is done, and it is never claimed or released again", async () => {
    expect(await one(`SELECT public.complete_hector_call('${U}', '${C}') r`)).toBe(true);
    await db.exec(
      `UPDATE public.hector_call_ends SET claimed_at = now() - interval '1 day' WHERE call_id = '${C}'`,
    );
    expect(await claim()).toBe("done");
    expect(await one(`SELECT public.release_hector_call('${U}', '${C}') r`)).toBe(false);
    expect(await one(`SELECT public.complete_hector_call('${U}', '${C}') r`)).toBe(false);
  });

  it("closed to clients: a signed-in role can neither read the table nor call the functions", async () => {
    await db.exec(`SET ROLE authenticated`);
    try {
      await expect(db.query(`SELECT * FROM public.hector_call_ends`)).rejects.toThrow(
        /permission denied/,
      );
      await expect(db.query(`SELECT public.claim_hector_call('${U}', '${C}')`)).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await db.exec(`RESET ROLE`);
    }
  });

  it("goes with the account", async () => {
    await db.exec(`DELETE FROM auth.users WHERE id = '${U}'`);
    expect(await one(`SELECT count(*)::int r FROM public.hector_call_ends`)).toBe(0);
  });
});
