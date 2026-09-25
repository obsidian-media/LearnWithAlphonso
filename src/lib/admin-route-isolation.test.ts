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

  it("the admin app registers the auth attacher in its own start.ts", () => {
    // Its absence was a total, silent authentication failure. srcDirectory
    // is "admin", so TanStack Start loads admin/start.ts and never
    // src/start.ts; with no file there, NO global function middleware was
    // registered, attachSupabaseAuth never ran, and the browser attached
    // no bearer token to any serverFn RPC. requireSupabaseAuth then
    // rejected every admin call.
    //
    // The symptom was indistinguishable from a rejected login -- sign in,
    // land on /, adminWhoAmI throws, bounce back to /signin -- and nothing
    // in the build, the types or the suite could see it, because the
    // missing piece was a file nothing referenced by name.
    expect(existsSync("admin/start.ts")).toBe(true);
    const start = readFileSync("admin/start.ts", "utf8");
    expect(start).toContain("attachSupabaseAuth");
    expect(start).toMatch(/functionMiddleware:\s*\[[^\]]*attachSupabaseAuth/);
  });

  it("registers every global function middleware src/start.ts does", () => {
    // Drift guard. A middleware added to the learner app's start.ts does
    // not apply to the admin app, and that failure would again be silent.
    const names = (source: string) =>
      (source.match(/functionMiddleware:\s*\[([^\]]*)\]/)?.[1] ?? "")
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean)
        .sort();
    const learner = names(readFileSync("src/start.ts", "utf8"));
    expect(learner.length).toBeGreaterThan(0);
    expect(names(readFileSync("admin/start.ts", "utf8"))).toEqual(learner);
  });

  it("the admin app has its own generated route tree, committed", () => {
    // Committed, not ignored: src/routeTree.gen.ts is committed too, and
    // the generator only runs under `vite dev`. An ignored tree makes
    // `build:admin` fail in CI with "Could not resolve './routeTree.gen'"
    // while working perfectly on the machine that generated it.
    expect(existsSync("admin/routeTree.gen.ts")).toBe(true);
  });
});
