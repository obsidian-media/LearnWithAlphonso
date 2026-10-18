import { describe, expect, it, vi } from "vitest";
import {
  ATTRIBUTION_KEY,
  captureAttribution,
  flushAttribution,
  parseAttribution,
  promoteAttribution,
  type AttributionDeps,
} from "./signup-attribution";

function memory() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}
function deps(consent: AttributionDeps["consent"]) {
  return { consent, local: memory(), session: memory(), now: new Date("2026-10-26T10:00:00Z") };
}
const URL_QS = "?utm_source=r_testflight&utm_medium=post&utm_campaign=beta1";

describe("parseAttribution", () => {
  it("reads the three tags and stamps the landing time", () => {
    expect(parseAttribution(URL_QS, new Date("2026-10-26T10:00:00Z"))).toEqual({
      source: "r_testflight",
      medium: "post",
      campaign: "beta1",
      landedAt: "2026-10-26T10:00:00.000Z",
    });
  });
  it("lowercases, and drops anything that is not a short plain tag", () => {
    expect(
      parseAttribution("?utm_source=Site&utm_medium=%3Cb%3E&utm_campaign=" + "x".repeat(65)),
    ).toMatchObject({
      source: "site",
      medium: null,
      campaign: null,
    });
  });
  it("returns null when there is nothing usable", () => {
    expect(parseAttribution("")).toBeNull();
    expect(parseAttribution("?next=/learn&fbclid=abc")).toBeNull();
    expect(parseAttribution("?utm_source=has space")).toBeNull();
  });
  it("ignores every other query parameter (no click ids, no referrer URL)", () => {
    const a = parseAttribution("?utm_source=site&fbclid=abc&gclid=def&ref=https://x.test")!;
    expect(Object.keys(a).sort()).toEqual(["campaign", "landedAt", "medium", "source"]);
  });
});

describe("captureAttribution and consent", () => {
  it("keeps tags in sessionStorage while the banner is unanswered", () => {
    const d = deps(null);
    captureAttribution(URL_QS, d);
    expect(d.session.getItem(ATTRIBUTION_KEY)).not.toBeNull();
    expect(d.local.getItem(ATTRIBUTION_KEY)).toBeNull();
  });
  it("persists to localStorage after Accept all", () => {
    const d = deps("all");
    captureAttribution(URL_QS, d);
    expect(d.local.getItem(ATTRIBUTION_KEY)).not.toBeNull();
    expect(d.session.getItem(ATTRIBUTION_KEY)).toBeNull();
  });
  it("stores nothing, and clears what was held, after Essential only", () => {
    const d = deps(null);
    captureAttribution(URL_QS, d);
    const e = { ...d, consent: "essential" as const };
    captureAttribution(URL_QS, e);
    expect(d.session.getItem(ATTRIBUTION_KEY)).toBeNull();
    expect(d.local.getItem(ATTRIBUTION_KEY)).toBeNull();
  });
  it("first touch wins", () => {
    const d = deps("all");
    captureAttribution(URL_QS, d);
    captureAttribution("?utm_source=video&utm_medium=post&utm_campaign=beta2", d);
    expect(JSON.parse(d.local.getItem(ATTRIBUTION_KEY)!).source).toBe("r_testflight");
  });
  it("does nothing for a URL without tags", () => {
    const d = deps("all");
    captureAttribution("?next=/learn", d);
    expect(d.local.getItem(ATTRIBUTION_KEY)).toBeNull();
  });
  it("promotes held tags to localStorage when the visitor accepts, and drops them on Essential only", () => {
    const held = deps(null);
    captureAttribution(URL_QS, held);
    promoteAttribution({ ...held, consent: "all" });
    expect(held.local.getItem(ATTRIBUTION_KEY)).not.toBeNull();
    expect(held.session.getItem(ATTRIBUTION_KEY)).toBeNull();

    const other = deps(null);
    captureAttribution(URL_QS, other);
    promoteAttribution({ ...other, consent: "essential" });
    expect(other.local.getItem(ATTRIBUTION_KEY)).toBeNull();
    expect(other.session.getItem(ATTRIBUTION_KEY)).toBeNull();
  });
  it("survives blocked storage", () => {
    const d: AttributionDeps = { consent: "all", local: null, session: null };
    expect(() => captureAttribution(URL_QS, d)).not.toThrow();
  });
});

describe("flushAttribution", () => {
  it("sends once and clears on a final answer", async () => {
    const d = deps("all");
    captureAttribution(URL_QS, d);
    const send = vi.fn().mockResolvedValue("recorded");
    expect(await flushAttribution(send, d)).toBe("recorded");
    expect(send).toHaveBeenCalledWith({
      source: "r_testflight",
      medium: "post",
      campaign: "beta1",
      landedAt: "2026-10-26T10:00:00.000Z",
    });
    expect(d.local.getItem(ATTRIBUTION_KEY)).toBeNull();
    expect(await flushAttribution(send, d)).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("clears for not_new and empty too (nothing to retry)", async () => {
    for (const result of ["not_new", "empty", "already"]) {
      const d = deps("all");
      captureAttribution(URL_QS, d);
      await flushAttribution(async () => result, d);
      expect(d.local.getItem(ATTRIBUTION_KEY)).toBeNull();
    }
  });
  it("keeps the tags when the call fails or the session was not ready", async () => {
    const failing = deps("all");
    captureAttribution(URL_QS, failing);
    expect(
      await flushAttribution(async () => Promise.reject(new Error("offline")), failing),
    ).toBeNull();
    expect(failing.local.getItem(ATTRIBUTION_KEY)).not.toBeNull();

    const early = deps("all");
    captureAttribution(URL_QS, early);
    await flushAttribution(async () => "unauthenticated", early);
    expect(early.local.getItem(ATTRIBUTION_KEY)).not.toBeNull();
  });
  it("sends nothing without Accept all", async () => {
    const send = vi.fn();
    const undecided = deps(null);
    captureAttribution(URL_QS, undecided);
    expect(await flushAttribution(send, undecided)).toBeNull();
    const essential = deps("essential");
    expect(await flushAttribution(send, essential)).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
});
