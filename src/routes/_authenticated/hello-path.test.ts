import { describe, expect, it } from "vitest";
import { afterFirstRunPath } from "./hello";

describe("afterFirstRunPath", () => {
  it("Meet Hector opens Hector, even after 'I know some' with no placement taken", () => {
    expect(afterFirstRunPath("hector", "some", false)).toBe("/hector");
    expect(afterFirstRunPath("hector", "confident", false)).toBe("/hector");
  });
  it("Not now still offers placement to those who asked for it", () => {
    expect(afterFirstRunPath("lesson", "some", false)).toBe("/placement");
    expect(afterFirstRunPath("lesson", "some", true)).toBe("/learn");
  });
});
