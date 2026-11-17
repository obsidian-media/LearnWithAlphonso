import { describe, expect, it, vi } from "vitest";

const USD = 1_000_000;
const NOW = new Date("2026-11-17T18:00:00Z");
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));

const { consumeQuotaFor } = await import("./ai-quota.server");
const { quotaFailureResponse } = await import("./ai-quota-response");

function db(monthMicro: number) {
  const calls: string[] = [];
  return {
    calls,
    rpc: vi.fn(async (fn: string) => {
      calls.push(fn);
      if (fn === "my_ai_cost_month")
        return { data: [{ uid: "u1", month_micro: monthMicro }], error: null };
      if (fn === "consume_ai_rate_limit") return { data: [{ allowed: true }], error: null };
      return { data: [{ allowed: true, used: 1 }], error: null };
    }),
  };
}

describe("consumeQuotaFor with the monthly cost cap", () => {
  it("a capped learner is refused kindly and burns no burst token and no daily unit", async () => {
    const d = db(9 * USD);
    const r = await consumeQuotaFor(d as never, "hector", NOW);
    expect(r).toMatchObject({
      ok: false,
      status: 429,
      code: "quota-exceeded",
      reason: "monthly-cap",
      resetsAt: "2026-12-01T00:00:00.000Z",
    });
    expect((r as { message: string }).message).toContain("resets on 1 December");
    expect(d.calls).toEqual(["my_ai_cost_month"]);
    const res = quotaFailureResponse(r as never);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: "quota-exceeded", reason: "monthly-cap" });
  });
  it("the Help chat still works for a capped learner", async () => {
    const d = db(99 * USD);
    expect((await consumeQuotaFor(d as never, "support", NOW)).ok).toBe(true);
    expect(d.calls).not.toContain("my_ai_cost_month");
  });
  it("an uncapped learner goes on to the daily caps as before", async () => {
    const d = db(0.1 * USD);
    expect((await consumeQuotaFor(d as never, "chat", NOW)).ok).toBe(true);
    expect(d.calls).toEqual(["my_ai_cost_month", "consume_ai_rate_limit", "consume_ai_quota"]);
  });
});
