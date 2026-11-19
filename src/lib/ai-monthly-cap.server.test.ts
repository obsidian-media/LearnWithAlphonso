import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  monthlyCapRefusal,
  readMonthlyCap,
  resetMonthlyCapWarnings,
} from "./ai-monthly-cap.server";

const USD = 1_000_000;
const NOW = new Date("2026-11-17T18:00:00Z");
const RESET = "2026-12-01T00:00:00.000Z";

const client = (micro: number | string, uid = "u1") => ({
  rpc: vi.fn().mockResolvedValue({ data: [{ uid, month_micro: micro }], error: null }),
});
const failing = (error: { message: string; code?: string }) => ({
  rpc: vi.fn().mockResolvedValue({ data: null, error }),
});
const free = () => vi.fn().mockResolvedValue("inactive");

beforeEach(() => {
  resetMonthlyCapWarnings();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("monthlyCapRefusal: what is blocked", () => {
  it("blocks every costly kind at the ceiling", async () => {
    for (const kind of [
      "chat",
      "hector",
      "tts",
      "stt",
      "recap",
      "explain",
      "translate",
      "define",
    ]) {
      // hector is Pro by construction (the route checked), so it needs the Pro ceiling
      const spent = kind === "hector" ? 8 * USD : 2 * USD;
      expect(await monthlyCapRefusal(client(spent), kind, NOW, { entitlement: free() })).toEqual({
        kind: "capped",
        resetsAt: RESET,
      });
    }
  });
  it("never reads or blocks the Help chat or any non-AI kind", async () => {
    const c = client(999 * USD);
    expect(await monthlyCapRefusal(c, "support", NOW)).toBeNull();
    expect(await monthlyCapRefusal(c, "lesson", NOW)).toBeNull();
    expect(c.rpc).not.toHaveBeenCalled();
  });
  it("allows one micro under the free ceiling and blocks at it", async () => {
    expect(
      await monthlyCapRefusal(client(2 * USD - 1), "chat", NOW, { entitlement: free() }),
    ).toBeNull();
    expect(
      await monthlyCapRefusal(client(2 * USD), "chat", NOW, { entitlement: free() }),
    ).not.toBeNull();
  });
  it("a numeric string from the driver is read as a number", async () => {
    expect(
      await monthlyCapRefusal(client("2000000"), "chat", NOW, { entitlement: free() }),
    ).not.toBeNull();
  });
});

describe("tiers", () => {
  it("a Pro learner passes the free ceiling and is blocked at the Pro one", async () => {
    const ent = vi.fn().mockResolvedValue("active");
    expect(await monthlyCapRefusal(client(5 * USD), "chat", NOW, { entitlement: ent })).toBeNull();
    expect(
      await monthlyCapRefusal(client(8 * USD), "chat", NOW, { entitlement: ent }),
    ).not.toBeNull();
  });
  it("no entitlement request below the free warning line", async () => {
    const ent = vi.fn();
    await readMonthlyCap(client(1 * USD), "chat", NOW, { entitlement: ent });
    expect(ent).not.toHaveBeenCalled();
  });
  it("an entitlement that cannot answer never locks the learner into the free ceiling", async () => {
    const unavailable = vi.fn().mockResolvedValue("unavailable");
    expect(
      await monthlyCapRefusal(client(5 * USD), "chat", NOW, { entitlement: unavailable }),
    ).toBeNull();
    const boom = vi.fn().mockRejectedValue(new Error("rc down"));
    expect(await monthlyCapRefusal(client(5 * USD), "chat", NOW, { entitlement: boom })).toBeNull();
  });
  it("the ceilings come from the environment", async () => {
    const env = { AI_MONTHLY_CAP_FREE_USD: "5" };
    expect(
      await monthlyCapRefusal(client(4 * USD), "chat", NOW, { entitlement: free(), env }),
    ).toBeNull();
    expect(
      await monthlyCapRefusal(client(5 * USD), "chat", NOW, { entitlement: free(), env }),
    ).not.toBeNull();
  });
});

describe("the soft warning", () => {
  it("is warn from 80 percent of the learner's ceiling, with the percent", async () => {
    const r = await readMonthlyCap(client(1.7 * USD), null, NOW, { entitlement: free() });
    expect(r.status).toEqual({ state: "warn", percentUsed: 85, tier: "free" });
    expect(r.resetsAt).toBe(RESET);
    const ok = await readMonthlyCap(client(1.0 * USD), null, NOW, { entitlement: free() });
    expect(ok.status?.state).toBe("ok");
  });
});

describe("month reset", () => {
  it("the reset date follows the month of the clock", async () => {
    const r = await readMonthlyCap(client(0), null, new Date("2026-12-31T23:00:00Z"));
    expect(r.resetsAt).toBe("2027-01-01T00:00:00.000Z");
  });
});

const UNVERIFIED = { kind: "unverified" };
const ent = (v: "active" | "inactive" | "unavailable") => vi.fn().mockResolvedValue(v);

describe("a failed cost read: free fails closed, Pro stays open", () => {
  const readErrors: [string, () => unknown][] = [
    ["rpc error", () => failing({ message: "boom" })],
    ["rpc throws", () => ({ rpc: vi.fn().mockRejectedValue(new Error("network")) })],
    ["empty answer", () => ({ rpc: vi.fn().mockResolvedValue({ data: [], error: null }) })],
    ["negative answer", () => client(-5)],
  ];
  for (const [name, make] of readErrors) {
    it(`${name}: a free learner is refused (503 path), logged`, async () => {
      expect(
        await monthlyCapRefusal(make(), "chat", NOW, { entitlement: ent("inactive") }, "u1"),
      ).toEqual(UNVERIFIED);
      expect(console.error).toHaveBeenCalled();
    });
    it(`${name}: a Pro learner is let through`, async () => {
      expect(
        await monthlyCapRefusal(make(), "chat", NOW, { entitlement: ent("active") }, "u1"),
      ).toBeNull();
    });
  }
  it("entitlement also unavailable: refused, the learner cannot be shown to be Pro", async () => {
    expect(
      await monthlyCapRefusal(
        failing({ message: "boom" }),
        "chat",
        NOW,
        { entitlement: ent("unavailable") },
        "u1",
      ),
    ).toEqual(UNVERIFIED);
    const boom = vi.fn().mockRejectedValue(new Error("rc down"));
    expect(
      await monthlyCapRefusal(
        failing({ message: "boom" }),
        "chat",
        NOW,
        { entitlement: boom },
        "u1",
      ),
    ).toEqual(UNVERIFIED);
  });
  it("looks the tier up for the id it was given, and from the session when none is given", async () => {
    const entitlement = ent("active");
    await monthlyCapRefusal(failing({ message: "boom" }), "chat", NOW, { entitlement }, "u9");
    expect(entitlement).toHaveBeenCalledWith("u9");
    const c = {
      ...failing({ message: "boom" }),
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u7" } } }) },
    };
    const e2 = ent("active");
    expect(await monthlyCapRefusal(c, "chat", NOW, { entitlement: e2 })).toBeNull();
    expect(e2).toHaveBeenCalledWith("u7");
    // no id anywhere: the tier cannot be shown, so refused
    expect(
      await monthlyCapRefusal(failing({ message: "boom" }), "chat", NOW, { entitlement: e2 }),
    ).toEqual(UNVERIFIED);
  });
  it("hector (Pro only, verified by the route) stays open", async () => {
    expect(
      await monthlyCapRefusal(failing({ message: "boom" }), "hector", NOW, {
        entitlement: ent("inactive"),
      }),
    ).toBeNull();
  });
  it("kinds the cap never blocks are never refused on a failure either", async () => {
    expect(await monthlyCapRefusal(failing({ message: "boom" }), "support", NOW)).toBeNull();
  });
  it("only the two 'function missing' codes count as not deployed: wording alone is a failed read", async () => {
    const wording = failing({ message: 'relation "ai_cost_log" does not exist' });
    expect(
      await monthlyCapRefusal(wording, "chat", NOW, { entitlement: ent("inactive") }, "u1"),
    ).toEqual(UNVERIFIED);
    const schemaCache = failing({ message: "Could not find the function in the schema cache" });
    expect(
      await monthlyCapRefusal(schemaCache, "chat", NOW, { entitlement: ent("inactive") }, "u1"),
    ).toEqual(UNVERIFIED);
    for (const code of ["42883", "PGRST202"]) {
      expect(
        await monthlyCapRefusal(
          failing({ message: "x", code }),
          "chat",
          NOW,
          { entitlement: ent("inactive") },
          "u1",
        ),
      ).toBeNull();
    }
  });
  it("migration not applied yet: allowed, warned once", async () => {
    const c = failing({
      message: "Could not find the function in the schema cache",
      code: "PGRST202",
    });
    expect(
      await monthlyCapRefusal(c, "chat", NOW, { entitlement: ent("inactive") }, "u1"),
    ).toBeNull();
    await monthlyCapRefusal(c, "chat", NOW);
    const warned = vi
      .mocked(console.error)
      .mock.calls.filter((a) => String(a[0]).includes("not deployed"));
    expect(warned).toHaveLength(1);
  });
  it("switched off: nothing is read, nothing blocked", async () => {
    const c = client(100 * USD);
    const env = { AI_MONTHLY_CAP_ENABLED: "false" };
    expect(await monthlyCapRefusal(c, "chat", NOW, { env })).toBeNull();
    expect(c.rpc).not.toHaveBeenCalled();
  });
});
