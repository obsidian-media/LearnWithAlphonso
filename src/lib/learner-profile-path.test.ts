import { describe, expect, it } from "vitest";
import {
  learnerProfilePatchSchema,
  mergeLearnerProfile,
  parseLearnerProfile,
} from "./learner-profile";

describe("learner profile: path preferences", () => {
  it("accepts the optional types switched off and a trim date", () => {
    const r = learnerProfilePatchSchema.safeParse({
      pathOff: ["podcast", "talk"],
      pathTrimUntil: "2026-11-25",
    });
    expect(r.success).toBe(true);
  });
  it("refuses switching lessons off, an unknown type, or a bad date", () => {
    expect(learnerProfilePatchSchema.safeParse({ pathOff: ["lesson"] }).success).toBe(false);
    expect(learnerProfilePatchSchema.safeParse({ pathOff: ["video"] }).success).toBe(false);
    expect(learnerProfilePatchSchema.safeParse({ pathTrimUntil: "tomorrow" }).success).toBe(false);
  });
  it("parses field by field and drops a bad value without losing the rest", () => {
    const p = parseLearnerProfile({
      pathOff: ["podcast", "lesson", "x"],
      pathTrimUntil: "nope",
      goal: "travel",
    });
    expect(p.pathOff).toEqual(["podcast"]);
    expect(p.pathTrimUntil).toBeUndefined();
    expect(p.goal).toBe("travel");
  });
  it("merges a patch and lets a null trim date clear it", () => {
    const a = mergeLearnerProfile(parseLearnerProfile({}), {
      pathTrimUntil: "2026-11-25",
      pathOff: ["talk"],
    });
    expect(a.pathTrimUntil).toBe("2026-11-25");
    const b = mergeLearnerProfile(a, { pathTrimUntil: null });
    expect(b.pathTrimUntil).toBeUndefined();
    expect(b.pathOff).toEqual(["talk"]);
  });
});
