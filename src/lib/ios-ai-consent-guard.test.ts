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

  it("translation grading asks the account consent through the policy", () => {
    const s = code("TranslateQuestionCard.swift");
    expect(s).toContain("AIConsentPolicy.translateMode(");
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
  });

  it("the gate never unmounts a screen that has been shown, and never calls an unreadable setting 'off'", () => {
    const s = code("AIDisclosureSheet.swift");
    // Mounted once granted, then kept mounted; the prompt is an overlay.
    expect(s).toContain("hasBeenGranted");
    expect(s).toContain(".overlay {");
    expect(s).not.toMatch(/if aiConsent\.isGranted \{\s*content\s*\}/);
    // A failed read is its own state with a retry.
    expect(s).toContain("AIConsentCopy.checkFailedTitle");
    expect(s).toContain("aiConsent.status == .unavailable");
  });

  it("save word reads the account store and handles a consent refusal", () => {
    const s = code("SaveWordSheet.swift");
    expect(s).toContain("aiConsent.isGranted");
    expect(s).toContain(".aiConsentRequired");
  });
});
