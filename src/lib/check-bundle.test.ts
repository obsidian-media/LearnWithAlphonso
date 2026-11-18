import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  LANDING_BUDGET_BROTLI,
  isCourseChunk,
  landingChunks,
  newestBuild,
  publicSourceMaps,
  staticImports,
  violations,
  type LandingReport,
} from "../../scripts/check-bundle";

const report = (over: Partial<LandingReport> = {}): LandingReport => ({
  route: "/",
  chunks: [{ file: "/assets/index-a.js", raw: 10, gzip: 5, brotli: 4, course: false }],
  raw: 10,
  gzip: 5,
  brotli: 4,
  ...over,
});

describe("check:bundle guard", () => {
  it("passes a small landing set with no course content and no maps", () => {
    expect(violations([report()], [])).toEqual([]);
  });

  it("fails over budget", () => {
    expect(violations([report({ brotli: LANDING_BUDGET_BROTLI + 1 })], [])).toHaveLength(1);
  });

  it("fails when a course chunk is in the landing set, whatever its size", () => {
    const chunks = [{ file: "/assets/courses-x.js", raw: 1, gzip: 1, brotli: 1, course: true }];
    expect(violations([report({ chunks })], [])[0]).toContain("courses-x.js");
  });

  it("fails on a public source map", () => {
    expect(violations([report()], [".vercel/output/static/assets/index-a.js.map"])).toHaveLength(1);
  });

  it("recognises course chunks by name and by content", () => {
    expect(isCourseChunk("/assets/courses-CeTK602P.js", "")).toBe(true);
    expect(isCourseChunk("/assets/index-a.js", "var e=`Greetings & Everyday Phrases`")).toBe(true);
    expect(isCourseChunk("/assets/x.js", "throw Error(`compromise: Invalid tag ${e}`)")).toBe(true);
    // The word alone is ordinary English (scenario dialogue uses it): not a marker.
    expect(isCourseChunk("/assets/scenarios-a.js", "`Can we reach a compromise?`")).toBe(false);
    expect(isCourseChunk("/assets/index-a.js", "export{a as b}")).toBe(false);
  });

  it("collects root plus route preloads, JS only, deduplicated", () => {
    const routes = {
      __root__: { preloads: ["/assets/index-a.js", "/assets/root-b.js", "/assets/app.css"] },
      "/auth": { preloads: ["/assets/auth-c.js", "/assets/root-b.js"] },
    };
    expect(landingChunks(routes, "/auth")).toEqual([
      "/assets/index-a.js",
      "/assets/root-b.js",
      "/assets/auth-c.js",
    ]);
    expect(() => landingChunks(routes, "/missing")).toThrow();
  });

  it("fails loudly when / or the root is missing, instead of measuring less", () => {
    const noLanding = { __root__: { preloads: ["/assets/index-a.js"] } };
    expect(() => landingChunks(noLanding, "/")).toThrow(/route \/ is not in the start manifest/);
    expect(() => landingChunks({ "/": { preloads: [] } }, "/")).toThrow(/__root__/);
  });

  it("measures the newest build when .vercel/output and .output both exist", () => {
    const vercel = { manifest: "v", publicDir: ".vercel/output/static", mtimeMs: 2000 };
    const local = { manifest: "o", publicDir: ".output/public", mtimeMs: 1000 };
    expect(newestBuild([vercel, local])).toBe(vercel);
    expect(newestBuild([{ ...vercel, mtimeMs: 500 }, local])).toBe(local);
    expect(() => newestBuild([])).toThrow(/no build found/);
  });

  it("lists source maps left in a public output directory", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "check-bundle-"));
    try {
      mkdirSync(path.join(dir, "assets"));
      writeFileSync(path.join(dir, "assets", "index-a.js"), "");
      expect(publicSourceMaps(dir, dir)).toEqual([]);
      writeFileSync(path.join(dir, "assets", "index-a.js.map"), "{}");
      expect(publicSourceMaps(dir, dir)).toEqual([path.join("assets", "index-a.js.map")]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("follows minified static imports of sibling chunks", () => {
    expect(
      staticImports(`import{a as b}from"./x-1.js";import"./y-2.js";import("./lazy-3.js")`),
    ).toEqual(["x-1.js", "y-2.js"]);
  });
});
