import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openToken, sealToken } from "./token-sealing.server";

const key = randomBytes(32).toString("base64");

describe("stored Apple tokens are sealed when a key is configured", () => {
  it("a sealed token is not the plain token and opens back to it", () => {
    const sealed = sealToken("r.apple-refresh-token", key);
    expect(sealed.startsWith("v1:")).toBe(true);
    expect(sealed).not.toContain("apple-refresh-token");
    expect(openToken(sealed, key)).toBe("r.apple-refresh-token");
  });

  it("each seal uses a fresh nonce", () => {
    expect(sealToken("same", key)).not.toBe(sealToken("same", key));
  });

  it("a tampered or wrong-key token does not open", () => {
    const sealed = sealToken("r.token", key);
    // Change one character inside the ciphertext (not the base64 padding bits at the end).
    const at = 20;
    const flipped = sealed.slice(0, at) + (sealed[at] === "A" ? "Q" : "A") + sealed.slice(at + 1);
    expect(() => openToken(flipped, key)).toThrow();
    expect(() => openToken(sealed, randomBytes(32).toString("base64"))).toThrow();
    expect(() => openToken(sealed, undefined)).toThrow(/ENCRYPTION_KEY/);
  });

  it("tokens stored before sealing still open, and without a key nothing is sealed", () => {
    expect(openToken("r.legacy-plain", key)).toBe("r.legacy-plain");
    expect(sealToken("r.token", undefined)).toBe("r.token");
  });

  it("a key that is not 32 bytes is refused rather than used", () => {
    expect(() => sealToken("r.token", Buffer.from("short").toString("base64"))).toThrow(/32 bytes/);
  });
});
