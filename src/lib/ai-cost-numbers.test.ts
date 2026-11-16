import { describe, expect, it } from "vitest";
import { aiCostTilesFromPayload, parseCostPayload, type CostPayload } from "./ai-cost-numbers";
import { aiCostSource } from "./numbers-sources.server";
import { costConfig } from "./ai-cost-config";
import { collectNumbers, formatUsd, NotConnectedError, type Sources } from "./numbers-core";

const cfg = costConfig({});
const period = (micro: number, over: Partial<CostPayload["periods"]["today"]> = {}) => ({
  micro,
  calls: 10,
  unpriced: 0,
  byVendor: { deepgram: Math.round(micro * 0.7), openrouter: Math.round(micro * 0.3) },
  byKind: { tts: Math.round(micro * 0.7), chat: Math.round(micro * 0.3) },
  ...over,
});
const payload = (over: Partial<CostPayload> = {}): CostPayload => ({
  windowDays: 7,
  loggedCalls: 100,
  periods: {
    today: period(500_000),
    d7: period(3_000_000),
    d30: period(9_000_000, { unpriced: 3 }),
  },
  users: { active: 4, avg: 750_000, median: 600_000, p90: 1_400_000, max: 1_500_000 },
  heavy: 2,
  top: [
    { id: "ab12cd34", micro: 1_500_000, calls: 30 },
    { id: "ef56ab78", micro: 100_000, calls: 3 },
  ],
  tts: { calls: 40, hits: 10 },
  ...over,
});
const byId = (tiles: ReturnType<typeof aiCostTilesFromPayload>) =>
  Object.fromEntries(tiles.map((t) => [t.id, t]));

describe("AI cost tiles", () => {
  const t = byId(aiCostTilesFromPayload(payload(), 7, cfg));
  it("spend today / 7 / 30 in dollars, flagged as an estimate, with unpriced calls named", () => {
    expect(t.spend_today!.value).toBe(0.5);
    expect(t.spend_d7!.value).toBe(3);
    expect(t.spend_d30!.value).toBe(9);
    expect(t.spend_d30!.note).toContain("3 call(s) not priced");
    expect(t.spend_today!.note).toContain("estimate");
  });
  it("splits by vendor and by kind for each period, biggest first, in usd rows", () => {
    expect(t.vendor_d7!.rows![0]).toEqual({ label: "All vendors", value: 3, unit: "usd" });
    expect(t.vendor_d7!.rows![1]).toMatchObject({ label: "deepgram", unit: "usd" });
    expect(t.kind_d30!.rows!.map((r) => r.label)).toEqual(["tts", "chat"]);
  });
  it("cost per active learner: average, median, p90, highest", () => {
    expect(t.per_user!.rows!.map((r) => [r.label, r.value])).toEqual([
      ["Average", 0.75],
      ["Median", 0.6],
      ["90th percentile", 1.4],
      ["Highest", 1.5],
    ]);
    expect(t.per_user!.note).toContain("4 active");
  });
  it("heavy learners are labelled an estimate and show the line and its basis", () => {
    expect(t.heavy!.value).toBe(2);
    expect(t.heavy!.note).toContain("$7.95");
    expect(t.heavy!.note).toContain("estimate");
    expect(t.heavy!.note).toContain("CAD 12.99");
  });
  it("top learners carry an opaque short id and money only", () => {
    expect(t.top!.rows).toEqual([
      { label: "ab12cd34", value: 1.5, unit: "usd" },
      { label: "ef56ab78", value: 0.1, unit: "usd" },
    ]);
    for (const r of t.top!.rows!) expect(r.label).toMatch(/^[0-9a-f]{8}$/);
    expect(JSON.stringify(aiCostTilesFromPayload(payload(), 7, cfg))).not.toMatch(/@/);
  });
  it("voice cache hit rate is hits over calls", () => {
    expect(t.tts_hit!.value).toBe(25);
  });
  it("no speech calls / no learners is 'no value, with a reason', never a 0 rate", () => {
    const e = byId(
      aiCostTilesFromPayload(
        payload({
          tts: { calls: 0, hits: 0 },
          users: { active: 0, avg: null, median: null, p90: null, max: null },
          top: [],
        }),
        7,
        cfg,
      ),
    );
    expect(e.tts_hit).toMatchObject({ value: null, reason: expect.any(String) });
    expect(e.per_user).toMatchObject({ value: null, reason: expect.any(String) });
    expect(e.top).toMatchObject({ value: null, reason: expect.any(String) });
  });
});

