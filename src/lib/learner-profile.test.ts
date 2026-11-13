import { describe, expect, it } from "vitest";
import {
  AGE_RANGES,
  LEARNER_PROFILE_KEY,
  learnerProfilePatchSchema,
  mergeLearnerProfile,
  needsCompleteProfile,
  parseLearnerProfile,
} from "./learner-profile";

describe("learner profile allow-lists", () => {
  it("never accepts an under-13 age range: the age screen's block never reaches the server", () => {
    // The server is a second wall behind the device block. Adding "under-13" to AGE_RANGES turns this red.
    expect(AGE_RANGES).not.toContain("under-13");
    expect(() => learnerProfilePatchSchema.parse({ ageRange: "under-13" })).toThrow();
    expect(() => learnerProfilePatchSchema.parse({ ageRange: "12" })).toThrow();
    expect(learnerProfilePatchSchema.parse({ ageRange: "13-17" })).toEqual({ ageRange: "13-17" });
  });

  it("refuses an exact birth date in place of a range", () => {
    expect(() => learnerProfilePatchSchema.parse({ ageRange: "2010-04-01" })).toThrow();
    expect(() => learnerProfilePatchSchema.parse({ birthDate: "2010-04-01" })).toThrow();
  });

  it("refuses values outside each list", () => {
    expect(() => learnerProfilePatchSchema.parse({ goal: "spy" })).toThrow();
    expect(() => learnerProfilePatchSchema.parse({ dailyMinutes: 7 })).toThrow();
    expect(() => learnerProfilePatchSchema.parse({ country: "ZZ" })).toThrow();
    expect(() => learnerProfilePatchSchema.parse({ country: "ca" })).toThrow();
    expect(() => learnerProfilePatchSchema.parse({ nativeLanguage: "klingon" })).toThrow();
    expect(() => learnerProfilePatchSchema.parse({ interests: ["food", "guns"] })).toThrow();
    expect(() => learnerProfilePatchSchema.parse({ heardFrom: "a billboard" })).toThrow();
  });

  it("accepts a full first-run answer set", () => {
    const patch = {
      name: "Sam",
      course: "es",
      nativeLanguage: "en",
      country: "CA",
      showFlag: false,
      goal: "travel",
      level: "some",
      dailyMinutes: 10,
      ageRange: "25-34",
      interests: ["food", "travel", "music"],
      heardFrom: "social",
    };
    expect(learnerProfilePatchSchema.parse(patch)).toEqual(patch);
  });

  it("keeps a name to 40 characters and trims it", () => {
    expect(learnerProfilePatchSchema.parse({ name: "  Sam  " })).toEqual({ name: "Sam" });
    expect(() => learnerProfilePatchSchema.parse({ name: "x".repeat(41) })).toThrow();
  });
});

describe("parseLearnerProfile (what a reader trusts from client-writable metadata)", () => {
  it("drops anything not on the lists, including an under-13 range written around the server", () => {
    const parsed = parseLearnerProfile({
      ageRange: "under-13",
      goal: "travel",
      country: "XX",
      interests: ["food", "nope"],
      dailyMinutes: 99,
    });
    expect(parsed.ageRange).toBeUndefined();
    expect(parsed.country).toBeUndefined();
    expect(parsed.dailyMinutes).toBeUndefined();
    expect(parsed.goal).toBe("travel");
    expect(parsed.interests).toEqual(["food"]);
  });

  it("is empty for junk", () => {
    expect(parseLearnerProfile(null)).toEqual({ showFlag: false });
    expect(parseLearnerProfile("x")).toEqual({ showFlag: false });
  });

  it("the leaderboard flag is off unless it was turned on", () => {
    expect(parseLearnerProfile({ country: "CA" }).showFlag).toBe(false);
    expect(parseLearnerProfile({ country: "CA", showFlag: true }).showFlag).toBe(true);
    expect(parseLearnerProfile({ country: "CA", showFlag: "yes" }).showFlag).toBe(false);
  });

  it("uses one metadata key", () => {
    expect(LEARNER_PROFILE_KEY).toBe("learner_profile");
  });
});

describe("merge and the Complete-your-profile gate", () => {
  it("a patch replaces only the fields it names", () => {
    const merged = mergeLearnerProfile({ goal: "travel", showFlag: false }, { level: "new" });
    expect(merged).toMatchObject({ goal: "travel", level: "new", showFlag: false });
  });

  it("shows once: until completed or dismissed", () => {
    expect(needsCompleteProfile(parseLearnerProfile(undefined))).toBe(true);
    expect(needsCompleteProfile({ showFlag: false, completedAt: "2026-11-06T00:00:00Z" })).toBe(
      false,
    );
    expect(needsCompleteProfile({ showFlag: false, dismissedAt: "2026-11-06T00:00:00Z" })).toBe(
      false,
    );
  });
});

describe("explainMode (Explain in my language)", () => {
  it("is saved and read back", () => {
    expect(learnerProfilePatchSchema.safeParse({ explainMode: "always" }).success).toBe(true);
    expect(parseLearnerProfile({ explainMode: "off" }).explainMode).toBe("off");
  });
  it("an unknown value is dropped, not trusted", () => {
    expect(learnerProfilePatchSchema.safeParse({ explainMode: "sometimes" }).success).toBe(false);
    expect(parseLearnerProfile({ explainMode: "sometimes" }).explainMode).toBeUndefined();
  });
  it("is not set by default, so readers fall back to tap-to-explain", () => {
    expect(parseLearnerProfile({}).explainMode).toBeUndefined();
  });
});
