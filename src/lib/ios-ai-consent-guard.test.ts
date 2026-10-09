import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The iOS app target only compiles on macOS CI, so its consent wiring is pinned here by source guards. Behaviour
 * lives in the Kit (AIConsentStoreTests, AIConsentPolicyTests, AIResponseReportTests).
 */
const SRC = path.resolve(import.meta.dirname, "../../ios/LearnWithAlphonso/Sources");
const files = fs.readdirSync(SRC).filter((f) => f.endsWith(".swift"));
const code = (f: string) =>
  fs.readFileSync(path.join(SRC, f), "utf8").replace(/^\s*\/\/[^\n]*$/gm, "");
// Files allowed to read the device mirror of the account consent (the store keeps it in step). None: every screen
// reads the store.
const LEGACY_MIRROR_READERS: string[] = [];

describe("iOS AI consent wiring", () => {
  it("lesson, review and placement are never walled by consent", () => {
    for (const f of ["LessonPlayerView.swift", "ReviewQueueView.swift", "PlacementView.swift"]) {
      expect(code(f), f).not.toContain(".aiDisclosureGate()");
    }
  });

  it("only the AI screens carry the whole-screen gate", () => {
    const gated = files.filter((f) => code(f).includes(".aiDisclosureGate()")).sort();
    expect(gated).toEqual(["CampaignView.swift", "ConversationView.swift", "HectorView.swift"]);
  });

  it("placement grades on device only", () => {
    const s = code("PlacementView.swift");
    expect(s).not.toMatch(
      /gradeTranslation\(|AIConversationClient|aiDisclosure|TranslateQuestionCard/,
    );
  });

  it("only the account store writes consent", () => {
    for (const f of files) expect(code(f), f).not.toContain("AIDisclosureGate.acknowledge(");
  });

  it("nothing reads the old device flag; every screen reads the account store", () => {
    const readers = files
      .filter((f) => code(f).includes("AIDisclosureGate.isAcknowledged("))
      .sort();
    expect(readers).toEqual(LEGACY_MIRROR_READERS);
  });

  it("translation grading offers the opt-in only when the account said no, never for a failed read", () => {
    const s = code("TranslateQuestionCard.swift");
    expect(s).toContain(
      "AIConsentPolicy.offersAIGradingOptIn(on: surface, status: aiConsent.status)",
    );
    expect(s).not.toContain("aiConsent.isGranted");
    expect(s).toContain("hasAIConsent: Bool");
    expect(s).not.toContain("AIDisclosureGate");
  });

  it("the app injects the account-backed store", () => {
    expect(code("LearnWithAlphonsoApp.swift")).toContain(".environmentObject(aiConsentStore)");
  });

  it("Settings has the AI features toggle backed by the store, and a retry when the setting cannot be read", () => {
    const s = code("SettingsView.swift");
    expect(s).toContain("AIConsentCopy.settingsTitle");
    expect(s).toContain("aiConsent.set(false)");
    expect(s).toContain("AIConsentCopy.checkFailedTitle");
    // A stale error must not outlive a later success.
    expect(s).toMatch(/\.onChange\(of: aiConsent\.isGranted\)[^\n]*aiConsentErrorMessage = nil/);
  });

  it("the gate view only draws AIConsentGate.presentation (the tested decision), with no rule of its own", () => {
    const s = code("AIDisclosureSheet.swift");
    // The mount / spinner / prompt / cover decision is the Kit function (AIConsentGateTests).
    expect(s).toContain("AIConsentGate.presentation(");
    expect(s).toContain("hasBeenShown: hasBeenGranted");
    expect(s).toContain("didRefresh: didRefresh");
    expect(s).toContain("case .content(let covered):");
    expect(s).toContain(".overlay {");
    // No second source of truth about mounting.
    expect(s).not.toMatch(/isMounted|isCovered/);
    expect(s).not.toMatch(/if aiConsent\.isGranted \{\s*content\s*\}/);
    // A failed read is its own prompt with a retry.
    expect(s).toContain("AIConsentCopy.checkFailedTitle");
    expect(s).toContain("kind == .retry");
  });

  it("save word reads the account store and handles a consent refusal", () => {
    const s = code("SaveWordSheet.swift");
    expect(s).toContain("aiConsent.isGranted");
    expect(s).toContain(".aiConsentRequired");
    // Busy before the consent read, so a second tap cannot send a second request.
    const body = s.slice(s.indexOf("private func save()"));
    expect(body.indexOf("phase = .saving")).toBeGreaterThan(-1);
    expect(body.indexOf("phase = .saving")).toBeLessThan(body.indexOf("aiConsent.refresh()"));
  });

  const TUTOR_SCREENS: [string, string][] = [
    ["HectorView.swift", ".hector"],
    ["ConversationView.swift", ".conversation"],
    ["CampaignView.swift", ".campaign"],
  ];
  /** The text of every `AssistantReply(` call in a file (up to its closing `savingWord:` argument). */
  const replyCalls = (f: string) =>
    [...code(f).matchAll(/AssistantReply\(([\s\S]*?)savingWord:/g)].map((m) => m[1]);

  it("every AI reply bubble is reportable, from the one place all three screens draw replies", () => {
    const reply = code("AssistantReply.swift");
    expect(reply).toMatch(/\.reportableAIMessage\(\s*turn\.content,\s*enabled: !isOpener,/);
    expect(reply).toContain("surface: surface");
    for (const [file, surface] of TUTOR_SCREENS) {
      const calls = replyCalls(file);
      expect(calls.length, file).toBeGreaterThan(0);
      for (const call of calls) expect(call, file).toContain(`surface: ${surface},`);
    }
    // Nothing else draws an assistant reply around the wrapper.
    for (const f of files.filter((f) => f !== "AssistantReply.swift")) {
      expect(code(f), f).not.toContain("TappableText(text: turn.content");
    }
  });

  it("each reply carries the ids the moderator needs, and the active course", () => {
    expect(code("ConversationView.swift")).toContain("scenarioID: scenario.id");
    const campaign = code("CampaignView.swift");
    expect(campaign).toContain("campaignID: campaign.id");
    expect(campaign).toContain("sceneIndex: sceneIndex");
    const reply = code("AssistantReply.swift");
    expect(reply).toContain("course: course.wireCode");
    expect(reply).not.toMatch(/course: "(en|fr|es)"/);
  });

  it("scripted opening lines are excluded and the model's replies are not", () => {
    expect(code("ConversationView.swift")).toContain(
      "isOpener: conversation.openerIndices.contains(index)",
    );
    expect(code("CampaignView.swift")).toContain(
      "isOpener: conversation.openerIndices.contains(index)",
    );
    // Hector has no scripted opener, so nothing there may be excluded.
    for (const call of replyCalls("HectorView.swift")) expect(call).toContain("isOpener: false");
  });

  it("the tutor screens keep their consent wall", () => {
    for (const [f] of TUTOR_SCREENS) expect(code(f), f).toContain(".aiDisclosureGate()");
  });

  it("the speak fallback names the real cause, from the account store", () => {
    const s = code("SpeakQuestionCard.swift");
    expect(s).toContain("AIConsentCopy.speakFallback(");
    expect(s).toContain("hasAIConsent: hasAIConsent");
    expect(s).toContain("aiConsent.isGranted");
    expect(s).toContain("@EnvironmentObject private var aiConsent: AIConsentStore");
    expect(s).not.toContain("You're offline");
  });
});
