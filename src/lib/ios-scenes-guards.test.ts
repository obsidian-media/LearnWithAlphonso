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

describe("ScreenScene: the reusable scene background", () => {
  const s = read("DesignSystem/ScreenScene.swift");

  it("names the five approved scenes and maps each to its Scene-<name> image set", () => {
    for (const n of ["learn", "hector", "listen", "profile", "complete"]) {
      expect(s, n).toMatch(new RegExp(`case [^\\n]*\\b${n}\\b`));
    }
    expect(s).toContain('"Scene-\\(rawValue)"');
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
    expect(body).toMatch(/colorScheme == \.dark \?/);
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

describe("Learn tab: garden scene, path map, standing Alphonso", () => {
  const browser = read("LessonBrowserView.swift");
  const map = read("LearnPathMap.swift");
  const header = read("StatusHeaderView.swift");

  it("the garden scene (its living clip) sits behind the Learn list, with a scroll probe for parallax", () => {
    expect(browser).toMatch(/\.screenScene\(\s*\.learn,\s*clip: \.learn/);
    // The flat surface no longer paints over the scene: the list's own background is the scene.
    const list = from(browser, "List {");
    expect(list.slice(0, list.indexOf(".task(id:"))).not.toContain(
      ".background(AlphonsoColor.surface)",
    );
    expect(browser).toContain(".sceneScrollProbe()");
  });

  it("the greeting moved from the small banner into Alphonso's speech bubble, text unchanged", () => {
    expect(header).not.toContain("AlphonsoMascotBanner");
    expect(header).toContain("static func greeting(streak: Int) -> String");
    expect(header).toContain(
      `streak > 0 ? "Nice \\(streak)-day streak! Ready for today's lesson?" : "Ready for today's lesson?"`,
    );
    expect(browser).toContain("StatusHeaderView.greeting(streak:");
    expect(map).toContain('.accessibilityLabel("Alphonso: \\(greeting)")');
    // The bubble text sits on a material surface, not straight on the scene.
    const bubble = from(map, "struct PathSpeechBubble");
    expect(bubble).toContain("Text(message)");
    expect(bubble).toContain(".regularMaterial");
  });

  it("nodes are big round 3D icons: 72 pt, the current one 92 pt, with a darker bottom edge", () => {
    expect(map).toMatch(/static let nodeSize: CGFloat = 72/);
    expect(map).toMatch(/static let currentNodeSize: CGFloat = 92/);
    expect(map).toContain('"\\u{1F4DA}"'); // books: done
    expect(map).toContain('"\\u{1F3AF}"'); // bullseye: current
    expect(map).toContain('"\\u{1F512}"'); // lock: locked
    const node = from(map, "struct PathNodeView");
    expect(node).toContain("Icon3DView(");
    // The chunky edge: a darker disc behind the face, pushed down.
    expect(node).toMatch(/Color\.black\.opacity\(0\.\d+\)/);
    expect(node).toMatch(/\.offset\(y: edge\)/);
  });

  it("the current node glows, bounces gently, and is still under Reduce Motion", () => {
    const node = from(map, "struct PathNodeView");
    expect(node).toContain("@Environment(\\.accessibilityReduceMotion)");
    expect(node).toContain("guard state == .next, !reduceMotion else");
    const guardAt = node.indexOf("guard state == .next, !reduceMotion else");
    const loopAt = node.indexOf("repeatForever(autoreverses: true)");
    expect(guardAt).toBeGreaterThan(-1);
    expect(loopAt).toBeGreaterThan(guardAt);
    expect(node).toMatch(/\.shadow\(color: [^\n]*radius: 2\d/); // the soft glow
  });

  it("only the current node is tappable, and it opens the lesson exactly like Up next's Continue", () => {
    expect(map).toContain("onOpen(node.id)");
    expect(map).toContain(', current lesson")');
    expect(map).toContain("minWidth: AlphonsoSpacing.minTouchTarget");
    // The same destination builder serves the list rows, the Up next link and the node.
    expect(browser).toContain("private func lessonDestination(");
    expect(browser).toContain(".navigationDestination(item: $openedLesson)");
    const dest = from(browser, "private func lessonDestination(");
    expect(dest).toContain("LessonPlayerView(lesson: found.lesson");
    expect(dest).toContain("hectorAccess: hectorAccess");
    // Done and locked nodes are not buttons.
    const view = from(map, "struct PathNodeView");
    expect(view).not.toContain("Button");
  });

  it("Alphonso waves in the garden clip beside the current node; the map keeps 170 to 200 pt of room clear for him", () => {
    // The cut-out is gone (ios-clips-guards.test.ts pins the clip and the bubble); the room it took stays.
    expect(map).not.toContain("Figure-alphonso-waving");
    const h = /static let figureHeight: CGFloat = (\d+)/.exec(map);
    expect(h).not.toBeNull();
    expect(Number(h![1])).toBeGreaterThanOrEqual(170);
    expect(Number(h![1])).toBeLessThanOrEqual(200);
    expect(map).toContain("Self.figureHeight");
  });

  it("the stat chips, Up next card and everything below stay, on solid or material surfaces", () => {
    for (const keep of [
      "StatusHeaderView(progress:",
      "LearnCurrentUnitCard(",
      "GoalCardView(",
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
    // The chips are material, not flat surface.
    expect(header).toContain(".regularMaterial");
  });
});
