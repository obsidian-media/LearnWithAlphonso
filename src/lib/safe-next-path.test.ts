import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next-path";

describe("safeNextPath", () => {
  it.each([
    ["/learn", "/learn"],
    ["/", "/"],
    ["/lesson/abc-123?x=1&y=2", "/lesson/abc-123?x=1&y=2"],
    ["/invite/ABC#section", "/invite/ABC#section"],
    ["/path/with%20encoded/space", "/path/with%20encoded/space"],
  ])("accepts the in-app path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    ["protocol-relative //", "//evil.com"],
    ["slash-backslash", "/\\evil.com"],
    ["leading backslash", "\\evil.com"],
    ["double backslash", "\\\\evil.com"],
    ["slash-encoded-backslash-slash", "/%5c/evil.com"],
    ["encoded //", "/%2f/evil.com"],
    ["encoded // both", "%2f%2fevil.com"],
    ["encoded // after slash", "/%2F%2Fevil.com"],
    ["encoded backslash", "/%5cevil.com"],
    ["encoded backslash upper", "/%5Cevil.com"],
    ["slash-tab-slash", "/\t/evil.com"],
    ["slash-encoded-tab-slash", "/%09/evil.com"],
    ["slash-newline-slash", "/\n/evil.com"],
    ["encoded CR", "/%0d/evil.com"],
    ["space", "/ /evil.com"],
    ["nul", "/\u0000evil"],
    ["https scheme", "https://evil.com"],
    ["javascript scheme", "javascript:alert(1)"],
    ["data scheme", "data:text/html,x"],
    ["mixed-case scheme", "HtTp://evil.com"],
    ["no leading slash", "evil.com"],
    ["empty", ""],
    ["bad percent escape", "/%zz"],
    ["too long", "/" + "a".repeat(3000)],
  ])("rejects %s", (_name, input) => {
    expect(safeNextPath(input)).toBeUndefined();
  });

  it("rejects non-strings", () => {
    expect(safeNextPath(undefined)).toBeUndefined();
    expect(safeNextPath(null)).toBeUndefined();
    expect(safeNextPath(42)).toBeUndefined();
    expect(safeNextPath(["/learn"])).toBeUndefined();
  });
});

describe("auth route wiring", () => {
  const src = readFileSync(join(__dirname, "../routes/auth.tsx"), "utf8");

  it("only ever navigates to a vetted next path", () => {
    expect(src).not.toMatch(/location\.href\s*=\s*next\b/);
    expect(src).toMatch(/location\.href\s*=\s*safe\b/);
    expect(src).toMatch(/safeNextPath\(next\)/);
  });

  it("validates the next search param with the shared helper", () => {
    expect(src).toMatch(/safeNextPath\(s\.next\)/);
  });
});
