import { describe, expect, it } from "vitest";
import {
  evaluateCap,
  isMonthlyCapKind,
  MONTHLY_CAP_KINDS,
  monthlyCapConfig,
  monthlyCapMessage,
  monthStartUtc,
  needsTierLookup,
  nextMonthStartUtc,
} from "./ai-monthly-cap";

const USD = 1_000_000;

describe("monthlyCapConfig", () => {
  it("defaults: free 2 USD, Pro 8 USD, warn at 80 percent, on", () => {
    expect(monthlyCapConfig({})).toEqual({
      enabled: true,
      freeMicro: 2 * USD,
      proMicro: 8 * USD,
      warnShare: 0.8,
    });
  });
  it("reads the environment and ignores junk", () => {
    expect(
      monthlyCapConfig({ AI_MONTHLY_CAP_FREE_USD: "3", AI_MONTHLY_CAP_PRO_USD: "10" }),
    ).toMatchObject({ freeMicro: 3 * USD, proMicro: 10 * USD });
    expect(
      monthlyCapConfig({ AI_MONTHLY_CAP_FREE_USD: "abc", AI_MONTHLY_CAP_PRO_USD: "-4" }),
    ).toMatchObject({ freeMicro: 2 * USD, proMicro: 8 * USD });
  });
  it("Pro is never below free", () => {
    expect(
      monthlyCapConfig({ AI_MONTHLY_CAP_FREE_USD: "9", AI_MONTHLY_CAP_PRO_USD: "5" }).proMicro,
    ).toBe(9 * USD);
  });
  it("only the literal false switches it off; a silly warn percent falls back", () => {
    expect(monthlyCapConfig({ AI_MONTHLY_CAP_ENABLED: "false" }).enabled).toBe(false);
    expect(monthlyCapConfig({ AI_MONTHLY_CAP_ENABLED: "0" }).enabled).toBe(true);
    expect(monthlyCapConfig({ AI_MONTHLY_CAP_WARN_PERCENT: "150" }).warnShare).toBe(0.8);
    expect(monthlyCapConfig({ AI_MONTHLY_CAP_WARN_PERCENT: "50" }).warnShare).toBe(0.5);
  });
});

describe("evaluateCap", () => {
  const cap = 10 * USD;
  it("ok below the warning line", () => {
    expect(evaluateCap(7_999_999, cap, 0.8)).toEqual({ state: "ok", percentUsed: 79 });
  });
  it("warn exactly at the warning line, up to one micro below the cap", () => {
    expect(evaluateCap(8 * USD, cap, 0.8)).toEqual({ state: "warn", percentUsed: 80 });
    expect(evaluateCap(cap - 1, cap, 0.8).state).toBe("warn");
  });
  it("capped exactly at the cap and above", () => {
    expect(evaluateCap(cap, cap, 0.8)).toEqual({ state: "capped", percentUsed: 100 });
    expect(evaluateCap(cap * 3, cap, 0.8).state).toBe("capped");
  });
  it("garbage never caps", () => {
    expect(evaluateCap(NaN, cap, 0.8).state).toBe("ok");
    expect(evaluateCap(-5, cap, 0.8).state).toBe("ok");
    expect(evaluateCap(5, 0, 0.8).state).toBe("ok");
  });
});

describe("kinds and tier", () => {
  it("blocks exactly the eight costly kinds, never the Help chat", () => {
    expect([...MONTHLY_CAP_KINDS].sort()).toEqual(
      ["chat", "define", "explain", "hector", "recap", "stt", "translate", "tts"].sort(),
    );
    expect(isMonthlyCapKind("support")).toBe(false);
    expect(isMonthlyCapKind("lesson")).toBe(false);
  });
  it("the tier is only worth looking up from the free warning line up", () => {
    const c = monthlyCapConfig({});
    expect(needsTierLookup(1.59 * USD, c)).toBe(false);
    expect(needsTierLookup(1.6 * USD, c)).toBe(true);
  });
});

describe("month boundaries", () => {
  it("resets at the first of the next UTC month, across a year end too", () => {
    expect(nextMonthStartUtc(new Date("2026-11-17T18:00:00Z"))).toBe("2026-12-01T00:00:00.000Z");
    expect(nextMonthStartUtc(new Date("2026-12-31T23:59:59Z"))).toBe("2027-01-01T00:00:00.000Z");
    expect(nextMonthStartUtc(new Date("2026-12-01T00:00:00Z"))).toBe("2027-01-01T00:00:00.000Z");
    expect(monthStartUtc(new Date("2026-11-30T23:59:59Z")).toISOString()).toBe(
      "2026-11-01T00:00:00.000Z",
    );
  });
  it("the message names the date and says lessons still work", () => {
    expect(monthlyCapMessage("2026-12-01T00:00:00.000Z")).toBe(
      "You've hit this month's usage limit for AI practice. It resets on 1 December. Lessons and review still work.",
    );
    expect(monthlyCapMessage("nonsense")).toContain("start of next month");
  });
});
