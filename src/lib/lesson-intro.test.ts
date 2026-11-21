import { describe, expect, it } from "vitest";
import { practiceKinds } from "./lesson-intro";

describe("practiceKinds", () => {
  it("names only the question types the lesson has, in a fixed order", () => {
    expect(practiceKinds(["mc", "mc", "fill"])).toBe("pick, fill in");
    expect(practiceKinds(["translate", "speak", "listening", "mc"])).toBe(
      "pick, listen, say it back, translate",
    );
  });
  it("does not promise speaking or listening a lesson lacks", () => {
    expect(practiceKinds(["mc", "reorder"])).not.toMatch(/listen|say it back/);
  });
  it("never reads empty", () => {
    expect(practiceKinds([])).toBe("pick");
  });
});
