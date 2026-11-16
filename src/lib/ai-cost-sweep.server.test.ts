import { afterEach, describe, expect, it, vi } from "vitest";
import {
  alertExceeded,
  buildAlertEmail,
  parseDayReport,
  sweepAiCost,
  yesterdayUtc,
  type AiCostSweepDeps,
  type DayReport,
} from "./ai-cost-sweep.server";
import { costConfig } from "./ai-cost-config";

const cfg = costConfig({});
const MICRO = 1_000_000;

const report = (over: Partial<DayReport> = {}): DayReport => ({
  day: "2026-11-15",
  totalMicro: 3 * MICRO,
  calls: 40,
  unpriced: 0,
  overCount: 0,
  overUsers: [],
  ...over,
});

function make(opts: {
  now?: string;
  claim?: boolean | { error: string };
  report?: DayReport;
  send?: () => Promise<void>;
  ownerEmail?: string;
  from?: string;
  rollup?: unknown;
}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const sent: { to: string; from?: string; subject: string; text: string }[] = [];
  const deps: AiCostSweepDeps = {
    rpc: (fn, args) => {
      calls.push({ fn, args });
      if (fn === "rollup_ai_cost_log")
        return Promise.resolve({ data: opts.rollup ?? 0, error: null });
      if (fn === "claim_ai_cost_alert_day") {
        const c = opts.claim ?? true;
        return Promise.resolve(
          typeof c === "object"
            ? { data: null, error: { message: c.error, code: "PGRST202" } }
            : { data: c, error: null },
        );
      }
      if (fn === "ai_cost_day_report")
        return Promise.resolve({ data: opts.report ?? report(), error: null });
      return Promise.resolve({ data: null, error: null });
    },
    now: () => new Date(opts.now ?? "2026-11-16T03:00:00Z"),
    send: async (m) => {
      if (opts.send) await opts.send();
      sent.push(m);
    },
    ownerEmail: opts.ownerEmail ?? "owner@example.com",
    from: opts.from ?? "Alphonso <a@example.com>",
    cfg,
  };
  return { deps, calls, sent };
}

afterEach(() => vi.restoreAllMocks());

describe("defaults", () => {
  it("are documented numbers", () => {
    expect(cfg.dailyTotalUsd).toBe(25);
    expect(cfg.dailyUserUsd).toBe(1.5);
    expect(cfg.heavyMonthlyUsd).toBeCloseTo(12.99 * 0.85 * 0.72, 6);
  });
  it("read from the environment, and ignore junk", () => {
    expect(costConfig({ AI_COST_ALERT_DAILY_TOTAL_USD: "40" }).dailyTotalUsd).toBe(40);
    for (const bad of ["abc", "-3", "0", ""]) {
      expect(costConfig({ AI_COST_ALERT_DAILY_TOTAL_USD: bad }).dailyTotalUsd).toBe(25);
    }
    expect(costConfig({ AI_COST_HEAVY_SHARE: "5" }).heavyShare).toBe(1);
  });
});

describe("the threshold decision", () => {
  it("fires on the total at the threshold, not just above it", () => {
    expect(alertExceeded(report({ totalMicro: 25 * MICRO - 1 }), cfg)).toBe(false);
    expect(alertExceeded(report({ totalMicro: 25 * MICRO }), cfg)).toBe(true);
  });
  it("fires when one learner is over their daily amount even if the total is small", () => {
    expect(
      alertExceeded(
        report({ overCount: 1, overUsers: [{ id: "ab12cd34", micro: 2 * MICRO }] }),
        cfg,
      ),
    ).toBe(true);
  });
  it("does not fire for an ordinary day", () => {
    expect(alertExceeded(report(), cfg)).toBe(false);
  });
});