describe("the payload is read strictly", () => {
  it("a missing or malformed payload throws instead of rendering zeros", () => {
    for (const bad of [
      null,
      undefined,
      3,
      "x",
      [],
      {},
      { ...payload(), periods: {} },
      { ...payload(), tts: null },
    ]) {
      expect(() => parseCostPayload(bad)).toThrow();
    }
    expect(() => parseCostPayload({ ...payload(), heavy: "2" })).toThrow();
  });
  it("accepts a good one, including null user stats", () => {
    expect(parseCostPayload(JSON.parse(JSON.stringify(payload())))).toEqual(payload());
    expect(
      parseCostPayload({
        ...payload(),
        users: { active: 0, avg: null, median: null, p90: null, max: null },
      }).users.avg,
    ).toBeNull();
  });
});

describe("formatUsd", () => {
  it("shows tenths of a cent for tiny costs and whole dollars for big ones", () => {
    expect(formatUsd(0.0043)).toBe("$0.004");
    expect(formatUsd(3)).toBe("$3.00");
    expect(formatUsd(1234.5)).toBe("$1,235");
  });
});

describe("not connected versus zero", () => {
  const ctx = {
    windowDays: 7 as const,
    signal: new AbortController().signal,
    now: new Date(),
    own: async () => ({}) as never,
  };
  const client = (data: unknown, error: { message: string } | null = null) => ({
    rpc: () => ({ abortSignal: () => Promise.resolve({ data, error }) }),
  });
  it("nothing logged yet is Not connected, not $0", async () => {
    const src = aiCostSource({}, client(payload({ loggedCalls: 0 })));
    await expect(src(ctx)).rejects.toBeInstanceOf(NotConnectedError);
  });
  it("the function missing (migration not applied) is Not connected", async () => {
    const src = aiCostSource(
      {},
      client(null, {
        message: "Could not find the function public.admin_ai_cost in the schema cache",
      }),
    );
    await expect(src(ctx)).rejects.toBeInstanceOf(NotConnectedError);
  });
  it("any other database error is an error, not Not connected", async () => {
    const src = aiCostSource({}, client(null, { message: "connection reset" }));
    await expect(src(ctx)).rejects.not.toBeInstanceOf(NotConnectedError);
  });
  it("real data with a real zero month is shown as $0, connected", async () => {
    const zero = payload({ periods: { today: period(0), d7: period(0), d30: period(0) } });
    const tiles = await aiCostSource({}, client(zero))(ctx);
    expect(tiles.find((x) => x.id === "spend_d7")!.value).toBe(0);
  });
  it("the group is gated by numbers.revenue and passes the heavy line in micro-dollars", async () => {
    let args: Record<string, unknown> = {};
    const c = {
      rpc: (_n: string, a: Record<string, unknown>) => {
        args = a;
        return { abortSignal: () => Promise.resolve({ data: payload(), error: null }) };
      },
    };
    const stub = async () => [];
    const sources = {
      own: stub,
      revenuecat: stub,
      sentry: stub,
      posthog: stub,
      appstore: stub,
      googleplay: stub,
      aicost: aiCostSource({}, c),
    } as unknown as Sources;
    const res = await collectNumbers({
      scopes: ["numbers.read"],
      windowDays: 7,
      sources,
      fetchOwn: async () => ({}) as never,
    });
    expect(res.groups.map((g) => g.key)).not.toContain("aicost");
    const rev = await collectNumbers({
      scopes: ["numbers.revenue"],
      windowDays: 7,
      sources,
      fetchOwn: async () => ({}) as never,
      refresh: true,
    });
    expect(rev.groups.find((g) => g.key === "aicost")!.state).toBe("ok");
    expect(args).toEqual({ p_days: 7, p_heavy_micro: Math.round(cfg.heavyMonthlyUsd * 1_000_000) });
  });
});
