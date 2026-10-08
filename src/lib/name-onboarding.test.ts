import { describe, expect, it } from "vitest";
import fixtures from "./name-onboarding.fixtures.json";
import {
  NAME_ONBOARDING_COPY,
  isLearnerHandle,
  localNameProblem,
  namePrefill,
  needsNamePrompt,
  normalizeName,
  pickUserNames,
  skipNote,
} from "./name-onboarding";

describe("name onboarding rules (shared with the iOS Kit)", () => {
  it.each(fixtures.localProblem)("$id length rule", ({ input, expect: expected }) => {
    expect(localNameProblem(input)).toBe(expected);
  });

  it.each(fixtures.normalized)("$id normalizes", ({ input, expect: expected }) => {
    expect(normalizeName(input)).toBe(expected);
  });

  it.each(fixtures.prefill)("$id prefill", (row) => {
    expect(
      namePrefill({
        appleGivenName: row.appleGivenName,
        names: { givenName: row.givenName, fullName: row.fullName, name: row.name },
        currentName: row.currentName,
      }),
    ).toBe(row.expect);
  });

  it("prompts only while unconfirmed", () => {
    expect(needsNamePrompt(null)).toBe(true);
    expect(needsNamePrompt(undefined)).toBe(true);
    expect(needsNamePrompt("2026-10-08T10:00:00+00:00")).toBe(false);
  });

  it("reads only string name fields from user_metadata", () => {
    expect(
      pickUserNames({ given_name: "Ana", full_name: "Ana Lima", name: 7, email: "a@b.co" }),
    ).toEqual({
      givenName: "Ana",
      fullName: "Ana Lima",
      name: null,
    });
    expect(pickUserNames(undefined)).toEqual({ givenName: null, fullName: null, name: null });
  });

  it("skip note names a real handle and stays generic otherwise", () => {
    expect(skipNote("Learner-0B1C")).toBe(
      fixtures.copy.skipNoteHandle.replace("{name}", "Learner-0B1C"),
    );
    expect(skipNote("Jenny Coon")).toBe(fixtures.copy.skipNoteGeneric);
    expect(isLearnerHandle("Learner-4f2a")).toBe(false);
  });

  it("copy has no double hyphen", () => {
    for (const value of Object.values(NAME_ONBOARDING_COPY)) expect(value).not.toContain("--");
  });
});
