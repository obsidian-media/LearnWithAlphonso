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
// Files that still read the device mirror of the account consent (the store keeps it in step). Emptied when the
// voice and conversation views read the store directly.
const LEGACY_MIRROR_READERS = ["SpeakQuestionCard.swift"];

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

  it("reads of the old device flag are confined to files not yet reading the store", () => {
    const readers = files
      .filter((f) => code(f).includes("AIDisclosureGate.isAcknowledged("))
      .sort();
    expect(readers).toEqual(LEGACY_MIRROR_READERS);
  });

  it("translation grading offers the opt-in only when the account said no, never for a failed read", () => {
    const s = code("TranslateQuestionCard.swift");
    expect(s).toContain("AIConsentPolicy.offersAIGradingOptIn(on: surface, status: aiConsent.status)");
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
});
