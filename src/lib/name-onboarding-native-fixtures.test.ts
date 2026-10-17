import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The iOS Kit decodes a COPY of the name-onboarding fixture (rules and copy). If one changes alone, the
// apps disagree on what a valid name is and nothing else fails.
const web = path.resolve(import.meta.dirname, "name-onboarding.fixtures.json");
const ios = path.resolve(
  import.meta.dirname,
  "../../ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/Fixtures/name-onboarding.fixtures.json",
);
const android = path.resolve(
  import.meta.dirname,
  "../../android/LearnWithAlphonso/core/src/test/resources/name-onboarding.fixtures.json",
);

describe("native copy of the name-onboarding fixture", () => {
  it("the iOS copy is byte-for-byte the web file", () => {
    expect(fs.readFileSync(ios, "utf8")).toBe(fs.readFileSync(web, "utf8"));
  });

  it("the Android copy is byte-for-byte the web file", () => {
    expect(fs.readFileSync(android, "utf8")).toBe(fs.readFileSync(web, "utf8"));
  });
});
