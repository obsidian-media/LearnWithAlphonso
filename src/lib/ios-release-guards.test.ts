import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildNumberProblem, compareBuildNumbers, projectVersions, versionMismatchProblems } from "./ios-release-guards";
import { yamlSetting, yamlTarget } from "./ios-project-yml";

const root = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const yml = read("ios/LearnWithAlphonso/project.yml");

describe("build numbers", () => {
  it("compares numerically, not as text", () => {
    expect(compareBuildNumbers("50", "9")).toBe(1);
    expect(compareBuildNumbers("9", "10")).toBe(-1);
    expect(compareBuildNumbers("49.1", "49")).toBe(1);
    expect(compareBuildNumbers("49", "49.0")).toBe(0);
  });

  it("accepts only a build above every uploaded build", () => {
    expect(buildNumberProblem("50", ["49", "48", "45"])).toBeNull();
    expect(buildNumberProblem("50", [])).toBeNull();
    expect(buildNumberProblem("49", ["49"])).toMatch(/not greater than the latest App Store Connect build 49/);
    expect(buildNumberProblem("48", ["49"])).toMatch(/latest App Store Connect build 49/);
    expect(buildNumberProblem("9", ["10"])).toMatch(/latest App Store Connect build 10/);
    expect(buildNumberProblem("49", ["49.1"])).toMatch(/49\.1/);
  });

  it("rejects a malformed local build number", () => {
    expect(buildNumberProblem("fifty", ["49"])).toMatch(/not a valid build number/);
  });
});

describe("app and widget versions", () => {
  it("reads both targets from the real project.yml", () => {
    const v = projectVersions(yml);
    expect(v.app.marketing).toBe("1.0");
    expect(v.app.build).toMatch(/^\d+$/);
    expect(v.widget).toEqual(v.app);
  });

  it("the real project.yml has no mismatch", () => {
    expect(versionMismatchProblems(yml)).toEqual([]);
  });

  it("reports a widget build that differs from the app's", () => {
    const widget = yamlTarget(yml, "LearnWithAlphonsoWidget");
    const build = yamlSetting(widget, "CURRENT_PROJECT_VERSION")!;
    const mutated = yml.replace(widget, widget.replace(`CURRENT_PROJECT_VERSION: "${build}"`, `CURRENT_PROJECT_VERSION: "${Number(build) - 1}"`));
    expect(versionMismatchProblems(mutated)).toEqual([`CFBundleVersion differs: app ${build}, widget ${Number(build) - 1}`]);
  });
});

describe("ios-release.yml wiring", () => {
  const workflow = read(".github/workflows/ios-release.yml");
  it("checks the latest ASC build before archiving an upload", () => {
    const guardAt = workflow.indexOf("bun scripts/check-ios-build-number.ts");
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(workflow.indexOf("- name: Archive"));
    expect(workflow).toMatch(/name: Build number is greater than the latest ASC build/);
  });
  it("checks the exported .ipa's versions, display name and the exact mic string", () => {
    expect(workflow).toContain("for KEY in CFBundleVersion CFBundleShortVersionString; do");
    const mic = yamlSetting(yamlTarget(yml, "LearnWithAlphonso"), "INFOPLIST_KEY_NSMicrophoneUsageDescription");
    expect(workflow).toContain(`EXPECTED_MIC="${mic}"`);
    expect(workflow).toContain('[ "$DISPLAY_NAME" = "Alphonso" ]');
  });
});
