import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// alphonsoecosystem.app (and hello.alphonsoecosystem.app on Resend) was retired;
// mail now sends from hello.learnwithalphonso.com. Docs and applied migrations are history.
const OLD_EMAIL = /@[a-z0-9.-]*alphonsoecosystem\.app\b/i;
const SELF = "src/lib/no-old-email-domain.test.ts";

describe("retired email domain", () => {
  it("is not used as an email domain in any source file", () => {
    const tracked = execFileSync("git", ["ls-files", "-z"], {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    })
      .split("\0")
      .filter(Boolean)
      .filter((f) => f !== SELF && !f.startsWith("docs/") && !f.startsWith("supabase/migrations/"))
      .filter((f) =>
        /\.(tsx?|jsx?|mjs|cjs|json|ya?ml|html|md|sql|sh|swift|kt|kts|xml|plist|strings|txt|toml|env\S*)$/i.test(
          f,
        ),
      );
    expect(tracked.length).toBeGreaterThan(100);
    const offenders = tracked.filter((f) => {
      try {
        return OLD_EMAIL.test(fs.readFileSync(path.join(process.cwd(), f), "utf8"));
      } catch {
        return false;
      }
    });
    expect(offenders).toEqual([]);
  }, 60_000);

  it("catches the old domain (the guard can fail)", () => {
    expect(OLD_EMAIL.test("support@alphonsoecosystem.app")).toBe(true);
    expect(OLD_EMAIL.test("reports@hello.alphonsoecosystem.app")).toBe(true);
    expect(OLD_EMAIL.test("support@hello.learnwithalphonso.com")).toBe(false);
  });
});
