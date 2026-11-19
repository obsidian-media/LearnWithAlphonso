import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { navItemsFor, homeFor } from "./staff-nav";
import { DEFAULT_SCOPES, effectiveScopes, hasScope, SCOPES } from "./staff-scopes";

const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const fn = strip(readFileSync("src/lib/staff-numbers.functions.ts", "utf8"));

describe("the numbers.revenue scope", () => {
  it("exists, the owner has it, and no default role other than the owner does", () => {
    expect(SCOPES).toContain("numbers.revenue");
    expect(effectiveScopes("owner", [])).toContain("numbers.revenue");
    expect(DEFAULT_SCOPES.owner).toContain("numbers.revenue");
    expect(DEFAULT_SCOPES.support).not.toContain("numbers.revenue");
    expect(DEFAULT_SCOPES.support).not.toContain("numbers.read");
    expect(DEFAULT_SCOPES.support_ai).toEqual([]);
  });
  it("a support person with numbers.read still lacks numbers.revenue unless it is granted", () => {
    expect(hasScope("support", ["numbers.read"], "numbers.revenue")).toBe(false);
    expect(hasScope("support", ["numbers.read", "numbers.revenue"], "numbers.revenue")).toBe(true);
    expect(hasScope("support_ai", ["numbers.revenue"], "numbers.revenue")).toBe(false);
  });
});

describe("the Numbers navigation item", () => {
  const has = (scopes: string[]) => navItemsFor(scopes).some((i) => i.key === "numbers");
  it("shows for either numbers scope and hides for neither", () => {
    expect(has(["numbers.read"])).toBe(true);
    expect(has(["numbers.revenue"])).toBe(true);
    expect(has([])).toBe(false);
    expect(has([...DEFAULT_SCOPES.support])).toBe(false);
  });
  it("is never the landing page for someone who can use another page", () => {
    expect(homeFor(["numbers.read", "users.read"])).toBe("/users");
    expect(homeFor(["numbers.revenue"])).toBe("/numbers");
  });
});

describe("staffGetNumbers", () => {
  it("is one POST server function gated by requireStaff() and hands the person's scopes to collectNumbers", () => {
    expect(fn.match(/createServerFn\(/g)).toHaveLength(1);
    expect(fn).toMatch(/\.middleware\(\[requireStaff\(\)\]\)/);
    expect(fn).toMatch(/scopes:\s*context\.staffScopes/);
    expect(fn).toMatch(/windowDays:\s*data\.window/);
  });
  it("accepts only 7, 30 or 90 and no extra input keys", () => {
    expect(fn).toMatch(/parseWindow\(n\) !== null/);
    expect(fn).toMatch(/\.strict\(\)/);
  });
  it("takes its keys from the server environment only and imports the provider code inside the handler", () => {
    expect(fn).toMatch(/process\.env/);
    expect(fn).not.toMatch(/^import .*numbers-sources\.server/m);
    expect(fn).toMatch(/await import\("\.\/numbers-sources\.server"\)/);
  });
  it("is rate limited, with a lower ceiling for Refresh", () => {
    expect(fn).toMatch(/consumeStaffLimit\([^)]*STAFF_LIMITS\.numbers\)/);
    expect(fn).toMatch(/data\.refresh &&[\s\S]*STAFF_LIMITS\.numbersRefresh/);
    expect(fn).not.toMatch(/createRateLimiter/);
  });
});

describe("the page code never reads a provider key", () => {
  it("numbers-core and the view have no process.env and no server imports", () => {
    for (const f of [
      "src/lib/numbers-core.ts",
      "src/components/staff/NumbersView.tsx",
      "admin/routes/numbers.tsx",
    ]) {
      const src = strip(readFileSync(f, "utf8"));
      expect(src, f).not.toMatch(/process\.env|\.server"|supabaseAdmin|node:/);
    }
  });
});
