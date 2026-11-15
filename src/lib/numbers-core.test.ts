import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  aiCostTiles,
  AI_PRICE_USD,
  clearNumbersCache,
  collectNumbers,
  estimateAiCost,
  groupsFor,
  NotConnectedError,
  ownTiles,
  parseWindow,
  type GroupKey,
  type OwnAggregates,
  type Sources,
  type Tile,
} from "./numbers-core";

const OWN: OwnAggregates = {
  newToday: 2,
  newWindow: 9,
  activeToday: 5,
  activeWindow: 20,
  lessons: 40,
  practiceCalls: 7,
  podcastsFinished: 3,
  avgStreak: 4.2,
  retention: { d1: 50, d7: null, d30: 0 },
  openReports: 1,
  openTickets: 2,
  aiByKind: { chat: 100, tts: 50, stt_seconds: 3000, mystery: 4 },
};
const tile = (id: string): Tile => ({ id, label: id, kind: "number", value: 1, note: "n" });
const KEYS: GroupKey[] = [
  "own",
  "revenuecat",
  "aicost",
  "sentry",
  "posthog",
  "appstore",
  "googleplay",
];

function sources(over: Partial<Sources> = {}) {
  const calls: GroupKey[] = [];
  const base = Object.fromEntries(
    KEYS.map((k) => [
      k,
      vi.fn(async (ctx: { windowDays: number; own: () => Promise<OwnAggregates> }) => {
        calls.push(k);
        if (k === "own") return ownTiles(await ctx.own(), ctx.windowDays as 7);
        if (k === "aicost") return aiCostTiles(await ctx.own(), ctx.windowDays as 7);
        return [tile(`${k}_t`)];
      }),
    ]),
  ) as unknown as Sources;
  return { calls, sources: { ...base, ...over } as Sources };
}
const fetchOwn = vi.fn(async () => OWN);

beforeEach(() => {
  clearNumbersCache();
  fetchOwn.mockClear();
});

describe("the window picker", () => {
  it("accepts exactly 7, 30 and 90", () => {
    expect([7, 30, 90].map(parseWindow)).toEqual([7, 30, 90]);
  });
  it("rejects everything else", () => {
    for (const bad of [0, 1, 14, 31, 91, 365, -7, NaN, "7", null, undefined, {}]) {
      expect(parseWindow(bad), String(bad)).toBeNull();
    }
  });
  it("collectNumbers refuses a bad window before touching any source", async () => {
    const { sources: s, calls } = sources();
    await expect(
      collectNumbers({ scopes: ["numbers.read"], windowDays: 14, sources: s, fetchOwn }),
    ).rejects.toThrow("Choose 7, 30 or 90 days.");
    expect(calls).toEqual([]);
  });
  it("passes the chosen window to every source", async () => {
    for (const w of [7, 30, 90]) {
      clearNumbersCache();
      const seen: number[] = [];
      const { sources: s } = sources({
        sentry: async (ctx) => (seen.push(ctx.windowDays), [tile("x")]),
      });
      const r = await collectNumbers({
        scopes: ["numbers.read"],
        windowDays: w,
        sources: s,
        fetchOwn,
      });
      expect(r.windowDays).toBe(w);
      expect(seen).toEqual([w]);
      const own = r.groups.find((g) => g.key === "own")!;
      expect(own.tiles.find((t) => t.id === "new_window")!.note).toBe(`last ${w} days`);
    }
  });
});

