import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Build 59: a Practice call showed the scene's opening line, but Alphonso never said it. The native opener is seeded
 * into the transcript locally, so it never passes through the reply path that synthesizes and plays a reply. The
 * speaking itself is unit-tested (OpenerSpeechTests.swift, ConversationViewModelsTest.kt); the app-target screens
 * cannot be built on every machine, so their wiring is pinned here: each screen asks for the opener to be spoken.
 */
const root = path.resolve(import.meta.dirname, "../..");
/** Source without line comments, so a commented-out call does not count. */
const code = (p: string) =>
  fs
    .readFileSync(path.join(root, p), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/^\s*\/\/[^\n]*$/gm, "");

const IOS = "ios/LearnWithAlphonso/Sources";
const ANDROID =
  "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/practice";

describe("iOS: Practice and Campaigns say the opener", () => {
  for (const file of ["ConversationView.swift", "CampaignView.swift"]) {
    it(`${file} speaks the pending opener inside the AI gate when the call appears`, () => {
      const src = code(`${IOS}/${file}`);
      const task = src.indexOf(".task(id: openerCue)");
      const gate = src.indexOf(".aiDisclosureGate()");
      expect(task, "the opener task").toBeGreaterThan(-1);
      // Applied before the gate modifier, so it runs only once the content is mounted (after consent).
      expect(task).toBeLessThan(gate);
      expect(src.slice(task, gate)).toContain(
        "voice.speakOpener(conversation.pendingOpener, session: session, course: course)",
      );
      const onAppear = src.slice(src.indexOf(".onAppear {"), src.indexOf(".onDisappear {"));
      expect(onAppear).toMatch(/voice\.appeared\(\)\s*\n\s*openerCue \+= 1/);
    });
  }

  it("a new conversation, a new scene and a restarted scene say their opener too", () => {
    const practice = code(`${IOS}/ConversationView.swift`);
    expect(practice.slice(practice.indexOf("func startNewConversation"))).toMatch(
      /startNew\(key, opener: scenario\.opener\)[\s\S]{0,80}openerCue \+= 1/,
    );
    const campaign = code(`${IOS}/CampaignView.swift`);
    for (const fn of ["func continueToNextScene", "func restartScene"]) {
      const body = campaign.slice(campaign.indexOf(fn));
      expect(body.slice(0, body.indexOf("\n    }\n")), fn).toContain("openerCue += 1");
    }
  });

  it("speakOpener plays through the reply player, so the lips follow it", () => {
    const voice = code(`${IOS}/VoiceSession.swift`);
    const fn = voice.slice(voice.indexOf("func speakOpener"));
    expect(fn).toContain("OpenerSpeechCache.shared.audio");
    expect(fn).toContain("play(audio, generation: generation)");
    expect(fn).toContain("VoicePrefsCache().voice(.alphonso, course: courseCode)");
  });
});

describe("Android: Practice and Campaigns say the opener", () => {
  it("both screens ask for the opener inside the AI consent gate", () => {
    const src = code(`${ANDROID}/PracticeScreens.kt`);
    const gates = src.split("AiConsentGate(container, onDecline = onBack) {").slice(1);
    expect(gates).toHaveLength(2);
    for (const gate of gates) {
      expect(gate.slice(0, 400)).toContain("LaunchedEffect(Unit) { vm.speakOpener() }");
    }
  });

  it("a new scene and a restarted scene say their opener", () => {
    const src = code(`${ANDROID}/ConversationViewModels.kt`);
    for (const fn of ["fun continueToNextScene", "fun restartScene"]) {
      const body = src.slice(src.indexOf(fn));
      expect(body.slice(0, body.indexOf("\n    }\n")), fn).toContain("speakOpener()");
    }
  });
});
