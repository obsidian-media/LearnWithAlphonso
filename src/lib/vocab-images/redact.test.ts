import { describe, expect, it } from "vitest";
import { redactKeys } from "./redact";

describe("redactKeys", () => {
  it("removes every occurrence of a known secret", () => {
    expect(redactKeys("bad key abc123secret in abc123secret", ["abc123secret"])).toBe(
      "bad key [redacted] in [redacted]",
    );
  });

  it("redacts a key= query parameter even when the secret is unknown", () => {
    expect(redactKeys("GET https://pixabay.com/api/?key=zzz999&q=apple failed", [])).toBe(
      "GET https://pixabay.com/api/?key=[redacted]&q=apple failed",
    );
  });

  it("ignores undefined and too-short secrets", () => {
    expect(redactKeys("a b c", [undefined, "a"])).toBe("a b c");
  });
});
