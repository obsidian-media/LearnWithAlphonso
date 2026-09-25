import { describe, expect, it } from "vitest";
import { CliArgError, parseCliArgs, requireIntFlag, requireOneOf } from "./podcast-cli-args";

const spec = {
  booleans: ["confirm"],
  values: ["folder", "slug", "title", "parent", "sort", "course", "level"],
};

describe("parseCliArgs", () => {
  it("reads the command and its value flags", () => {
    const { command, flags } = parseCliArgs(["add", "--folder", "en/a1", "--slug", "ep1"], spec);
    expect(command).toBe("add");
    expect(flags.folder).toBe("en/a1");
    expect(flags.slug).toBe("ep1");
  });

  it("reads a boolean flag with no value as true", () => {
    const { flags } = parseCliArgs(["publish", "--confirm"], spec);
    expect(flags.confirm).toBe(true);
  });

  // THE bug this file exists for. `--confirm yes` is what someone types when
  // they are unsure whether the flag takes a value. The old parser stored the
  // string "yes", which failed an identity check against `true`, so the
  // command dry-ran and reported nothing wrong -- in a tool whose success
  // signal is the absence of output, on a publish an operator believed they
  // had made.
  it("rejects a boolean flag that carries a value instead of silently dry-running", () => {
    expect(() => parseCliArgs(["publish", "--confirm", "yes"], spec)).toThrow(CliArgError);
    expect(() => parseCliArgs(["publish", "--confirm", "yes"], spec)).toThrow(/--confirm/);
  });

  it("names what to type instead when a boolean carries a value", () => {
    expect(() => parseCliArgs(["publish", "--confirm", "true"], spec)).toThrow(
      /takes no value.*--confirm/is,
    );
  });

  it("rejects a value flag with no value rather than falling back silently", () => {
    // The old parser turned `--parent` into `true`, which then failed a
    // `typeof === "string"` check and silently became "root" -- creating a
    // root folder when the operator meant to nest one.
    expect(() => parseCliArgs(["folder", "--parent", "--slug", "a1"], spec)).toThrow(
      /--parent needs a value/,
    );
  });

  it("rejects a value flag at the very end with no value", () => {
    expect(() => parseCliArgs(["folder", "--slug"], spec)).toThrow(/--slug needs a value/);
  });

  it("rejects an unknown flag instead of ignoring it", () => {
    // A typo'd --titel used to vanish, and the operator got "--title is
    // required" while looking at a command line that plainly had a title.
    expect(() => parseCliArgs(["add", "--titel", "Hello"], spec)).toThrow(/--titel/);
  });

  it("rejects the same flag twice, since one value silently wins", () => {
    expect(() => parseCliArgs(["add", "--slug", "a", "--slug", "b"], spec)).toThrow(/--slug/);
  });

  it("accepts a value that begins with a digit or a slash", () => {
    const { flags } = parseCliArgs(["add", "--folder", "en/a1", "--sort", "3"], spec);
    expect(flags.folder).toBe("en/a1");
    expect(flags.sort).toBe("3");
  });

  it("rejects a bare positional argument rather than ignoring it", () => {
    expect(() => parseCliArgs(["add", "oops", "--slug", "a"], spec)).toThrow(/oops/);
  });
});

describe("requireIntFlag", () => {
  it("parses a whole number", () => {
    expect(requireIntFlag({ sort: "3" }, "sort", 0)).toBe(3);
  });

  it("falls back when the flag is absent", () => {
    expect(requireIntFlag({}, "sort", 0)).toBe(0);
  });

  // The old code ran Number("abc") -> NaN, serialised it to JSON null, and
  // surfaced a raw Postgres NOT NULL violation.
  it("rejects a non-numeric value instead of sending NaN to Postgres", () => {
    expect(() => requireIntFlag({ sort: "abc" }, "sort", 0)).toThrow(/--sort/);
  });

  it("rejects a fractional value", () => {
    expect(() => requireIntFlag({ sort: "1.5" }, "sort", 0)).toThrow(/whole number/);
  });
});

describe("requireOneOf", () => {
  it("accepts an allowed value", () => {
    expect(requireOneOf({ course: "en" }, "course", ["en", "fr", "es"])).toBe("en");
  });

  it("returns null when the flag is absent, since course is optional", () => {
    expect(requireOneOf({}, "course", ["en", "fr", "es"])).toBeNull();
  });

  // Previously a typo reached Postgres and came back as a raw CHECK
  // constraint violation, in a tool that validates everything else politely.
  it("rejects a value outside the set and lists what is allowed", () => {
    expect(() => requireOneOf({ course: "english" }, "course", ["en", "fr", "es"])).toThrow(
      /en, fr, es/,
    );
  });
});
