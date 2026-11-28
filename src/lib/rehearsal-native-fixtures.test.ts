import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** The iOS and Android decoders pin byte-for-byte copies of the rehearsal contract; a stale copy fails here, not on a device. */
const NATIVE_DIRS = [
  "../../ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/Fixtures/",
  "../../android/LearnWithAlphonso/core/src/test/resources/",
];
/** Shared fixtures every native test suite reads: the API contract and the phrase-check cases. */
const SHARED = ["rehearsal-api.json", "phrase-check-cases.json"];

describe.each(SHARED)("%s in the native tests", (name) => {
  const source = readFileSync(new URL(`../../tests/fixtures/${name}`, import.meta.url), "utf8");
  it.each(NATIVE_DIRS.map((dir) => dir + name))("%s is a byte-for-byte copy", (path) => {
    expect(readFileSync(new URL(path, import.meta.url), "utf8")).toBe(source);
  });
});
