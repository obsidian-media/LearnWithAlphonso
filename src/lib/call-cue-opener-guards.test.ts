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

  it("Android: speakOpener waits out the cue before it starts speaking", () => {
    const src = code(
      "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/practice/ConversationViewModels.kt",
    );
    const fn = src.slice(src.indexOf("fun speakOpener"));
    const wait = fn.indexOf("delay(SoundEffectsPlayer.callCueRemainingMs())");
    expect(wait).toBeGreaterThan(-1);
    expect(wait).toBeLessThan(fn.indexOf("player.play(audio)"));
  });
});
