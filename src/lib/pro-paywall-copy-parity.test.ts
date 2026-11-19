import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PRO_PAYWALL_COPY } from "./paywall-copy";

/**
 * The Pro paywall's words must not drift between the web, the iPhone and Android: "Everything else stays free" once
 * outlived the hearts change on one platform only. This is a text-level copy-parity guard: it reads the Swift and
 * Kotlin sources and compares their string constants with the web values. It does not run the native code; the
 * native unit tests and screens are the signal for how those constants are used.
 */
const root = path.resolve(import.meta.dirname, "../..");
const swift = fs.readFileSync(
  path.join(root, "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/ProPaywall.swift"),
  "utf8",
);
const kotlin = fs.readFileSync(
  path.join(
    root,
    "android/LearnWithAlphonso/core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/logic/ProPaywall.kt",
  ),
  "utf8",
);

/** Web key -> the Kotlin constant (the Swift name is the web key). */
const SHARED: Record<string, string> = {
  kicker: "KICKER",
  headlineLead: "HEADLINE_LEAD",
  headlineMark: "HEADLINE_MARK",
  headlineEnd: "HEADLINE_END",
  exampleLabel: "EXAMPLE_LABEL",
  freeLabel: "FREE_LABEL",
  freeNote: "FREE_NOTE",
};

/** The string literal assigned to `name`, decoded, or undefined when the source has no such constant. */
function swiftString(name: string): string | undefined {
  const m = swift.match(new RegExp(`public static let ${name} = ("(?:[^"\\\\]|\\\\.)*")`));
  return m ? (JSON.parse(m[1]) as string) : undefined;
}
function kotlinString(name: string): string | undefined {
  const m = kotlin.match(new RegExp(`const val ${name} = ("(?:[^"\\\\$]|\\\\.)*")`));
  return m ? (JSON.parse(m[1]) as string) : undefined;
}
/** The quoted strings inside `<decl> = [ ... ]` (Swift) or `<decl> = listOf( ... )` (Kotlin). */
function listStrings(src: string, decl: RegExp): string[] {
  const m = src.match(decl);
  return m
    ? [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => JSON.parse(`"${x[1]}"`) as string)
    : [];
}

describe("Pro paywall copy is the same on web, iOS and Android", () => {
  it.each(Object.entries(SHARED))("%s", (webKey, kotlinName) => {
    const web = PRO_PAYWALL_COPY[webKey as keyof typeof PRO_PAYWALL_COPY];
    expect(typeof web).toBe("string");
    expect(swiftString(webKey), `iOS ProPaywallCopy.${webKey}`).toBe(web);
    expect(kotlinString(kotlinName), `Android ProPaywallCopy.${kotlinName}`).toBe(web);
  });

  it("the free items", () => {
    const web = [...PRO_PAYWALL_COPY.freeItems];
    expect(listStrings(swift, /public static let freeItems = \[([^\]]*)\]/)).toEqual(web);
    expect(listStrings(kotlin, /val freeItems = listOf\(([^)]*)\)/)).toEqual(web);
  });

  it("the three facts, title then detail", () => {
    const web = PRO_PAYWALL_COPY.facts.flatMap((f) => [f.title, f.detail]);
    expect(listStrings(swift, /public static let facts: [^=]*= \[([\s\S]*?)\n {4}\]/)).toEqual(web);
    expect(listStrings(kotlin, /val facts = listOf\(([^\n]*)\)\n/)).toEqual(web);
  });

  it("no platform still says everything else is free (hearts are limited without Pro)", () => {
    for (const src of [swift, kotlin, JSON.stringify(PRO_PAYWALL_COPY)]) {
      expect(src).not.toMatch(/Everything else stays free/);
    }
  });
});
