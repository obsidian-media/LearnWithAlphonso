import { describe, expect, it } from "vitest";
import {
  canCreate,
  canJoin,
  duelResult,
  duelShare,
  duelsSummary,
  medalFor,
  tierTitle,
} from "./social-presentation";

describe("duelsSummary", () => {
  it("joins only the parts that are not zero", () => {
    expect(duelsSummary({ pending: 1, active: 1, finished: 3 })).toBe(
      "1 pending · 1 active · 3 finished",
    );
    expect(duelsSummary({ pending: 0, active: 2, finished: 0 })).toBe("2 active");
    expect(duelsSummary({ pending: 0, active: 0, finished: 4 })).toBe("4 finished");
  });
  it("is null when there is nothing to say", () => {
    expect(duelsSummary({ pending: 0, active: 0, finished: 0 })).toBeNull();
  });
});

describe("duelShare", () => {
  it("is the learner's fraction of the XP earned", () => {
    expect(duelShare(120, 95)).toBeCloseTo(120 / 215);
    expect(duelShare(0, 50)).toBe(0);
    expect(duelShare(50, 0)).toBe(1);
  });
  it("is an even split when nobody has earned any, and never negative", () => {
    expect(duelShare(0, 0)).toBe(0.5);
    expect(duelShare(-5, 10)).toBe(0);
    expect(duelShare(-5, -5)).toBe(0.5);
  });
});

describe("duelResult", () => {
  it("names the four outcomes", () => {
    expect(duelResult("declined", "me", "me")).toEqual({ label: "Declined", tone: "declined" });
    expect(duelResult("completed", "me", "me")).toEqual({ label: "You won", tone: "won" });
    expect(duelResult("completed", "them", "me")).toEqual({ label: "You lost", tone: "lost" });
    expect(duelResult("completed", null, "me")).toEqual({ label: "Tied", tone: "tied" });
  });
  it("a declined duel is never a win even with a winner id", () => {
    expect(duelResult("declined", "them", "me").tone).toBe("declined");
  });
});

describe("medalFor", () => {
  it("gives the first three ranks a medal and nobody else", () => {
    expect([1, 2, 3, 4, 10].map(medalFor)).toEqual(["gold", "silver", "bronze", null, null]);
    expect(medalFor(0)).toBeNull();
  });
});

describe("canJoin and canCreate", () => {
  it("need something that is not blank space", () => {
    expect(canJoin("K7MQ2X")).toBe(true);
    expect(canJoin("   ")).toBe(false);
    expect(canJoin("")).toBe(false);
    expect(canCreate("Night Owls")).toBe(true);
    expect(canCreate("  \n ")).toBe(false);
  });
});

describe("tierTitle", () => {
  it("adds the word league, and says nothing without a tier", () => {
    expect(tierTitle("Treetop")).toBe("Treetop league");
    expect(tierTitle(null)).toBeNull();
    expect(tierTitle("")).toBeNull();
  });
});
