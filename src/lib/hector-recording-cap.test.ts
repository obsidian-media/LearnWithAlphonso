import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HECTOR_RECORDING_CAP_SECONDS } from "./hector-recording-cap";

const root = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

describe("Hector's tapped-recording cap is one number on every platform", () => {
  it("is a minute", () => expect(HECTOR_RECORDING_CAP_SECONDS).toBe(60));

  it("matches the Swift and Kotlin constants", () => {
    const swift = read(
      "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/HectorRecordingCap.swift",
    );
    const kotlin = read(
      "android/LearnWithAlphonso/core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/logic/HectorRecordingCap.kt",
    );
    expect(Number(/seconds: Double = (\d+)/.exec(swift)?.[1])).toBe(HECTOR_RECORDING_CAP_SECONDS);
    expect(Number(/const val SECONDS = (\d+)/.exec(kotlin)?.[1])).toBe(
      HECTOR_RECORDING_CAP_SECONDS,
    );
  });
});
