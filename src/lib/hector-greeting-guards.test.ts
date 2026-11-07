import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Hector speaks first (BACKLOG 0.0-bp). The greeting itself is unit-tested on every platform (hector-greeting.test.ts,
 * HectorGreetingTests.swift, HectorGreetingTest.kt, HectorGreetingViewModelTest.kt). The iOS app target cannot be
 * built on every machine, and Compose screens have no unit tests here, so the screen wiring is pinned: the greeting
 * is asked for inside the AI consent gate, in Hector's voice, and it becomes his first turn.
 */
const root = path.resolve(import.meta.dirname, "../..");
/** Source without line comments, so a commented-out call does not count. */
const code = (p: string) =>
  fs
    .readFileSync(path.join(root, p), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/^\s*\/\/[^\n]*$/gm, "");

const IOS = "ios/LearnWithAlphonso/Sources";
const HECTOR_KT =
  "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/hector/HectorScreen.kt";

describe("iOS: Hector greets the learner", () => {
  const src = code(`${IOS}/HectorView.swift`);

  it("speaks the greeting inside the AI gate, in Hector's voice", () => {
    const task = src.indexOf(".task(id: openerCue)");
    const gate = src.indexOf(".aiDisclosureGate()");
    expect(task, "the greeting task").toBeGreaterThan(-1);
    // Applied before the gate modifier, so it runs only once the content is mounted (after consent).
    expect(task).toBeLessThan(gate);
    expect(src.slice(task, gate)).toContain(
      "voice.speakOpener(conversation.pendingOpener, session: session, course: course, speaker: .hector)",
    );
  });

  it("opens an empty conversation with the greeting once the learner context has loaded", () => {
    const fn = src.slice(src.indexOf("private func loadLearnerContext"));
    const body = fn.slice(0, fn.indexOf("\n    }\n"));
    expect(body).toMatch(
      /conversationStore\.openWithGreeting\(key, greeting: HectorGreeting\.build\(/,
    );
    expect(body).toContain("weakSpot: HectorGreeting.recentWeakSpot(trend)");
    expect(body).toMatch(/openWithGreeting[\s\S]*openerCue \+= 1/);
  });

  it("the greeting is not reportable: it is our own text", () => {
    expect(src).toContain("isOpener: conversation.openerIndices.contains(index)");
  });

  it("speech names Hector, so a refused voice falls back to his default", () => {
    const voice = code(`${IOS}/VoiceSession.swift`);
    const fn = voice.slice(voice.indexOf("func speakOpener"));
    expect(fn.slice(0, fn.indexOf("\n    }\n"))).toContain("character: speaker");
  });
});

describe("Android: Hector greets the learner", () => {
  const src = code(HECTOR_KT);

  it("asks for the greeting inside the AI consent gate", () => {
    const gates = src.split("AiConsentGate(container) {").slice(1);
    expect(gates).toHaveLength(1);
    expect(gates[0].slice(0, 300)).toContain("LaunchedEffect(Unit) { vm.greet() }");
  });

  it("says it in Hector's voice, through the shared opener player", () => {
    expect(src).toContain("OpenerSpeaker(viewModelScope, _state");
    expect(src).toContain("character = VoiceCharacter.Hector");
    expect(src).toContain("opener.speak({ pendingGreeting }, { hectorVoice(course.code) })");
  });

  it("the greeting is not reportable: it is our own text", () => {
    expect(src).toContain("enabled = !isUser && index !in state.openerIndices");
  });
});
