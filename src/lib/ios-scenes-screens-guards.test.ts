import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Visual refresh part 2, iPhone: the Lesson complete, Hector, Listen and Profile screens.
// The app target only compiles in CI (ios-app-build), so these read the Swift source.
const SRC = "ios/LearnWithAlphonso/Sources";
const read = (p: string) => readFileSync(`${SRC}/${p}`, "utf8").replace(/\r\n/g, "\n");
/** The source from the first occurrence of `marker` onwards. */
const from = (s: string, marker: string) => {
  const at = s.indexOf(marker);
  expect(at, `missing: ${marker}`).toBeGreaterThan(-1);
  return s.slice(at);
};
/** The source between two markers. */
const between = (s: string, a: string, b: string) => {
  const tail = from(s, a);
  const end = tail.indexOf(b, a.length);
  expect(end, `missing: ${b}`).toBeGreaterThan(-1);
  return tail.slice(0, end);
};

describe("Lesson complete: stage, proud Alphonso, confetti, count-up, haptic", () => {
  const lesson = read("LessonPlayerView.swift");
  const finish = between(lesson, "private struct FinishView: View", "private struct GeneratedPracticeSection");
  const celebration = read("DesignSystem/Celebration.swift");

  it("the stage scene is behind the finish screen and Alphonso stands proud on it", () => {
    expect(finish).toContain(".screenScene(.complete)");
    expect(finish).toContain('SceneFigure(assetName: "Figure-alphonso-proud"');
    // The 180 pt sticker tile is gone from the finish screen.
    expect(finish).not.toContain("MascotTile(moment: .lessonComplete");
    // The spring entrance stays on the figure.
    expect(finish).toMatch(/Figure-alphonso-proud[\s\S]{0,300}\.springEntrance\(\)/);
  });

  it("text sits on a glass card, not straight on the stage", () => {
    expect(finish).toContain(".alphonsoGlass(");
    const glassAt = finish.lastIndexOf(".alphonsoGlass()");
    expect(glassAt).toBeGreaterThan(-1);
    expect(finish.indexOf("LessonFinishCopy.headline")).toBeLessThan(glassAt);
    expect(finish.indexOf("GeneratedPracticeSection(")).toBeLessThan(glassAt);
  });

  it("the three buttons and the practice section behave and read exactly as before", () => {
    expect(finish).toMatch(/Button\("Continue to next lesson", action: onContinueToNextLesson\)\s*\n\s*\.buttonStyle\(\.alphonsoEmber\)/);
    expect(finish).toMatch(/Button\("Practise with Hector", action: onPractiseWithHector\)\s*\n\s*\.buttonStyle\(\.alphonsoSecondary\)/);
    expect(finish).toContain("if let onContinueToNextLesson {");
    expect(finish).toContain("if let onPractiseWithHector {");
    expect(finish).toContain("GeneratedPracticeSection(lessonID: lessonID, course: course, session: session)");
    expect(lesson).toContain('Text("Generate more practice")');
  });

  it("confetti is a Canvas burst with no package, and nothing at all under Reduce Motion", () => {
    expect(celebration).toContain("struct ConfettiBurst: View");
    expect(celebration).toContain("Canvas {");
    expect(celebration).toContain("TimelineView(.animation)");
    const burst = from(celebration, "struct ConfettiBurst");
    expect(burst).toContain("@Environment(\\.accessibilityReduceMotion)");
    expect(burst).toMatch(/if reduceMotion \|\| finished \{\s*\n\s*Color\.clear/);
    expect(burst).toContain(".allowsHitTesting(false)");
    expect(burst).toContain(".accessibilityHidden(true)");
    expect(finish).toContain("ConfettiBurst()");
  });

  it("XP and streak count up from 0 over about 0.8 s; accuracy and Reduce Motion show the final value", () => {
    expect(celebration).toContain("struct CountingText: View, Animatable");
    expect(celebration).toMatch(/static let duration: Double = 0\.8/);
    const chip = from(lesson, "private struct LessonRewardChipView");
    expect(chip).toContain("CountingText(");
    expect(chip).toContain("RewardCountUp.duration");
    expect(chip).toMatch(/reduceMotion \|\| reached \? split\.number : 0/);
    // Only the XP and streak chips count; accuracy is shown as it is.
    expect(chip).toMatch(/chip\.kind != \.accuracy/);
    expect(chip).toContain('.accessibilityLabel("\\(title): \\(chip.value)")');
  });

  it("the chips pop in one after another, and all at once under Reduce Motion", () => {
    expect(finish).toContain("@Environment(\\.accessibilityReduceMotion)");
    expect(finish).toMatch(/\.springEntrance\(delay: reduceMotion \? 0 : 0\.15 \+ Double\(index\) \* 0\.12\)/);
  });

  it("a success haptic fires once on appear, and is kept under Reduce Motion", () => {
    expect(finish).toContain(".sensoryFeedback(.success, trigger: celebrated)");
    expect(finish).toMatch(/\.onAppear \{[\s\S]{0,200}celebrated = true/);
    // The haptic is not behind the reduceMotion check.
    const onAppear = between(finish, ".onAppear {", ".fullScreenCover");
    expect(onAppear).not.toContain("reduceMotion");
  });
});

describe("Hector: the library scene behind the tab, the hero and the paywall", () => {
  const hector = read("HectorView.swift");
  const paywall = read("PaywallView.swift");

  it("the library scene is behind Hector's tab (paywall and conversation alike)", () => {
    const view = between(hector, "struct HectorView: View", "private struct HectorConversationView");
    expect(view).toContain(".screenScene(.hector)");
    expect(view).not.toContain(".background(AlphonsoColor.surface)");
    // The conversation no longer paints a flat surface over the scene.
    const convo = between(hector, "private struct HectorConversationView", "// MARK: - Hero");
    expect(convo).not.toContain(".background(AlphonsoColor.surface)");
  });

  it("the hero keeps its poses, breathing and cross-fade, drops the flat tile, and puts its title on glass", () => {
    const hero = between(hector, "private var hero: some View", "private func heroPill");
    expect(hero).toContain("MascotArt.assetName(for: HectorStatus.moment(for: status))");
    expect(hero).toContain(".mascotBreathe()");
    expect(hero).not.toContain("AlphonsoTileTone.sky.background");
    expect(hero).not.toContain("AlphonsoColor.surface.opacity(0)");
    const title = from(hero, 'Text("Hector")');
    expect(title.slice(0, 700)).toContain(".alphonsoGlass(");
    expect(hero).toContain('Text(voice.isHandsFreeOn ? "Your tutor · hands-free on" : "Your tutor")');
  });

  it("on the Hector tab the paywall shows Hector waving, about 220 pt, over the library", () => {
    expect(paywall).toContain('SceneFigure(assetName: "Figure-hector-waving", height: 220)');
    expect(paywall).toContain("source == .hectorTab");
    // The figure comes before the title and offer, above them.
    expect(paywall.indexOf("Figure-hector-waving")).toBeLessThan(paywall.indexOf("presentation.titleText"));
    // Everything the learner reads sits on glass when the library is behind it.
    expect(paywall).toContain(".alphonsoGlass(if: onScene)");
    // Other presentations (sheets from lesson complete or a refusal) keep the flat surface.
    expect(paywall).toContain(".background(onScene ? Color.clear : AlphonsoColor.surface)");
  });

  it("paywall copy, legal text, buttons and purchase logic are untouched", () => {
    for (const keep of [
      "presentation.titleText",
      "PaywallCopy.mascotMessage",
      "AlphonsoMascotBanner(mascot: .hector",
      "PaywallCopy.featureBlurb",
      "presentation.renewalDisclosure",
      "presentation.priceLine",
      "presentation.trialLine",
      "font(presentation.priceStyle)",
      "font(presentation.trialStyle)",
      "font(presentation.disclosureStyle)",
      "PaywallCopy.restore",
      "PaywallCopy.manage",
      "PaywallCopy.termsOfUse",
      "PaywallCopy.privacyPolicy",
      "PaywallCopy.appleEULA",
      "PaywallLinks.appleStandardEULA",
      "await entitlementStore.purchase()",
      "await entitlementStore.restorePurchases()",
      "entitlementStore.select(productID: option.id)",
      "entitlementStore.presented(from: source)",
      "await entitlementStore.loadOffering()",
      ".buttonStyle(.alphonsoEmber)",
      "legalLinks",
    ]) {
      expect(paywall, keep).toContain(keep);
    }
    // The disclosure and price/trial text are not moved off the Kit's styles.
    expect(paywall).toContain("private func font(_ style: PaywallTextStyle) -> Font");
  });
});
