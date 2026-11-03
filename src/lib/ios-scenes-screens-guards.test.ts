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
  const finish = between(
    lesson,
    "private struct FinishView: View",
    "private struct GeneratedPracticeSection",
  );
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
    expect(finish).toMatch(
      /Button\("Continue to next lesson", action: onContinueToNextLesson\)\s*\n\s*\.buttonStyle\(\.alphonsoEmber\)/,
    );
    expect(finish).toMatch(
      /Button\("Practise with Hector", action: onPractiseWithHector\)\s*\n\s*\.buttonStyle\(\.alphonsoSecondary\)/,
    );
    expect(finish).toContain("if let onContinueToNextLesson {");
    expect(finish).toContain("if let onPractiseWithHector {");
    expect(finish).toContain(
      "GeneratedPracticeSection(lessonID: lessonID, course: course, session: session)",
    );
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
    expect(finish).toMatch(
      /\.springEntrance\(delay: reduceMotion \? 0 : 0\.15 \+ Double\(index\) \* 0\.12\)/,
    );
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
    const view = between(
      hector,
      "struct HectorView: View",
      "private struct HectorConversationView",
    );
    expect(view).toContain(".screenScene(.hector)");
    expect(view).not.toContain(".background(AlphonsoColor.surface)");
    // The conversation no longer paints a flat surface over the scene.
    const convo = between(hector, "private struct HectorConversationView", "// MARK: - Hero");
    expect(convo).not.toContain(".background(AlphonsoColor.surface)");
  });

  it("the error and save-word hint sit on glass, not straight on the library photo", () => {
    const convo = between(hector, "private struct HectorConversationView", "// MARK: - Hero");
    expect(from(convo, "voice.failure?.userMessage()").slice(0, 400)).toContain(".alphonsoGlass(");
    expect(from(convo, 'Text("Tap any word').slice(0, 400)).toContain(".alphonsoGlass(");
  });

  it("the hero keeps its poses, breathing and cross-fade, drops the flat tile, and puts its title on glass", () => {
    const hero = between(hector, "private var hero: some View", "private func heroPill");
    expect(hero).toContain("MascotArt.assetName(for: HectorStatus.moment(for: status))");
    expect(hero).toContain(".mascotBreathe()");
    expect(hero).not.toContain("AlphonsoTileTone.sky.background");
    expect(hero).not.toContain("AlphonsoColor.surface.opacity(0)");
    const title = from(hero, 'Text("Hector")');
    expect(title.slice(0, 700)).toContain(".alphonsoGlass(");
    expect(hero).toContain(
      'Text(voice.isHandsFreeOn ? "Your tutor · hands-free on" : "Your tutor")',
    );
  });

  it("on the Hector tab the paywall shows Hector waving, about 220 pt, over the library", () => {
    expect(paywall).toContain('SceneFigure(assetName: "Figure-hector-waving", height: 220)');
    expect(paywall).toContain("source == .hectorTab");
    // The figure comes before the title and offer, above them.
    expect(paywall.indexOf("Figure-hector-waving")).toBeLessThan(
      paywall.indexOf("presentation.titleText"),
    );
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

describe("Listen: studio scene, large header, glass folder and episode cards", () => {
  const listen = read("ListenView.swift");
  const listing = between(
    listen,
    "private struct PodcastFolderListing",
    "private func subtitle(for episode",
  );

  it("the studio scene is behind Listen, at the root and in every pushed folder", () => {
    const root = between(listen, "struct ListenView: View", "private func runSearch");
    expect(root).toContain(".screenScene(.listen)");
    expect(root).not.toContain(".background(AlphonsoColor.surface)");
    expect(listing).toContain(".screenScene(.listen)");
    expect(listing).not.toContain(".background(AlphonsoColor.surface)");
    expect(listing).toContain(".sceneScrollProbe()");
  });

  it("loading, offline, error and empty states sit on glass over the studio, not straight on the picture", () => {
    const content = between(
      listen,
      "private var content: some View",
      "private func rememberEpisodes",
    );
    expect(content.split(".alphonsoGlass()").length - 1).toBe(4);
    // The searchable results and the offline list keep their opaque surface.
    expect(listen.split(".background(AlphonsoColor.surface)").length - 1).toBe(3);
  });

  it("a large header opens the list, with its title on glass", () => {
    expect(listen).toContain("private struct ListenSceneHeader: View");
    const header = from(listen, "private struct ListenSceneHeader: View");
    expect(header).toContain("minHeight: 190");
    expect(header).toContain(".alphonsoGlass(");
    expect(listing).toContain('ListenSceneHeader(title: folder?.title ?? "Listen"');
  });

  it("folders and episodes are larger glass cards with the existing 3D icons, same data and same actions", () => {
    const row = from(listen, "private struct ListenGlassRow: View");
    expect(row).toContain("Icon3DView(emoji:");
    expect(row).toContain(".alphonsoGlass(");
    expect(row).toMatch(/minHeight: 7\d/);
    expect(listing).toContain("ListenGlassRow(");
    // Folders still navigate into PodcastFolderListing, episodes still play and mark played.
    expect(listing).toContain("PodcastFolderListing(");
    expect(listing).toContain("player.play(");
    expect(listing).toContain("downloads.markPlayed(episodeID: episode.id)");
    expect(listing).toContain("PodcastDownloadButton(");
    // Titles and subtitles come from the same fields as before.
    expect(listing).toContain("title: child.title");
    expect(listing).toContain('subtitle: child.description ?? "Browse episodes"');
    expect(listing).toContain("title: episode.title");
    expect(listing).toContain("subtitle: subtitle(for: player.resumed(episode))");
  });
});

describe("Profile: hall scene, hero, glass menu cards", () => {
  const profile = read("ProfileHubView.swift");
  const components = read("DesignSystem/AlphonsoComponents.swift");

  it("the hall of achievements is behind Profile, with a hero row at the top", () => {
    expect(profile).toContain(".screenScene(.profile)");
    expect(profile).not.toContain(".background(AlphonsoColor.surface)");
    expect(profile).toContain("ProfileHero()");
    expect(profile).toContain(".sceneScrollProbe()");
    const hero = from(profile, "private struct ProfileHero: View");
    expect(hero).toContain("minHeight: 190");
    expect(hero).toContain(".alphonsoGlass(");
  });

  it("tracks nothing new: the hub still loads no progress, so the hero shows no numbers", () => {
    for (const forbidden of [
      "syncQueueStore",
      "lastKnownProgress",
      "ProgressSyncClient",
      ".task",
      "xp",
      "streak",
    ]) {
      expect(profile, forbidden).not.toContain(forbidden);
    }
  });

  it("the four menu cards are the same four, as glass cards that open the same destinations", () => {
    for (const keep of [
      'title: "League"',
      'title: "Friends"',
      'title: "Achievements"',
      'title: "Settings"',
      "destination = target",
      "LeaderboardView(session: session)",
      "FriendsView(session: session)",
      "SettingsView(session: session)",
    ]) {
      expect(profile, keep).toContain(keep);
    }
    expect(profile.match(/glass: true/g)?.length).toBe(1); // one shared row() builds all four
    const tile = from(components, "struct AlphonsoTile: View");
    expect(tile.slice(0, 1800)).toContain("var glass: Bool = false");
    expect(tile.slice(0, 2600)).toContain("AnyShapeStyle(.regularMaterial)");
    // Glass tiles keep the ink colour; the tone ink is only for the old coloured tiles.
    expect(tile.slice(0, 2600)).toContain("glass ? AlphonsoColor.ink : tone.ink");
  });
});