describe("what each scope receives (enforced on the server, not by the page)", () => {
  it("numbers.read gets own, sentry and posthog and NO revenue group, and the revenue sources are never called", async () => {
    const { sources: s, calls } = sources();
    const r = await collectNumbers({
      scopes: ["numbers.read"],
      windowDays: 7,
      sources: s,
      fetchOwn,
    });
    expect(r.groups.map((g) => g.key)).toEqual(["own", "sentry", "posthog"]);
    expect(calls.sort()).toEqual(["own", "posthog", "sentry"]);
    expect(JSON.stringify(r)).not.toMatch(
      /revenuecat|aicost|appstore|googleplay|Estimated AI cost|MRR/i,
    );
  });
  it("numbers.revenue alone gets the revenue groups and NOT the own, sentry or posthog data", async () => {
    const { sources: s, calls } = sources();
    const r = await collectNumbers({
      scopes: ["numbers.revenue"],
      windowDays: 7,
      sources: s,
      fetchOwn,
    });
    expect(r.groups.map((g) => g.key)).toEqual(["revenuecat", "aicost", "appstore", "googleplay"]);
    expect(calls).not.toContain("own");
    expect(calls).not.toContain("sentry");
    expect(calls).not.toContain("posthog");
    expect(JSON.stringify(r)).not.toMatch(/"ai_calls"|AI calls by kind|Retention|New learners/);
  });
  it("both scopes get all seven groups", async () => {
    const { sources: s } = sources();
    const r = await collectNumbers({
      scopes: ["numbers.read", "numbers.revenue"],
      windowDays: 30,
      sources: s,
      fetchOwn,
    });
    expect(r.groups.map((g) => g.key)).toEqual(KEYS);
  });
  it("neither scope (a support person) is refused, and nothing is fetched", async () => {
    const { sources: s, calls } = sources();
    for (const scopes of [[], ["users.read", "support.read", "reports.manage"]]) {
      await expect(collectNumbers({ scopes, windowDays: 7, sources: s, fetchOwn })).rejects.toThrow(
        "Forbidden: missing scope numbers.read",
      );
    }
    expect(calls).toEqual([]);
    expect(fetchOwn).not.toHaveBeenCalled();
  });
  it("groupsFor maps each group to the right scope", () => {
    expect(groupsFor(["numbers.read"]).map((g) => g.key)).toEqual(["own", "sentry", "posthog"]);
    expect(groupsFor(["numbers.revenue"]).map((g) => g.key)).toEqual([
      "revenuecat",
      "aicost",
      "appstore",
      "googleplay",
    ]);
  });
});

describe("not connected and errors", () => {
  it("a missing key is not_connected with value null, never 0", async () => {
    const { sources: s } = sources({
      sentry: async () => {
        throw new NotConnectedError("Add a Sentry token (owner step)");
      },
    });
    const r = await collectNumbers({
      scopes: ["numbers.read"],
      windowDays: 7,
      sources: s,
      fetchOwn,
    });
    const g = r.groups.find((x) => x.key === "sentry")!;
    expect(g.state).toBe("not_connected");
    expect(g.tiles.length).toBeGreaterThan(0);
    for (const t of g.tiles) {
      expect(t.value).toBeNull();
      expect(t.reason).toBe("Add a Sentry token (owner step)");
    }
  });
  it("a failing provider is an error for that group only; the others still render", async () => {
    const { sources: s } = sources({
      posthog: async () => {
        throw new Error("HTTP 500 secret-detail");
      },
    });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await collectNumbers({
      scopes: ["numbers.read"],
      windowDays: 7,
      sources: s,
      fetchOwn,
    });
    err.mockRestore();
    expect(r.groups.find((g) => g.key === "posthog")!.state).toBe("error");
    expect(r.groups.find((g) => g.key === "own")!.state).toBe("ok");
    expect(r.groups.find((g) => g.key === "sentry")!.state).toBe("ok");
    expect(JSON.stringify(r)).not.toContain("secret-detail");
    for (const t of r.groups.find((g) => g.key === "posthog")!.tiles) expect(t.value).toBeNull();
  });
  it("a provider that hangs times out into an error and aborts its request", async () => {
    let aborted = false;
    const { sources: s } = sources({
      sentry: (ctx) =>
        new Promise((_, reject) => {
          ctx.signal.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("aborted"));
          });
        }),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await collectNumbers({
      scopes: ["numbers.read"],
      windowDays: 7,
      sources: s,
      fetchOwn,
      timeoutMs: 20,
    });
    expect(r.groups.find((g) => g.key === "sentry")!.state).toBe("error");
    expect(aborted).toBe(true);
    expect(r.groups.find((g) => g.key === "own")!.state).toBe("ok");
  });
  it("if the database read fails, own AND aicost fail but the providers still render", async () => {
    const { sources: s } = sources();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await collectNumbers({
      scopes: ["numbers.read", "numbers.revenue"],
      windowDays: 7,
      sources: s,
      fetchOwn: async () => {
        throw new Error("db down");
      },
    });
    expect(r.groups.find((g) => g.key === "own")!.state).toBe("error");
    expect(r.groups.find((g) => g.key === "aicost")!.state).toBe("error");
    expect(r.groups.find((g) => g.key === "revenuecat")!.state).toBe("ok");
  });
});

