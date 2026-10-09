import { describe, expect, it } from "vitest";
import {
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
