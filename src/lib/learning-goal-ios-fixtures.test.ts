import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The iOS Kit decodes a COPY of the shared contract fixtures. If the web file changes and the
// copy is not refreshed, iOS would keep decoding an old shape and nothing would fail.
const web = path.resolve(import.meta.dirname, "learning-goal.fixtures.json");
const ios = path.resolve(
  import.meta.dirname,
  "../../ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/Fixtures/learning-goal.fixtures.json",
);

describe("iOS copy of the learning-goal fixtures", () => {
  it("is byte-for-byte the web file", () => {
    expect(fs.readFileSync(ios, "utf8")).toBe(fs.readFileSync(web, "utf8"));
  });
});
