import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The ASC scripts talk to App Store Connect when imported, so these read their source. They pin that the
// tested decisions are actually called, and in the right order.
const read = (name: string) =>
  readFileSync(new URL(`../../../scripts/${name}`, import.meta.url), "utf8");

describe("upload-app-store-screenshots wiring", () => {
  const src = read("upload-app-store-screenshots.ts");

  it("checks every file before the first request, so before anything is deleted", () => {
    const check = src.indexOf("screenshotFileProblems(");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(src.indexOf("await api("));
    expect(check).toBeLessThan(src.indexOf("await apiDelete("));
  });

  it("says the set is partial when an upload fails", () => {
    expect(src).toContain("the set is partial; re-run with --replace");
  });
});

describe("asc-release-ops wiring", () => {
  const src = read("asc-release-ops.ts");

  it("takes --apply only from parseOpsArgs", () => {
    expect(src).toContain("parseOpsArgs(process.argv.slice(2))");
    expect(src).not.toMatch(/process\.argv\.includes\("--apply"\)/);
  });

  it("refuses to expire a build attached to a version before it patches anything", () => {
    const check = src.indexOf("attachedBuildProblems(targets");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(src.indexOf("attributes: { expired: true }"));
    expect(src).toMatch(/if \(attached\.length > 0\) throw/);
  });

  it("reads every version, whatever its state, to find attached builds", () => {
    const fn = src.slice(src.indexOf("async function versionsWithBuilds"));
    expect(fn.slice(0, 400)).toContain("/appStoreVersions?limit=50");
    expect(fn.slice(0, 400)).not.toContain("filter[appVersionState]");
  });

  it("checks the release type and the attached build number in the submission check", () => {
    expect(src).toMatch(
      /"release type is MANUAL",\s*version\.attributes\?\.releaseType === "MANUAL"/,
    );
    expect(src).toContain("attachedBuildNumberProblem(version, arg)");
  });

  it("reads the computed age rating from the app info when the declaration lacks it, and says which", () => {
    expect(src).toContain("resolveComputedRating(live, infoRating)");
    expect(src).toContain("(from ${source})");
  });

  it("never GETs an ageRatingDeclarations resource directly", () => {
    expect(src).toContain("ageRatingDeclarationReadPath(info.id)");
    expect(src).not.toMatch(/api\(`\/ageRatingDeclarations/);
  });
});

describe("update-age-rating wiring", () => {
  const src = read("update-age-rating.ts");

  it("falls back to the app info rating and prints the source used", () => {
    expect(src).toContain("ageRatingProblems(attributes, infoRating)");
    expect(src).toContain("(source: ${source})");
  });

  it("reads through the app info and only PATCHes the declaration", () => {
    expect(src).toContain("ageRatingDeclarationReadPath(info.id)");
    expect(src).toContain("parseAgeRatingDeclaration(result.json)");
    const direct = src.match(/api\(`\/ageRatingDeclarations[^)]*\)/g) ?? [];
    expect(direct).toHaveLength(1);
    expect(direct[0]).toContain('"PATCH"');
  });
});
