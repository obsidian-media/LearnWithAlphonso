import { describe, expect, it } from "vitest";
import { DEFAULT_SCOPES, SCOPES, effectiveScopes, hasScope } from "./staff-scopes";

describe("staff scopes", () => {
  it("support lacks pro.grant", () => {
    expect(hasScope("support", DEFAULT_SCOPES.support, "pro.grant")).toBe(false);
    expect(hasScope("support", DEFAULT_SCOPES.support, "users.read")).toBe(true);
  });
  it("owner has every scope, whatever is stored", () => {
    for (const s of SCOPES) expect(hasScope("owner", [], s)).toBe(true);
    expect(effectiveScopes("owner", [])).toEqual([...SCOPES]);
  });
  it("support_ai has no admin scope, even if one is stored", () => {
    for (const s of SCOPES) {
      expect(hasScope("support_ai", DEFAULT_SCOPES.support_ai, s)).toBe(false);
      expect(hasScope("support_ai", [...SCOPES], s)).toBe(false);
    }
    expect(effectiveScopes("support_ai", [...SCOPES])).toEqual([]);
  });
  it("unknown scope strings are ignored", () => {
    expect(hasScope("support", ["users.read", "root.everything"], "users.read")).toBe(true);
    expect(effectiveScopes("support", ["users.read", "root.everything"])).toEqual(["users.read"]);
  });
  it("defaults match the spec", () => {
    expect(DEFAULT_SCOPES.support).toEqual([
      "users.read",
      "users.notes",
      "support.read",
      "support.reply",
      "support.assign",
      "user.block",
      "reports.manage",
    ]);
    expect(DEFAULT_SCOPES.owner).toEqual([...SCOPES]);
  });
});
