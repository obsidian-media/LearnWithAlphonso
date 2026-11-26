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

describe("asc-release-ops testflight", () => {
  const src = read("asc-release-ops.ts");
  const fn = src.slice(
    src.indexOf("async function testflight"),
    src.indexOf("async function main"),
  );

  it("checks the copy before any request", () => {
    expect(fn.indexOf("testflightCopyProblems(")).toBeGreaterThan(-1);
    expect(fn.indexOf("testflightCopyProblems(")).toBeLessThan(fn.indexOf("await "));
  });

  // Sees literal methods only: a write through a helper or a variable method would slip past it.
  it("writes nothing before the apply gate", () => {
    const gate = fn.indexOf("if (!APPLY) return;");
    expect(gate).toBeGreaterThan(-1);
    expect(fn.slice(0, gate)).not.toMatch(/"(PATCH|POST|DELETE)"/);
  });

  it("beta-status only reads: no write method between its start and the next function", () => {
    const status = src.slice(
      src.indexOf("async function betaStatus"),
      src.indexOf("/** External Beta App Review for one exact build"),
    );
    expect(status.length).toBeGreaterThan(200);
    expect(status).not.toMatch(/"(PATCH|POST|DELETE)"/);
  });

  it("adds a build to a group only in add-to-external-groups, never anywhere else in the script", () => {
    const start = src.indexOf("async function addToExternalGroups");
    const end = src.indexOf(
      "/** Read-only: prints exactly what App Store Connect says about one build.",
    );
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const outside = src.slice(0, start) + src.slice(end);
    expect(outside).not.toMatch(
      /buildBetaNotifications|relationships\/builds|relationships\/betaGroups|\/betaGroups[`"],\s*"POST"/,
    );
  });

  it("add-to-external-groups writes only with --apply, only after beta approval, and skips internal groups", () => {
    const fn = src.slice(
      src.indexOf("async function addToExternalGroups"),
      src.indexOf("/** Read-only: prints exactly what App Store Connect says about one build."),
    );
    const post = fn.indexOf('relationships/builds`, "POST"');
    expect(post).toBeGreaterThan(0);
    // The approval refusal and the internal-group skip come before any write.
    expect(fn.indexOf('state !== "BETA_APPROVED"')).toBeGreaterThan(0);
    expect(fn.indexOf('state !== "BETA_APPROVED"')).toBeLessThan(post);
    expect(fn.indexOf("if (a.isInternalGroup) continue;")).toBeGreaterThan(0);
    expect(fn.indexOf("if (a.isInternalGroup) continue;")).toBeLessThan(post);
    // The write sits after the read-only early continue.
    expect(fn.indexOf("if (!APPLY) {")).toBeGreaterThan(0);
    expect(fn.indexOf("if (!APPLY) {")).toBeLessThan(post);
    // Exactly one group write, and no buildBetaNotifications.
    expect(fn.match(/"POST"/g)?.length).toBe(1);
    expect(fn).not.toMatch(/buildBetaNotifications/);
  });

  it("the testflight command never submits a build for Beta App Review", () => {
    expect(fn).not.toMatch(/betaAppReviewSubmissions/);
  });

  // The one place that submits: a named build, only after the problems check and the apply gate.
  it("submits for Beta App Review only in submitBetaReview, after the checks and the apply gate", () => {
    expect(src.match(/betaAppReviewSubmissions/g)).toHaveLength(2); // the path and the resource type
    const submit = src.slice(
      src.indexOf("async function submitBetaReview"),
      src.indexOf("/** External TestFlight readiness"),
    );
    expect(submit).toContain("betaSubmissionProblems(");
    const gate = submit.indexOf("if (!APPLY)");
    expect(gate).toBeGreaterThan(-1);
    expect(submit.indexOf("betaAppReviewSubmissions")).toBeGreaterThan(gate);
    expect(submit.indexOf("betaSubmissionProblems(")).toBeLessThan(gate);
    expect(submit.slice(0, gate)).not.toMatch(/"(PATCH|POST|DELETE)"/);
  });

  it("fails the run on a read-back mismatch", () => {
    expect(fn.match(/!== (v|whatsNew)\) process\.exitCode = 1/g)).toHaveLength(2);
  });
});
