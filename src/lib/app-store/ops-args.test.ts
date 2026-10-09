import { describe, expect, it } from "vitest";
import { parseOpsArgs } from "./ops-args";

describe("parseOpsArgs", () => {
  it("reads a command, an optional argument and the apply flag", () => {
    expect(parseOpsArgs(["builds"])).toEqual({ cmd: "builds", arg: "", apply: false });
    expect(parseOpsArgs(["builds", "--apply"])).toEqual({ cmd: "builds", arg: "", apply: true });
    expect(parseOpsArgs(["expire-builds", "49"])).toEqual({
      cmd: "expire-builds",
      arg: "49",
      apply: false,
    });
    expect(parseOpsArgs(["expire-builds", "49", "--apply"])).toEqual({
      cmd: "expire-builds",
      arg: "49",
      apply: true,
    });
  });

  it("reads the three quoted tokens the workflow always sends, empty ones included", () => {
    expect(parseOpsArgs(["submission-check", "", ""])).toEqual({
      cmd: "submission-check",
      arg: "",
      apply: false,
    });
    expect(parseOpsArgs(["attach-build", "50", "--apply"])).toEqual({
      cmd: "attach-build",
      arg: "50",
      apply: true,
    });
    expect(parseOpsArgs(["content-rights", "", "--apply"])).toEqual({
      cmd: "content-rights",
      arg: "",
      apply: true,
    });
  });

  it("never lets the free-text argument switch on apply", () => {
    // From the workflow the argument is always the second of three tokens.
    expect(() => parseOpsArgs(["expire-builds", "--apply", ""])).toThrow(/must not start with -/);
    expect(() => parseOpsArgs(["expire-builds", "--apply", "--apply"])).toThrow(
      /must not start with -/,
    );
    expect(() => parseOpsArgs(["expire-builds", "--force", ""])).toThrow(/must not start with -/);
    expect(() => parseOpsArgs(["expire-builds", "-x"])).toThrow(/must not start with -/);
  });

  it("refuses an argument that smuggles in a second token or odd characters", () => {
    expect(() => parseOpsArgs(["expire-builds", "49 --apply", ""])).toThrow(/letters, digits/);
    expect(() => parseOpsArgs(["release-type", "MANUAL;rm", ""])).toThrow(/letters, digits/);
  });

  it("refuses an unknown third token and extra tokens", () => {
    expect(() => parseOpsArgs(["builds", "", "--force"])).toThrow(/unexpected/i);
    expect(() => parseOpsArgs(["builds", "", "", "x"])).toThrow(/unexpected/i);
  });

  it("needs a command", () => {
    expect(() => parseOpsArgs([])).toThrow(/command/i);
  });
});
