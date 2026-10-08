import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// In-app contact is support@ only. src/routes (legal pages) are checked by their own tests.
const ROOTS = [
  "ios/LearnWithAlphonso/Sources",
  "src/components",
  "src/lib",
  "android/LearnWithAlphonso/app/src/main",
];
// Lists addresses the legal pages must NOT show (a forbidden-phrase list), so it names other addresses on purpose.
const SKIP = new Set(["legal-required-phrases.ts"]);
function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.(swift|tsx?|kt|xml)$/.test(e.name) && !/\.test\./.test(e.name) && !SKIP.has(e.name)
      ? [p]
      : [];
  });
}

describe("in-app contact address", () => {
  it("is support@alphonsoecosystem.app everywhere", () => {
    const offenders = ROOTS.flatMap((r) => files(path.join(process.cwd(), r))).flatMap((f) =>
      [...fs.readFileSync(f, "utf8").matchAll(/[a-z0-9._+-]+@alphonsoecosystem\.app/gi)]
        .map((m) => m[0])
        .filter((a) => a.toLowerCase() !== "support@alphonsoecosystem.app")
        .map((a) => `${path.relative(process.cwd(), f)}: ${a}`),
    );
    expect(offenders).toEqual([]);
  });
});
