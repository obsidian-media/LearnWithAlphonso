/**
 * The call-start sound must be over before Alphonso's opening line starts. The timing itself is unit-tested (sfx.test.ts,
 * SoundEffectsTests.swift, SoundEffectsTest.kt); these pin that each platform's opener path waits for it.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const code = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("the opening line waits for the call-start sound", () => {
  it("web: Practice and Campaigns await the cue before the opener's audio starts", () => {
    for (const rel of [
      "src/routes/_authenticated/converse_.$scenarioId.tsx",
      "src/routes/_authenticated/campaign_.$campaignId.tsx",
    ]) {
      const src = code(rel);
      const wait = src.indexOf("if (opts?.opener) await waitForCallCue();");
      expect(wait, rel).toBeGreaterThan(-1);
      expect(wait, rel).toBeLessThan(src.indexOf("new Audio(url)"));
    }
  });

  it("iOS: speakOpener waits out the cue after fetching and before playing", () => {
    const src = code("ios/LearnWithAlphonso/Sources/VoiceSession.swift");
    const fn = src.slice(src.indexOf("func speakOpener"));
    const wait = fn.indexOf("SoundEffectsPlayer.shared.callCueRemaining()");
    expect(wait).toBeGreaterThan(fn.indexOf("OpenerSpeechCache.shared.audio"));
    expect(wait).toBeLessThan(fn.indexOf("play(audio, generation: generation)"));
  });

  it("web: Hector's greeting awaits the cue before its audio starts", () => {
    const src = code("src/routes/_authenticated/hector.tsx");
    const fn = src.slice(src.indexOf("const greet = useCallback"));
    const wait = fn.indexOf("await waitForCallCue();");
    expect(wait).toBeGreaterThan(fn.indexOf("cachedOpenerSpeech("));
    expect(wait).toBeLessThan(fn.indexOf("playBlob(blob)"));
  });

  it("iOS: Hector's greeting goes through speakOpener, so it waits too", () => {
    expect(code("ios/LearnWithAlphonso/Sources/HectorView.swift")).toContain(
      "voice.speakOpener(conversation.pendingOpener, session: session, course: course, speaker: .hector)",
    );
  });

  it("Android: the shared opener player (Alphonso's openers, Hector's greeting) waits out the cue", () => {
    const practice =
      "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui";
    const src = code(`${practice}/practice/OpenerSpeaker.kt`);
    const fn = src.slice(src.indexOf("fun speak("));
    const wait = fn.indexOf("delay(SoundEffectsPlayer.callCueRemainingMs())");
    expect(wait).toBeGreaterThan(fn.indexOf("cache.audio("));
    expect(wait).toBeLessThan(fn.indexOf("player.play(audio)"));
    // Both callers use it.
    expect(code(`${practice}/practice/ConversationViewModels.kt`)).toContain("opener.speak(");
    expect(code(`${practice}/hector/HectorScreen.kt`)).toContain("opener.speak(");
  });
});
