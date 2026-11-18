import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  consumeStaffLimit,
  RATE_LIMIT_UNAVAILABLE_MESSAGE,
  STAFF_LIMITS,
  type StaffLimit,
} from "./staff-rate-limit";

/** consume_staff_rate_limit (20261125120000), EXECUTED in a real Postgres (PGlite). */
const FILE = "20261125120000_staff_rate_limits.sql";
const sqlText = readFileSync(path.join(process.cwd(), "supabase/migrations", FILE), "utf8");

const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000a2";
// One window that never rolls over during a test run, so the count cannot straddle a boundary.
const HUGE = 1_000_000_000;

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
  `);
  await db.exec(sqlText);
});
afterAll(async () => db.close());

const consume = async (actor: string, bucket: string, max: number, win = HUGE) =>
  (
    await db.query<{ ok: boolean }>(
      `SELECT public.consume_staff_rate_limit($1::uuid, $2, $3, $4) AS ok`,
      [actor, bucket, max, win],
    )
  ).rows[0]!.ok;

describe("consume_staff_rate_limit (real Postgres)", () => {
  it("allows exactly max calls in a window, then refuses", async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 5; i++) results.push(await consume(A, "t_exact", 3));
    expect(results).toEqual([true, true, true, false, false]);
  });

  it("a refused call is not counted (the stored count stops at max)", async () => {
    for (let i = 0; i < 6; i++) await consume(A, "t_stop", 2);
    const { rows } = await db.query<{ count: number }>(
      `SELECT count FROM public.staff_rate_limits WHERE actor_user_id = $1 AND bucket = 't_stop'`,
      [A],
    );
    expect(rows).toEqual([{ count: 2 }]);
  });

  it("is per staff member and per bucket", async () => {
    expect(await consume(A, "t_iso", 1)).toBe(true);
    expect(await consume(A, "t_iso", 1)).toBe(false);
    expect(await consume(B, "t_iso", 1)).toBe(true);
    expect(await consume(A, "t_iso_other", 1)).toBe(true);
  });

  it("is shared by every caller: the state lives in the table, not in a process", async () => {
    // Two separate sessions on the same database see one count (what two server instances do).
    await db.exec(`SELECT public.consume_staff_rate_limit('${B}'::uuid, 't_shared', 2, ${HUGE})`);
    const second = await consume(B, "t_shared", 2);
    const third = await consume(B, "t_shared", 2);
    expect([second, third]).toEqual([true, false]);
  });

  it("drops this bucket's earlier windows and starts the current one fresh", async () => {
    await db.exec(
      `INSERT INTO public.staff_rate_limits VALUES ('${A}', 't_old', to_timestamp(0), 99)`,
    );
    expect(await consume(A, "t_old", 1)).toBe(true);
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.staff_rate_limits WHERE actor_user_id = $1 AND bucket = 't_old'`,
      [A],
    );
    expect(rows[0]!.n).toBe(1);
  });

  it("rejects nonsense arguments instead of silently allowing", async () => {
    await expect(consume(A, "", 1)).rejects.toThrow(/invalid arguments/);
    await expect(consume(A, "x", 0)).rejects.toThrow(/invalid arguments/);
    await expect(consume(A, "x", 1, 0)).rejects.toThrow(/invalid arguments/);
  });

  it("only the service role can run it or touch the table", async () => {
    const priv = async (sql: string) => (await db.query<{ p: boolean }>(sql)).rows[0]!.p;
    for (const role of ["anon", "authenticated"]) {
      expect(
        await priv(
          `SELECT has_function_privilege('${role}', 'public.consume_staff_rate_limit(uuid,text,integer,integer)', 'EXECUTE') AS p`,
        ),
        role,
      ).toBe(false);
      for (const op of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        expect(
          await priv(
            `SELECT has_table_privilege('${role}', 'public.staff_rate_limits', '${op}') AS p`,
          ),
          `${role} ${op}`,
        ).toBe(false);
      }
    }
    expect(
      await priv(
        `SELECT has_function_privilege('service_role', 'public.consume_staff_rate_limit(uuid,text,integer,integer)', 'EXECUTE') AS p`,
      ),
    ).toBe(true);
  });

  it("carries the client-grants marker the CI guard requires", () => {
    expect(sqlText).toContain("-- client-grants: none public.staff_rate_limits");
  });
});

describe("consumeStaffLimit (the server side of it)", () => {
  const limit: StaffLimit = { bucket: "b", max: 2, windowSeconds: 60 };
  const client = (result: unknown) => {
    const calls: unknown[][] = [];
    return {
      calls,
      c: {
        rpc: async (...a: unknown[]) => {
          calls.push(a);
          return result;
        },
      } as never,
    };
  };

  it("passes the actor, bucket, ceiling and window to the database function and returns its answer", async () => {
    const t = client({ data: true, error: null });
    expect(await consumeStaffLimit(t.c, A, limit)).toBe(true);
    expect(t.calls).toEqual([
      ["consume_staff_rate_limit", { p_actor: A, p_bucket: "b", p_max: 2, p_window_seconds: 60 }],
    ]);
    expect(await consumeStaffLimit(client({ data: false, error: null }).c, A, limit)).toBe(false);
  });

  it("fails closed when the count cannot be made", async () => {
    await expect(
      consumeStaffLimit(client({ data: null, error: { message: "x" } }).c, A, limit),
    ).rejects.toThrow(RATE_LIMIT_UNAVAILABLE_MESSAGE);
    await expect(
      consumeStaffLimit(client({ data: null, error: null }).c, A, limit),
    ).rejects.toThrow(RATE_LIMIT_UNAVAILABLE_MESSAGE);
  });

  it("the console's ceilings are the ones the in-memory limiters had", () => {
    expect(STAFF_LIMITS.user_search.max).toBe(30);
    expect(STAFF_LIMITS.support_read.max).toBe(120);
    expect(STAFF_LIMITS.support_write.max).toBe(60);
    expect(STAFF_LIMITS.numbers.max).toBe(30);
    expect(STAFF_LIMITS.numbersRefresh.max).toBe(6);
  });
});
