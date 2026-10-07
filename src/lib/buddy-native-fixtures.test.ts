import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The iOS Kit and the Android core module each decode a COPY of the shared buddy fixtures (rules, statuses, card
// wording). If the web file changes and a copy is not refreshed, a native app keeps old wording and nothing fails.
const web = path.resolve(import.meta.dirname, "buddy.fixtures.json");
const ios = path.resolve(
  import.meta.dirname,
  "../../ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/Fixtures/buddy.fixtures.json",
);
const android = path.resolve(
  import.meta.dirname,
  "../../android/LearnWithAlphonso/core/src/test/resources/buddy.fixtures.json",
);

describe("native copies of the buddy fixtures", () => {
  it("the iOS copy is byte-for-byte the web file", () => {
    expect(fs.readFileSync(ios, "utf8")).toBe(fs.readFileSync(web, "utf8"));
  });
  it("the Android copy is byte-for-byte the web file", () => {
    expect(fs.readFileSync(android, "utf8")).toBe(fs.readFileSync(web, "utf8"));
  });
});
