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

  it("names a recording category in exactly one place, routed to the speaker", () => {
    // Any mention, not just a direct setCategory call: a variable or a qualified name would escape a call-shaped check.
    const mentions = sources.filter(({ text }) => /\bplayAndRecord\b/.test(code(text)));
    expect(mentions.map((s) => s.file)).toEqual([
      "ios/LearnWithAlphonso/Sources/VoiceSession.swift",
    ]);
    const voice = code(mentions[0]!.text);
    expect(voice.match(/\bplayAndRecord\b/g)).toHaveLength(1);
    expect(voice).toMatch(
      /static let categoryOptions: AVAudioSession\.CategoryOptions = \[\.defaultToSpeaker, \.allowBluetooth(HFP)?\]/,
    );
    expect(voice).toMatch(
      /setCategory\(\.playAndRecord, mode: \.default, options: categoryOptions\)/,
    );
  });

  it("asks for mic permission only through the voice engine", () => {
    const askers = sources
      .filter(({ text }) =>
        /requestRecordPermission|AVCaptureDevice\s*\.\s*requestAccess|requestAccess\(\s*for:\s*\.audio/.test(
          code(text),
        ),
      )
      .map((s) => s.file);
    expect(askers).toEqual(["ios/LearnWithAlphonso/Sources/VoiceSession.swift"]);
  });

  const source = (rel: string) => code(sources.find((s) => s.file.endsWith(rel))!.text);

  it("registers the podcast pause hook from RootView with the player it keeps, never from the player's init", () => {
    expect(source("Sources/PodcastAudioPlayer.swift")).not.toMatch(/pauseOtherAudio\s*=/);
    expect(source("Sources/RootView.swift")).toContain(
      "VoiceAudioHooks.pauseOtherAudio = { [weak podcastPlayer] in podcastPlayer?.pauseForVoice() }",
    );
    const assigners = sources
      .filter(({ text }) => /pauseOtherAudio\s*=/.test(code(text)))
      .map((s) => s.file);
    expect(assigners).toEqual(["ios/LearnWithAlphonso/Sources/RootView.swift"]);
  });

  it("an account change replaces the conversation store, so a turn still in flight cannot leak into the next account", () => {
    const root = source("Sources/RootView.swift");
    expect(root).toContain("conversationStore = ConversationStore()");
    expect(root).not.toContain("conversationStore.removeAll()");
    expect(root).toContain("activeCourse.accountChanged(to: session.userID)");
  });

  it("the recorder is main-actor bound and only the recording that started can be stopped", () => {
    const voice = source("Sources/VoiceSession.swift");
    expect(voice).toMatch(/@MainActor\s+final class VoiceRecorder/);
    expect(voice).toContain("func stop(token: Int)");
    expect(voice).not.toMatch(/func stop\(\)/);
    expect(voice).toContain("guard let token, recorder.isCurrent(token) else { return }");
  });
});
