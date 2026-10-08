import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Resolved from this file, not process.cwd().
const ROOT = path.resolve(import.meta.dirname, "../..");
const SWIFT_DIRS = ["ios/LearnWithAlphonso/Sources", "ios/LearnWithAlphonsoKit/Sources"];

function swiftFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...swiftFiles(full));
    else if (entry.name.endsWith(".swift")) out.push(full);
  }
  return out;
}

const sources = SWIFT_DIRS.flatMap((d) => swiftFiles(path.join(ROOT, d))).map((file) => ({
  file: path.relative(ROOT, file).split(path.sep).join("/"),
  text: fs.readFileSync(file, "utf8"),
}));
const code = (text: string) => text.replace(/^\s*\/\/[^\n]*$/gm, "");

describe("iOS voice guards", () => {
  it("finds the Swift sources (guards that scan nothing cannot fail)", () => {
    expect(sources.some((s) => s.file.endsWith("VoiceSession.swift"))).toBe(true);
    expect(sources.length).toBeGreaterThan(50);
  });

  it("sends no device identifier anywhere", () => {
    for (const { file, text } of sources) {
      expect(code(text), file).not.toContain("X-Alphonso-Device-Id");
      expect(code(text), file).not.toContain("identifierForVendor");
    }
  });

  it("has no teardown latch left on any voice screen", () => {
    for (const { file, text } of sources) {
      expect(code(text), file).not.toMatch(/\bisTornDown\b/);
    }
  });

  it("sets a recording category in exactly one place, routed to the speaker", () => {
    const playAndRecord = sources.filter(({ text }) =>
      /setCategory\(\s*\.playAndRecord/.test(code(text)),
    );
    expect(playAndRecord.map((s) => s.file)).toEqual([
      "ios/LearnWithAlphonso/Sources/VoiceSession.swift",
    ]);
    const voice = code(playAndRecord[0]!.text);
    expect(voice).toMatch(
      /static let categoryOptions: AVAudioSession\.CategoryOptions = \[\.defaultToSpeaker, \.allowBluetooth(HFP)?\]/,
    );
    expect(voice).toMatch(
      /setCategory\(\.playAndRecord, mode: \.default, options: categoryOptions\)/,
    );
  });

  it("asks for mic permission only through the voice engine", () => {
    const askers = sources
      .filter(({ text }) => code(text).includes("requestRecordPermission"))
      .map((s) => s.file);
    expect(askers).toEqual(["ios/LearnWithAlphonso/Sources/VoiceSession.swift"]);
  });
});
