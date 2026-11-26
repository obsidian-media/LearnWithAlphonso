import { describe, expect, it } from "vitest";
import {
  EVENT_KINDS,
  INTAKE_TEXT_MAX,
  STAGES,
  canCreateRehearsal,
  isEventKind,
  isStage,
  validateIntake,
} from "./rehearsal-rules";

describe("canCreateRehearsal: all six combinations", () => {
  it.each([
    ["pro", false, "ok_pro"],
    ["pro", true, "ok_pro"],
    ["free", false, "ok_free"],
    ["free", true, "paywall"],
    ["unavailable", false, "retry"],
    ["unavailable", true, "retry"],
  ] as const)("%s, free used %s -> %s", (pro, freeUsed, expected) => {
    expect(canCreateRehearsal(pro, freeUsed)).toBe(expected);
  });

  it("never says ok while the Pro state is unavailable (the free one must not be used up by an error)", () => {
    for (const used of [true, false]) {
      expect(canCreateRehearsal("unavailable", used)).not.toMatch(/^ok/);
    }
  });
});

describe("the vocabulary", () => {
  it("has the seven event kinds and three stages", () => {
    expect([...EVENT_KINDS]).toEqual([
      "interview",
      "meeting",
      "presentation",
      "appointment",
      "housing",
      "first_day",
      "other",
    ]);
    expect([...STAGES]).toEqual(["warmup", "conversation", "hard_moments"]);
    expect(isEventKind("interview")).toBe(true);
    expect(isEventKind("party")).toBe(false);
    expect(isStage("warmup")).toBe(true);
    expect(isStage("final")).toBe(false);
  });
});

describe("validateIntake", () => {
  const ok = {
    course: "en",
    eventKind: "interview",
    eventDate: "2026-12-04",
    counterpart: "a hiring manager at a hospital",
    worries: "the salary question",
  };

  it("accepts a good intake and trims the text", () => {
    const r = validateIntake({ ...ok, counterpart: "  a manager  ", worries: "  " });
    expect(r).toEqual({
      ok: true,
      value: {
        course: "en",
        eventKind: "interview",
        eventDate: "2026-12-04",
        counterpart: "a manager",
        worries: null,
      },
    });
  });

  it("allows no date ('not sure yet') and no worries", () => {
    const r = validateIntake({ ...ok, eventDate: undefined, worries: undefined });
    expect(r.ok && r.value.eventDate).toBeNull();
  });

  it(`caps counterpart and worries at ${INTAKE_TEXT_MAX} characters`, () => {
    expect(validateIntake({ ...ok, counterpart: "x".repeat(INTAKE_TEXT_MAX) }).ok).toBe(true);
    expect(validateIntake({ ...ok, counterpart: "x".repeat(INTAKE_TEXT_MAX + 1) }).ok).toBe(false);
    expect(validateIntake({ ...ok, worries: "x".repeat(INTAKE_TEXT_MAX + 1) }).ok).toBe(false);
  });

  it.each([
    ["an unknown course", { course: "de" }],
    ["an unknown kind", { eventKind: "party" }],
    ["an empty counterpart", { counterpart: "   " }],
    ["a malformed date", { eventDate: "04/12/2026" }],
    ["an impossible date", { eventDate: "2026-02-31" }],
  ])("rejects %s", (_n, patch) => {
    expect(validateIntake({ ...ok, ...patch }).ok).toBe(false);
  });
});
