import { describe, expect, it } from "vitest";
import {
  attachedBuildNumberProblem,
  attachedBuildProblems,
  buildsToExpire,
  findBuild,
  requireNewerValidBuild,
  type AscBuild,
} from "./build-selection";

const b = (version: string, processingState = "VALID", expired = false): AscBuild => ({
  id: `id-${version}`,
  attributes: { version, processingState, expired },
});

describe("buildsToExpire", () => {
  const all = [b("50"), b("49"), b("48"), b("45", "VALID", true), b("12")];

  it("returns only non-expired builds at or below the max", () => {
    expect(buildsToExpire(all, 49).map((x) => x.attributes.version)).toEqual(["49", "48", "12"]);
  });

  it("never returns the release candidate or anything newer", () => {
    expect(buildsToExpire([b("50"), b("51")], 49)).toEqual([]);
  });

  it("includes the max itself", () => {
    expect(buildsToExpire([b("49"), b("50")], 49).map((x) => x.attributes.version)).toEqual(["49"]);
  });

  it("throws on a non-numeric build version instead of guessing", () => {
    expect(() => buildsToExpire([b("49.1")], 49)).toThrow(/non-numeric/);
  });
});

describe("requireNewerValidBuild", () => {
  it("passes when a newer VALID, non-expired build exists", () => {
    expect(requireNewerValidBuild([b("50"), b("49")], 49).attributes.version).toBe("50");
  });

  it("refuses when the newer build is missing, still processing or expired", () => {
    expect(() => requireNewerValidBuild([b("49")], 49)).toThrow(/no valid build newer than 49/i);
    expect(() => requireNewerValidBuild([b("50", "PROCESSING"), b("49")], 49)).toThrow(
      /no valid build/i,
    );
    expect(() => requireNewerValidBuild([b("50", "VALID", true), b("49")], 49)).toThrow(
      /no valid build/i,
    );
  });
});

describe("findBuild", () => {
  it("finds the exact VALID, non-expired build", () => {
    expect(findBuild([b("51"), b("50")], 50).id).toBe("id-50");
  });

  it("refuses a missing, processing or expired build", () => {
    expect(() => findBuild([b("51")], 50)).toThrow(/not found/);
    expect(() => findBuild([b("50", "PROCESSING")], 50)).toThrow(/PROCESSING/);
    expect(() => findBuild([b("50", "VALID", true)], 50)).toThrow(/expired/);
  });
});

describe("attachedBuildProblems (never expire a build a version points at)", () => {
  const targets = [b("49"), b("48")];
  const attach = (state: string, buildId: string | null, versionString = "1.0") => ({
    versionString,
    state,
    buildId,
  });

  it("refuses a target attached to a version in any editable, in-review or live state", () => {
    for (const state of [
      "PREPARE_FOR_SUBMISSION",
      "WAITING_FOR_REVIEW",
      "IN_REVIEW",
      "PENDING_DEVELOPER_RELEASE",
      "REJECTED",
      "METADATA_REJECTED",
      "DEVELOPER_REJECTED",
      "READY_FOR_SALE",
    ]) {
      const problems = attachedBuildProblems(targets, [attach(state, "id-49")]);
      expect(problems.join("|"), state).toMatch(/build 49 .*1\.0/);
    }
  });

  it("allows targets that no version uses, or that only a retired version uses", () => {
    expect(attachedBuildProblems(targets, [attach("PREPARE_FOR_SUBMISSION", "id-50")])).toEqual([]);
    expect(attachedBuildProblems(targets, [attach("PREPARE_FOR_SUBMISSION", null)])).toEqual([]);
    expect(attachedBuildProblems(targets, [attach("REPLACED_WITH_NEW_VERSION", "id-49")])).toEqual(
      [],
    );
  });

  it("reports every attached target", () => {
    const problems = attachedBuildProblems(targets, [
      attach("IN_REVIEW", "id-49"),
      attach("READY_FOR_SALE", "id-48", "0.9"),
    ]);
    expect(problems).toHaveLength(2);
  });
});

describe("attachedBuildNumberProblem", () => {
  it("requires the exact build when one is expected", () => {
    expect(attachedBuildNumberProblem("50", "50")).toBeNull();
    expect(attachedBuildNumberProblem("51", "50")).toMatch(/expected 50/);
  });

  it("otherwise requires a build above 49", () => {
    expect(attachedBuildNumberProblem("50", "")).toBeNull();
    expect(attachedBuildNumberProblem("49", "")).toMatch(/greater than 49/);
    expect(attachedBuildNumberProblem("12", "")).toMatch(/greater than 49/);
  });

  it("refuses nothing attached or a non-numeric build", () => {
    expect(attachedBuildNumberProblem("", "")).toMatch(/no build/i);
    expect(attachedBuildNumberProblem("50.1", "")).toMatch(/not a plain number/);
  });
});
