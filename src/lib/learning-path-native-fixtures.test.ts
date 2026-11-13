import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** The iOS and Android decoders pin byte-for-byte copies of the contract; a stale copy fails here, not on a device. */
const source = readFileSync(new URL("./learning-path.fixtures.json", import.meta.url), "utf8");
const copies = [
  "../../ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/Fixtures/learning-path.fixtures.json",
  "../../android/LearnWithAlphonso/core/src/test/resources/learning-path.fixtures.json",
];
describe("learning path fixtures in the native tests", () => {
  it.each(copies)("%s is a byte-for-byte copy", (path) => {
    expect(readFileSync(new URL(path, import.meta.url), "utf8")).toBe(source);
  });
});
