import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";

// The failure mode this guards is a build misconfiguration, not a typo:
// if vite.admin.config.ts loses its routesDirectory override, the admin
// app silently becomes a second copy of the learner app, and -- worse --
// an admin route added under src/routes/ by mistake ships to every
// learner. Both directions are checked because both have happened in
// other codebases and neither is visible in review.
describe("admin routes are isolated from the learner bundle", () => {
  it("the learner route tree contains no admin route", () => {
    const tree = readFileSync("src/routeTree.gen.ts", "utf8");
    expect(tree).not.toMatch(/\badmin\b/i);
  });

  it("the admin app has its own routes directory", () => {
    expect(existsSync("admin/routes/__root.tsx")).toBe(true);
  });

  it("the admin vite config points srcDirectory at admin/", () => {
    // srcDirectory is the key that moves the app; routesDirectory alone
    // does nothing because it resolves relative to srcDirectory. Asserted
    // on the key that has the effect, not the one that reads as if it
    // does -- an earlier version of this test checked routesDirectory and
    // would have passed against a config that built the learner app.
    const config = readFileSync("vite.admin.config.ts", "utf8");
    expect(config).toMatch(/srcDirectory:\s*"admin"/);
  });

  it("the admin app has its own generated route tree, committed", () => {
    // Committed, not ignored: src/routeTree.gen.ts is committed too, and
    // the generator only runs under `vite dev`. An ignored tree makes
    // `build:admin` fail in CI with "Could not resolve './routeTree.gen'"
    // while working perfectly on the machine that generated it.
    expect(existsSync("admin/routeTree.gen.ts")).toBe(true);
  });
});
