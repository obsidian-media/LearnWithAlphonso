import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { costConfig } from "./ai-cost-config";
import {
  buildBreakerEmail,
  parseBreakerTrip,
  sweepAiCost,
  type AiCostSweepDeps,
} from "./ai-cost-sweep.server";

const MICRO = 1_000_000;

/** trip_ai_spend_breaker (20261125130000), EXECUTED in a real Postgres (PGlite) over stand-ins for its two dependencies. */
const FILE = "20261125130000_ai_spend_breaker.sql";
const sqlText = readFileSync(path.join(process.cwd(), "supabase/migrations", FILE), "utf8");

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
    CREATE TABLE public.app_switches (key text PRIMARY KEY, enabled boolean NOT NULL DEFAULT true, note text, updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.cost_stub (u_day date NOT NULL, u_micro bigint NOT NULL);
    CREATE FUNCTION public.ai_cost_union(p_since date)
      RETURNS TABLE (u_day date, u_micro bigint) LANGUAGE sql STABLE AS
      $f$ SELECT c.u_day, c.u_micro FROM public.cost_stub c WHERE c.u_day >= p_since $f$;
  `);
  await db.exec(sqlText);
});
afterAll(async () => db.close());

const today = "(now() AT TIME ZONE 'UTC')::date";
async function reset(micro: number, enabled = true, yesterdayMicro = 0) {
  await db.exec(`
    DELETE FROM public.cost_stub; DELETE FROM public.app_switches;
    INSERT INTO public.app_switches (key, enabled, note) VALUES ('ai', ${enabled}, 'orig'), ('tutor', true, NULL);
    INSERT INTO public.cost_stub VALUES (${today}, ${micro}), (${today} - 1, ${yesterdayMicro});
  `);
}
const trip = async (limit: number) =>
  (
    await db.query<{ r: { tripped: boolean; totalMicro: number } }>(
      `SELECT public.trip_ai_spend_breaker($1) AS r`,
      [limit],
    )
  ).rows[0]!.r;
const aiSwitch = async () =>
  (
    await db.query<{ enabled: boolean; note: string | null }>(
      `SELECT enabled, note FROM public.app_switches WHERE key = 'ai'`,
    )
  ).rows[0]!;

describe("trip_ai_spend_breaker (real Postgres)", () => {
  it("below the limit it changes nothing", async () => {
    await reset(99 * MICRO);
    expect(await trip(100 * MICRO)).toEqual({ tripped: false, totalMicro: 99 * MICRO });
    expect((await aiSwitch()).enabled).toBe(true);
  });

  it("at the limit it switches AI off, once, and says so", async () => {
    await reset(100 * MICRO);
    expect(await trip(100 * MICRO)).toEqual({ tripped: true, totalMicro: 100 * MICRO });
    const sw = await aiSwitch();
    expect(sw.enabled).toBe(false);
    expect(sw.note).toMatch(/spend breaker/);
    // the second call sees it already off: no second trip, so no second email
    expect((await trip(100 * MICRO)).tripped).toBe(false);
  });

  it("only the 'ai' switch is touched", async () => {
    await reset(500 * MICRO);
    await trip(100 * MICRO);
    const { rows } = await db.query<{ enabled: boolean }>(
      `SELECT enabled FROM public.app_switches WHERE key = 'tutor'`,
    );
    expect(rows[0]!.enabled).toBe(true);
  });

  it("counts only today: a heavy yesterday does not trip it", async () => {
    await reset(1 * MICRO, true, 900 * MICRO);
    expect((await trip(100 * MICRO)).tripped).toBe(false);
    expect((await aiSwitch()).enabled).toBe(true);
  });

  it("an owner who switched AI off already is left alone (no trip, note kept)", async () => {
    await reset(500 * MICRO, false);
    expect((await trip(100 * MICRO)).tripped).toBe(false);
    expect((await aiSwitch()).note).toBe("orig");
  });

  it("once the owner switches it back on and the limit is raised it stays on", async () => {
    await reset(150 * MICRO);
    await trip(100 * MICRO);
    await db.exec(`UPDATE public.app_switches SET enabled = true, note = NULL WHERE key = 'ai'`);
    expect((await trip(200 * MICRO)).tripped).toBe(false);
    expect((await aiSwitch()).enabled).toBe(true);
  });

  it("refuses a missing or non-positive limit instead of tripping on everything", async () => {
    await reset(0);
    await expect(db.query(`SELECT public.trip_ai_spend_breaker(0)`)).rejects.toThrow(
      /positive limit/,
    );
    await expect(db.query(`SELECT public.trip_ai_spend_breaker(NULL)`)).rejects.toThrow(
      /positive limit/,
    );
  });

  it("only the service role can run it", async () => {
    for (const role of ["anon", "authenticated"]) {
      const { rows } = await db.query<{ p: boolean }>(
        `SELECT has_function_privilege('${role}', 'public.trip_ai_spend_breaker(bigint)', 'EXECUTE') AS p`,
      );
      expect(rows[0]!.p, role).toBe(false);
    }
    const { rows } = await db.query<{ p: boolean }>(
      `SELECT has_function_privilege('service_role', 'public.trip_ai_spend_breaker(bigint)', 'EXECUTE') AS p`,
    );
    expect(rows[0]!.p).toBe(true);
  });
});

describe("the breaker setting", () => {
  it("defaults to 100 dollars, four times the daily alert, and is on", () => {
    const cfg = costConfig({});
    expect(cfg.breakerDailyUsd).toBe(100);
    expect(cfg.breakerDailyUsd).toBeGreaterThan(cfg.dailyTotalUsd);
    expect(cfg.breakerEnabled).toBe(true);
  });
  it("reads AI_SPEND_BREAKER_DAILY_USD and the exact opt-out", () => {
    expect(costConfig({ AI_SPEND_BREAKER_DAILY_USD: "40" }).breakerDailyUsd).toBe(40);
    expect(costConfig({ AI_SPEND_BREAKER_DAILY_USD: "-1" }).breakerDailyUsd).toBe(100);
    expect(costConfig({ AI_SPEND_BREAKER_ENABLED: "false" }).breakerEnabled).toBe(false);
  });
});

describe("the maintenance pass runs the breaker and emails once per trip", () => {
  const cfg = costConfig({});
  function make(
    trip: unknown,
    over: { ownerEmail?: string; send?: () => Promise<void>; now?: string } = {},
  ) {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const sent: { to: string; subject: string; text: string }[] = [];
    const deps: AiCostSweepDeps = {
      rpc: (fn, args) => {
        calls.push({ fn, args });
        if (fn === "trip_ai_spend_breaker") {
          return Promise.resolve(
            trip instanceof Error
              ? {
                  data: null,
                  error: { message: trip.message, code: (trip as { code?: string }).code },
                }
              : { data: trip, error: null },
          );
        }
        return Promise.resolve({ data: fn === "rollup_ai_cost_log" ? 0 : null, error: null });
      },
      // 00:30 UTC: before the daily alert's hour, so only the rollup and the breaker run.
      now: () => new Date(over.now ?? "2026-11-18T00:30:00Z"),
      send: async (m) => {
        if (over.send) await over.send();
        sent.push(m);
      },
      ownerEmail: over.ownerEmail ?? "owner@example.com",
      from: "Alphonso <a@example.com>",
      cfg,
    };
    return { deps, calls, sent };
  }
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("asks the database with the limit in micro-dollars, on every pass", async () => {
    const { deps, calls } = make({ tripped: false, totalMicro: 5 * MICRO });
    const r = await sweepAiCost(deps);
    expect(calls.find((c) => c.fn === "trip_ai_spend_breaker")!.args).toEqual({
      p_limit_micro: 100 * MICRO,
    });
    expect(r.breaker).toBeUndefined();
  });

  it("a trip emails the owner once, naming the reset", async () => {
    const { deps, sent } = make({ tripped: true, totalMicro: 120 * MICRO });
    const r = await sweepAiCost(deps);
    expect(r.breaker).toBe("emailed");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("owner@example.com");
    expect(sent[0]!.subject).toMatch(/AI switched OFF/);
    expect(sent[0]!.text).toContain("UPDATE public.app_switches SET enabled = true");
    expect(sent[0]!.text).toContain("$100");
  });

  it("no trip means no email (a later pass after the trip finds the switch already off)", async () => {
    const { deps, sent } = make({ tripped: false, totalMicro: 500 * MICRO });
    await sweepAiCost(deps);
    expect(sent).toHaveLength(0);
  });

  it("a failed send is logged and does not throw; the switch stays off", async () => {
    const { deps } = make(
      { tripped: true, totalMicro: 120 * MICRO },
      { send: () => Promise.reject(new Error("smtp")) },
    );
    const r = await sweepAiCost(deps);
    expect(r.breaker).toBe("tripped");
    expect(console.error).toHaveBeenCalled();
  });

  it("no recipient configured: logged, not a crash", async () => {
    const { deps, sent } = make({ tripped: true, totalMicro: 120 * MICRO }, { ownerEmail: "" });
    const r = await sweepAiCost(deps);
    expect(r.breaker).toBe("tripped");
    expect(sent).toHaveLength(0);
  });

  it("a database without the function yet skips quietly; another error is reported", async () => {
    const missing = Object.assign(new Error("Could not find the function"), { code: "PGRST202" });
    expect((await sweepAiCost(make(missing).deps)).breaker).toBeUndefined();
    expect((await sweepAiCost(make(new Error("boom")).deps)).breaker).toBe("failed");
  });

  it("an unreadable answer is a failure, never a trip", async () => {
    const r = await sweepAiCost(make({ nope: 1 }).deps);
    expect(r.breaker).toBe("failed");
  });

  it("switched off by its own setting: the database is not asked", async () => {
    const { deps, calls } = make({ tripped: true, totalMicro: 999 * MICRO });
    deps.cfg = costConfig({ AI_SPEND_BREAKER_ENABLED: "false" });
    await sweepAiCost(deps);
    expect(calls.some((c) => c.fn === "trip_ai_spend_breaker")).toBe(false);
  });

  it("parseBreakerTrip and the email are pure", () => {
    expect(parseBreakerTrip({ tripped: true, totalMicro: 1 })).toEqual({
      tripped: true,
      totalMicro: 1,
    });
    expect(() => parseBreakerTrip({ tripped: "yes", totalMicro: 1 })).toThrow();
    expect(
      buildBreakerEmail({ tripped: true, totalMicro: 2 * MICRO }, cfg, "a@b.c", "f@b.c").subject,
    ).toContain("$2.000");
  });
});
