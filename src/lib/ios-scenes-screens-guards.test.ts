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

// Lesson complete (count-up, haptic, buttons) is guarded in ios-lesson-room-guards.test.ts since visual round 6.

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

  it("the header keeps its poses, on the navy hero gradient with the uncropped cut-out and a status pill", () => {
    const classic = between(hector, "private var classicScreen", "private var callScreen");
    expect(classic).toContain("MascotArt.assetName(for: HectorStatus.moment(for: status))");
    const parts = read("HectorParts.swift");
    const hero = from(parts, "struct HectorHeader");
    expect(hero).toContain("LinearGradient(colors: [ds.heroA, ds.heroB]");
    expect(hero).toContain(".scaledToFit()");
    expect(hero).toContain('"Hector"');
    expect(hero).toContain(String.raw`"Your \(courseName) tutor`);
    expect(hero).toContain(String.raw`Hector is \(`);
  });

  it("the paywall opens on Hector's room, above the headline and the offer", () => {
    expect(paywall).toContain("PaywallRoomTop(");
    expect(paywall.indexOf("PaywallRoomTop(")).toBeLessThan(paywall.indexOf("PaywallHeadline()"));
    expect(paywall.indexOf("PaywallHeadline()")).toBeLessThan(
      paywall.indexOf("offer(presentation"),
    );
    expect(paywall).toContain(".background(ds.surface.ignoresSafeArea())");
  });

  it("paywall copy, legal text, buttons and purchase logic are untouched", () => {
    for (const keep of [
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
      "entitlementStore.select(productID: $0)",
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

describe("Listen: studio scene, and the empty, offline and failed states as design-system cards", () => {
  const listen = read("ListenView.swift");
  const shelf = read("ListenShelfViews.swift");

  it("the studio scene is behind Listen at the root, and the shelf and folder paint none of their own", () => {
    const root = between(listen, "struct ListenView: View", "private func runSearch");
    expect(root).toContain(".screenScene(.listen)");
    expect(root).not.toContain(".background(AlphonsoColor.surface)");
    expect(shelf).not.toContain(".screenScene(");
  });

  it("loading sits on glass over the studio; offline, error and empty are the design-system empty-state card", () => {
    const content = between(
      listen,
      "private var content: some View",
      "private func rememberEpisodes",
    );
    // Only the loading spinner is glass now; the three states below are cards of their own (DSEmptyState).
    expect(content.split(".alphonsoGlass()").length - 1).toBe(1);
    expect(content.split("DSEmptyState(").length - 1).toBe(3);
    expect(content).not.toContain("ContentUnavailableView");
    // Each of the three keeps its one action: try again, try again, refresh.
    expect(content.split("{ Task { await load() } }").length - 1).toBe(3);
    // The searchable results and the offline list keep their opaque surface, now the design-system one.
    expect(listen.split(".background(ds.surface)").length - 1).toBe(3);
  });

  it("the shelf's failed and empty cards keep their action: Try again reloads the episodes", () => {
    const root = between(shelf, "struct ListenShelfRoot: View", "struct WatchShelfHost");
    expect(root).toContain("DSEmptyState(");
    expect(root).toContain('actionTitle: "Try again") { Task { await load() } }');
  });

  it("the older folder listing, its large header and its glass rows are gone: nothing called them", () => {
    for (const dead of ["PodcastFolderListing", "ListenSceneHeader", "ListenGlassRow"]) {
      expect(listen, dead).not.toContain(dead);
      expect(shelf, dead).not.toContain(dead);
    }
  });

  it("the folder is the room header, one gold Continue button and the episode rows, same data and same actions", () => {
    const detail = from(shelf, "struct ListenShelfDetail: View");
    expect(detail).toContain(".buttonStyle(.dsButton(.primary))");
    expect(detail).toContain("player.play(");
    expect(detail).toContain("downloads.markPlayed(episodeID: episode.id)");
    expect(detail).toContain("PodcastDownloadButton(");
    expect(detail).toContain("PodcastQuizRowButton(");
  });
});

describe("Profile: hall scene, hero, glass menu cards", () => {
  const profile = read("ProfileHubView.swift");
  const components = read("DesignSystem/AlphonsoComponents.swift");

  it("the hall of achievements is behind Profile, with the overview hero at the top", () => {
    expect(profile).toContain(".screenScene(.profile)");
    expect(profile).not.toContain(".background(AlphonsoColor.surface)");
    expect(profile).toContain("ProfileHeroSection(");
    expect(profile).toContain(".sceneScrollProbe()");
    expect(read("ProfileOverviewView.swift")).toContain("struct ProfileHeroSection: View");
  });

  it("loads the overview only through the own-row Kit read, never the offline queue or cached progress", () => {
    for (const forbidden of ["syncQueueStore.", "lastKnownProgress"]) {
      expect(profile, forbidden).not.toContain(forbidden);
    }
    expect(profile).toContain("fetchProfileOverview");
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
      "SettingsView(session: session", // the Pro row passes the entitlement store as a second argument
    ]) {
      expect(profile, keep).toContain(keep);
    }
    expect(profile.match(/glass: true/g)?.length).toBe(1); // one shared row() builds all four
    const tile = from(components, "struct AlphonsoTile: View");
    expect(tile.slice(0, 1800)).toContain("var glass: Bool = false");
    expect(tile.slice(0, 2600)).toContain("AnyShapeStyle(.regularMaterial)");
    // Glass tiles keep the ink colour; the tone ink is only for the old coloured tiles.
    // A word boundary after each ink: `AlphonsoColor.inkSoft` or `tone.inkSoft` must not pass for `.ink`.
    expect(tile.slice(0, 2600)).toMatch(/glass \? AlphonsoColor\.ink\b : tone\.ink\b/);
  });
});
