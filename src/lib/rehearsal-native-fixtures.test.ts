import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** The iOS and Android decoders pin byte-for-byte copies of the rehearsal contract; a stale copy fails here, not on a device. */
const source = readFileSync(
  new URL("../../tests/fixtures/rehearsal-api.json", import.meta.url),
  "utf8",
);
const copies = [
  "../../ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/Fixtures/rehearsal-api.json",
  "../../android/LearnWithAlphonso/core/src/test/resources/rehearsal-api.json",
];
describe("rehearsal API fixture in the native tests", () => {
  it.each(copies)("%s is a byte-for-byte copy", (path) => {
    expect(readFileSync(new URL(path, import.meta.url), "utf8")).toBe(source);
  });
});