describe("the daily alert", () => {
  it("looks at yesterday (UTC) and sends nothing on an ordinary day", async () => {
    const m = make({});
    const r = await sweepAiCost(m.deps);
    expect(r.alert).toBe("none");
    expect(m.sent).toHaveLength(0);
    expect(m.calls.find((c) => c.fn === "claim_ai_cost_alert_day")!.args).toEqual({
      p_day: "2026-11-15",
    });
    expect(m.calls.find((c) => c.fn === "ai_cost_day_report")!.args).toEqual({
      p_day: "2026-11-15",
      p_user_micro: 1_500_000,
    });
  });

  it("emails the owner when the total is over, with short ids only and the thresholds", async () => {
    const m = make({
      report: report({
        totalMicro: 31 * MICRO,
        overCount: 1,
        overUsers: [{ id: "ab12cd34", micro: 4.2 * MICRO }],
        unpriced: 2,
      }),
    });
    const r = await sweepAiCost(m.deps);
    expect(r.alert).toBe("sent");
    expect(m.sent).toHaveLength(1);
    expect(m.sent[0]).toMatchObject({ to: "owner@example.com", from: "Alphonso <a@example.com>" });
    expect(m.sent[0]!.subject).toContain("2026-11-15");
    expect(m.sent[0]!.text).toContain("ab12cd34");
    expect(m.sent[0]!.text).toContain("AI_COST_ALERT_DAILY_TOTAL_USD");
    expect(m.sent[0]!.text).toContain("2 call(s) had no known price");
  });

  it("runs once a day: a day already claimed does nothing", async () => {
    const m = make({ claim: false, report: report({ totalMicro: 99 * MICRO }) });
    const r = await sweepAiCost(m.deps);
    expect(r.alert).toBe("none");
    expect(m.sent).toHaveLength(0);
    expect(m.calls.some((c) => c.fn === "ai_cost_day_report")).toBe(false);
  });

  it("waits until the day is well over (01:00 UTC)", async () => {
    const m = make({ now: "2026-11-16T00:20:00Z", report: report({ totalMicro: 99 * MICRO }) });
    await sweepAiCost(m.deps);
    expect(m.calls.some((c) => c.fn === "claim_ai_cost_alert_day")).toBe(false);
    expect(m.sent).toHaveLength(0);
  });

  it("a failed send releases the day so the next pass retries it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const m = make({
      report: report({ totalMicro: 99 * MICRO }),
      send: () => Promise.reject(new Error("Resend 500")),
    });
    const r = await sweepAiCost(m.deps);
    expect(r.alert).toBe("failed");
    expect(m.calls.some((c) => c.fn === "release_ai_cost_alert_day")).toBe(true);
  });

  it("no sender or no recipient: logged and skipped, never a crash, no retry storm", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const over of [{ from: "" }, { ownerEmail: "" }]) {
      const m = make({ report: report({ totalMicro: 99 * MICRO }), ...over });
      const r = await sweepAiCost(m.deps);
      expect(r.alert).toBe("skipped");
      expect(m.sent).toHaveLength(0);
      expect(m.calls.some((c) => c.fn === "release_ai_cost_alert_day")).toBe(false);
    }
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("a database without the functions yet skips quietly", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const m = make({
      claim: { error: "Could not find the function public.claim_ai_cost_alert_day" },
    });
    const r = await sweepAiCost(m.deps);
    expect(r.alert).toBe("none");
    expect(spy).not.toHaveBeenCalled();
  });

  it("a malformed report is a failure that releases the day", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const m = make({ report: { nope: true } as never });
    const r = await sweepAiCost(m.deps);
    expect(r.alert).toBe("failed");
    expect(m.calls.some((c) => c.fn === "release_ai_cost_alert_day")).toBe(true);
    expect(() => parseDayReport(null)).toThrow();
  });

  it("yesterday is the UTC date before", () => {
    expect(yesterdayUtc(new Date("2026-03-01T00:30:00Z"))).toBe("2026-02-28");
  });

  it("the email lists no more than it was given and never a name", () => {
    const mail = buildAlertEmail(
      report({ overCount: 12, overUsers: [{ id: "ab12cd34", micro: 2 * MICRO }] }),
      cfg,
      "o@example.com",
      "f@example.com",
    );
    expect(mail.text).toContain("(the top 1 are listed)");
    expect(mail.text).not.toMatch(/@.*\.com.*learner/i);
  });
});

describe("the rollup", () => {
  it("runs every pass with 90 days kept and reports what it wrote", async () => {
    const m = make({ now: "2026-11-16T00:10:00Z", rollup: 4 });
    const r = await sweepAiCost(m.deps);
    expect(r.rolledUp).toBe(4);
    expect(m.calls[0]).toEqual({ fn: "rollup_ai_cost_log", args: { p_keep_days: 90 } });
  });
  it("a failing rollup does not stop the alert", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const m = make({ report: report({ totalMicro: 99 * MICRO }) });
    const base = m.deps.rpc;
    m.deps.rpc = (fn, args) =>
      fn === "rollup_ai_cost_log" ? Promise.reject(new Error("db down")) : base(fn, args);
    const r = await sweepAiCost(m.deps);
    expect(r.alert).toBe("sent");
  });
});