describe("cache", () => {
  it("serves a repeat inside five minutes from the cache, and refresh bypasses it", async () => {
    const { sources: s } = sources();
    const at = new Date("2026-11-15T10:00:00Z");
    const run = (extra: object = {}) =>
      collectNumbers({
        scopes: ["numbers.read"],
        windowDays: 7,
        sources: s,
        fetchOwn,
        now: at,
        ...extra,
      });
    await run();
    await run();
    expect(s.sentry).toHaveBeenCalledTimes(1);
    await run({ refresh: true });
    expect(s.sentry).toHaveBeenCalledTimes(2);
    await run({ now: new Date(at.getTime() + 5 * 60_000 + 1) });
    expect(s.sentry).toHaveBeenCalledTimes(3);
  });
  it("is per window", async () => {
    const { sources: s } = sources();
    await collectNumbers({ scopes: ["numbers.read"], windowDays: 7, sources: s, fetchOwn });
    await collectNumbers({ scopes: ["numbers.read"], windowDays: 30, sources: s, fetchOwn });
    expect(s.sentry).toHaveBeenCalledTimes(2);
  });
  it("never caches a failure", async () => {
    let n = 0;
    const { sources: s } = sources({
      sentry: async () => {
        n += 1;
        if (n === 1) throw new Error("x");
        return [tile("ok")];
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const a = await collectNumbers({
      scopes: ["numbers.read"],
      windowDays: 7,
      sources: s,
      fetchOwn,
    });
    const b = await collectNumbers({
      scopes: ["numbers.read"],
      windowDays: 7,
      sources: s,
      fetchOwn,
    });
    expect(a.groups.find((g) => g.key === "sentry")!.state).toBe("error");
    expect(b.groups.find((g) => g.key === "sentry")!.state).toBe("ok");
  });
});

describe("estimated AI cost", () => {
  it("is count x price per kind, rounded to cents", () => {
    const cost = estimateAiCost({ chat: 1000, tts: 500, define: 10 });
    expect(cost.usd).toBe(
      Math.round(
        (1000 * AI_PRICE_USD.chat! + 500 * AI_PRICE_USD.tts! + 10 * AI_PRICE_USD.define!) * 100,
      ) / 100,
    );
    expect(cost.usd).toBe(4.01);
  });
  it("prices stt_seconds per second and the stt call count at nothing (no double count)", () => {
    expect(estimateAiCost({ stt: 999, stt_seconds: 10_000 }).usd).toBe(0.7);
  });
  it("reports an unknown kind instead of pricing it at zero", () => {
    const c = estimateAiCost({ chat: 1, mystery: 5 });
    expect(c.unpricedKinds).toEqual(["mystery"]);
    expect(c.usd).toBe(0);
    const t = aiCostTiles({ ...OWN, aiByKind: { mystery: 5 } }, 7)[0]!;
    expect(t.note).toContain("not priced: mystery");
  });
  it("the tile is labelled an estimate and carries the window", () => {
    const t = aiCostTiles(OWN, 30)[0]!;
    expect(t.label).toBe("Estimated AI cost");
    expect(t.note).toContain("last 30 days, estimate");
    expect(t.kind).toBe("money");
  });
});

describe("own tiles", () => {
  const tiles = ownTiles(OWN, 7);
  const byId = Object.fromEntries(tiles.map((t) => [t.id, t]));
  it("shows a real zero as 0 and a missing cohort as no value with a reason", () => {
    expect(byId.ret_d30!.value).toBe(0);
    expect(byId.ret_d7!.value).toBeNull();
    expect(byId.ret_d7!.reason).toBe("Nobody joined that day");
  });
  it("lists AI calls by kind largest first, without the non-call stt_seconds", () => {
    expect(byId.ai_calls!.rows).toEqual([
      { label: "chat", value: 100 },
      { label: "tts", value: 50 },
      { label: "mystery", value: 4 },
    ]);
  });
  it("writes open reports / tickets as one tile", () => {
    expect(byId.open!.value).toBe("1 / 2");
  });
});

describe("no personal data in any response", () => {
  const ALLOWED_TILE_KEYS = ["id", "kind", "label", "note", "reason", "rows", "value"];
  const ALLOWED_GROUP_KEYS = ["key", "source", "state", "tiles", "title"];
  it("every key of the response is a known, non-identifying one", async () => {
    const { sources: s } = sources({
      sentry: async () => [{ ...tile("t"), rows: [{ label: "TypeError", value: 3 }] }],
    });
    const r = await collectNumbers({
      scopes: ["numbers.read", "numbers.revenue"],
      windowDays: 7,
      sources: s,
      fetchOwn,
    });
    expect(Object.keys(r).sort()).toEqual(["generatedAt", "groups", "windowDays"]);
    for (const g of r.groups) {
      expect(Object.keys(g).sort()).toEqual(ALLOWED_GROUP_KEYS);
      for (const t of g.tiles) {
        for (const k of Object.keys(t))
          expect(ALLOWED_TILE_KEYS, `${g.key}.${t.id}.${k}`).toContain(k);
        for (const row of t.rows ?? []) expect(Object.keys(row).sort()).toEqual(["label", "value"]);
      }
    }
    expect(JSON.stringify(r)).not.toMatch(/user_id|email|@|display_name/);
  });
});
