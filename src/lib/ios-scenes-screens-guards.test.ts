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
    expect(listing).toContain(".screenScene(.listen, if: showsScene)");
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
    expect(tile.slice(0, 2600)).toContain("glass ? AlphonsoColor.ink : tone.ink");
  });
});
