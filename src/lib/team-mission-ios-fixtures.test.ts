import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The iOS Kit (and, in the Android PR, the Android core module) decode a COPY of the shared team mission contract fixtures.
// If the web file changes and a copy is not refreshed, the native app keeps decoding an old shape and nothing fails.
const web = path.resolve(import.meta.dirname, "team-mission.fixtures.json");
const ios = path.resolve(
  import.meta.dirname,
  "../../ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/Fixtures/team-mission.fixtures.json",
);

describe("native copies of the team mission fixtures", () => {
  it("the iOS copy is byte-for-byte the web file", () => {
    expect(fs.readFileSync(ios, "utf8")).toBe(fs.readFileSync(web, "utf8"));
  });
});
