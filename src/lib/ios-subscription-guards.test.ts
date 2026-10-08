import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

/** The indented body of `packages:` -> `RevenueCat:` in project.yml. */
function revenueCatBlock(yml: string): string {
  const match = yml.match(/^ {2}RevenueCat:\n((?: {4}.*\n)+)/m);
  return match ? match[1] : "";
}

describe("RevenueCat version pin", () => {
  const block = revenueCatBlock(read("ios/LearnWithAlphonso/project.yml"));

  it("pins one exact version, the one that is built and device-tested", () => {
    expect(block).toMatch(/^ {4}url: https:\/\/github\.com\/RevenueCat\/purchases-ios\.git$/m);
    expect(block).toMatch(/^ {4}exactVersion: "?5\.92\.0"?$/m);
  });

  it("has no range or moving reference beside the pin", () => {
    expect(block).not.toMatch(
      /^ {4}(from|minorVersion|majorVersion|branch|revision|minVersion|maxVersion):/m,
    );
  });

  it("is checked against what Xcode actually resolves, in CI and in the release archive", () => {
    for (const workflow of [".github/workflows/ci.yml", ".github/workflows/ios-release.yml"]) {
      expect(read(workflow)).toContain("bash scripts/check-revenuecat-resolution.sh");
    }
    expect(fs.existsSync(path.join(root, "scripts/check-revenuecat-resolution.sh"))).toBe(true);
  });
});

describe("PaywallView copy", () => {
  const source = read("ios/LearnWithAlphonso/Sources/PaywallView.swift");
  const literals = [...source.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map((m) => m[1]);

  it("has no literal -- in any string", () => {
    expect(literals.filter((s) => s.includes("--"))).toEqual([]);
  });

  it("hardcodes no price", () => {
    expect(literals.filter((s) => /[$€£¥]\s?\d/.test(s))).toEqual([]);
  });

  it("never mentions App Review or an unavailable subscription", () => {
    expect(source).not.toMatch(
      /finishes reviewing|reviewing our subscription|aren't available yet/i,
    );
  });

  it("does not import RevenueCat (the adapter is the only RevenueCat file besides app launch)", () => {
    expect(source).not.toMatch(/^import RevenueCat$/m);
  });
});
