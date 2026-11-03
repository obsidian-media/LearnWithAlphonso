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

  it("reads scroll position through a preference so the host screen does not re-render per frame", () => {
    expect(s).toContain("struct SceneScrollKey: PreferenceKey");
    expect(s).toContain("struct SceneScrollProbe: View");
    expect(s).toContain("backgroundPreferenceValue(SceneScrollKey.self)");
    expect(s).toContain("func screenScene(_ scene: SceneName)");
    expect(s).toContain("func sceneScrollProbe()");
  });

  it("offers a glass (material) surface for text over a scene", () => {
    expect(s).toContain("func alphonsoGlass(");
    expect(s).toMatch(/\.regularMaterial/);
  });
});
