import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Visual refresh part 2 (scenes, standing characters, path map, celebration), iPhone half.
// The app target only compiles in CI (ios-app-build), so these read the Swift source.
const SRC = "ios/LearnWithAlphonso/Sources";
const read = (p: string) => readFileSync(`${SRC}/${p}`, "utf8");
/** The source from the first occurrence of `marker` onwards. */
const from = (s: string, marker: string) => {
  const at = s.indexOf(marker);
  expect(at, `missing: ${marker}`).toBeGreaterThan(-1);
  return s.slice(at);
};

/** The source between the first `a` and the next `b` after it. */
const between = (s: string, a: string, b: string) => {
  const i = s.indexOf(a);
  expect(i, `missing: ${a}`).toBeGreaterThan(-1);
  const j = s.indexOf(b, i + a.length);
  expect(j, `missing: ${b}`).toBeGreaterThan(-1);
  return s.slice(i, j);
};

describe("ScreenScene: the reusable scene background", () => {
  const s = read("DesignSystem/ScreenScene.swift");

  it("names the five approved scenes and maps each to its Scene-<name> image set", () => {
    for (const n of ["learn", "hector", "listen", "profile", "complete"]) {
      expect(s, n).toMatch(new RegExp(`case [^\\n]*\\b${n}\\b`));
    }
    // The name is picked by the Kit's ScreenSceneArt: Scene-<name> by day, SceneNight-<name> in Royal night.
    expect(s).toContain("ScreenSceneArt.assetName(scene: rawValue, night: night)");
    expect(
      readFileSync(
        "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/ScreenSceneArt.swift",
        "utf8",
      ),
    ).toContain('"Scene-\\(scene)"');
  });

  it("is full-bleed, ignores safe areas and is hidden from VoiceOver and touches", () => {
    const body = from(s, "struct ScreenScene: View");
    expect(body).toContain(".scaledToFill()");
    expect(body).toContain(".ignoresSafeArea()");
    expect(body).toContain(".accessibilityHidden(true)");
    expect(body).toContain(".allowsHitTesting(false)");
  });

  it("puts a scrim from the top over the image, stronger in dark mode, tracking the theme surface", () => {
    const body = from(s, "struct ScreenScene: View");
    expect(body).toContain("LinearGradient");
    expect(body).toContain("AlphonsoColor.surface.opacity(");
    expect(body).toContain("@Environment(\\.colorScheme)");
    // Night is the device's dark setting for Royal only: Meadow stays light, so it never takes the night scrim.
    expect(body).toMatch(/usesNight\(deviceDark: colorScheme == \.dark\)/);
    expect(body).toMatch(
      /opacity\(showsNightPicture \? Self\.nightScrim\.top : night \? 0\.88 : 0\.6\)/,
    );
    // The gradient starts at the top edge.
    expect(body).toMatch(/startPoint: \.top/);
  });

  it("parallax moves the image at half the scroll speed and is static under Reduce Motion", () => {
    const body = from(s, "struct ScreenScene: View");
    expect(body).toContain("@Environment(\\.accessibilityReduceMotion)");
    expect(body).toMatch(/static let parallaxFactor: CGFloat = 0\.5/);
    expect(body).toMatch(/reduceMotion \? 0 : /);
    expect(body).toContain("parallaxFactor");
    // The offset is clamped, so the image never slides off its overscan and shows a gap.
    expect(body).toMatch(/min\(max\(/);
    // No overscan scale under Reduce Motion either: nothing moves, so nothing needs the slack.
    expect(body).toMatch(/\.scaleEffect\(reduceMotion \? 1 : /);
  });

  it("keeps the scroll position in a modifier's own state so the host screen does not re-render per frame", () => {
    // Build 55: the preference was replaced, because a List row's preference can report a stale position
    // after the row is recycled (Learn's greeting bubble came back). ios-build55-guards pins the details.
    expect(s).toContain("struct SceneScrollHost: ViewModifier");
    expect(s).toContain("struct SceneScrollProbe: View");
    expect(s).toContain("modifier(SceneScrollHost(");
    expect(s).toContain("func screenScene(_ scene: SceneName)");
    expect(s).toContain("func sceneScrollProbe()");
  });

  it("offers a glass (material) surface for text over a scene", () => {
    expect(s).toContain("func alphonsoGlass(");
    expect(s).toMatch(/\.regularMaterial/);
  });
});

describe("Learn tab: garden scene, one hero, standing Alphonso", () => {
  const browser = read("LessonBrowserView.swift");
  const map = read("LearnClimbMap.swift");
  const header = read("StatusHeaderView.swift");

  it("Learn sits on the flat surface; the climbing map brings its own night hill (no full-screen clip, no scroll probe)", () => {
    expect(browser).not.toMatch(/\.screenScene\(/);
    expect(browser).not.toContain(".sceneScrollProbe()");
    expect(browser).toContain(".background(ds.surface)");
    expect(map).toContain("LinearGradient(colors: [ds.heroA, ds.heroB]");
    // The map replaces the old hero: it is mounted, the hero stage is not.
    expect(browser).toContain("LearnClimbMap(");
    expect(browser).not.toContain("LearnHeroStage(");
  });

  it("the greeting moved from the small banner into Alphonso's speech bubble, text unchanged", () => {
    expect(header).not.toContain("AlphonsoMascotBanner");
    expect(header).toContain("static func greeting(streak: Int) -> String");
    expect(header).toContain(
      `streak > 0 ? "Nice \\(streak)-day streak! Ready for today's lesson?" : "Ready for today's lesson?"`,
    );
    expect(browser).toContain("StatusHeaderView.greeting(streak:");
    expect(map).toContain('.accessibilityLabel("Alphonso: \\(greeting)")');
    // The bubble text sits on the surface colour, not straight on the scene.
    const bubble = between(map, "private var greetingBubble", "private func alphonso(");
    expect(bubble).toContain("Text(greeting)");
    expect(bubble).toContain(".background(ds.surface");
  });

  it("the map's start sheet has one gold lesson button, wired to open the lesson through openedLesson", () => {
    expect(browser).toContain("onOpenLesson: { openedLesson = OpenedLesson(id: $0) }");
    const sheet = from(map, "private struct ClimbStartSheet");
    expect(sheet).toContain("Text(ctaLabel)");
    expect(sheet).toContain("ds.actionEdge");
    // Built from the shared model, level-scoped, never from its own rules.
    expect(browser).toContain("LearnMap.climb(units: units, completed: completedLessonIDs");
  });

  it("the Continue lesson card opens the lesson through the same destination builder as the list rows", () => {
    expect(browser).toContain("private func lessonDestination(");
    expect(browser).toContain(".navigationDestination(item: $openedLesson)");
    const dest = from(browser, "private func lessonDestination(");
    expect(dest).toContain("LessonPlayerView(lesson: found.lesson");
    expect(dest).toContain("hectorAccess: hectorAccess");
    // The map opens lessons through the one callback; it holds no navigation of its own.
    expect(map).not.toContain("NavigationLink");
    expect(map).toContain("onOpenLesson(");
  });

  it("Alphonso stands at the trailhead, bottom right, as decoration with his greeting readable", () => {
    expect(map).not.toContain("Figure-alphonso-waving");
    const stand = between(map, "private func alphonso(", "/// The next lesson's gold face");
    expect(stand).toContain("LessonArt.expression(.happy)");
    expect(stand).toContain(".accessibilityHidden(true)");
    expect(map).toContain("alignment: .bottomTrailing");
  });

  it("the stat chips, Up next card and everything below stay, on solid or material surfaces", () => {
    for (const keep of [
      "StatusHeaderView(progress:",
      "LearnClimbMap(",
      "LearnForYouRail(",
      "PathCardSection(",
      "TeamMissionSection(",
      "WeeklyChallengesSection(",
      "PlacementBannerSection(",
      'title: "Review"',
      "DeadLetterNoticeSection(",
    ]) {
      expect(browser, keep).toContain(keep);
    }
    // Section headers were bare ember text on the list background; over a scene they sit on glass.
    expect(from(browser, "unit.eyebrow").slice(0, 1600)).toContain(".alphonsoGlass(");
    // The chips are the design system's card colour (nearly opaque, with the floating elevation), never the bare
    // list background, so the numbers stay legible over the garden.
    expect(header).toContain("Capsule().fill(ds.card");
    expect(header).toContain("AlphonsoDS.Elevation.floating");
  });
});
