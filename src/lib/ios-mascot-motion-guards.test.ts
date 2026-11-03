import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The app target only compiles in CI (ios-app-build), so these read the Swift source.
const SRC = "ios/LearnWithAlphonso/Sources";
const read = (p: string) => readFileSync(`${SRC}/${p}`, "utf8");

describe("iPhone mascot motion", () => {
  it("MascotBreathe is static under Reduce Motion, like PulsingGlow", () => {
    const s = read("DesignSystem/MascotTile.swift");
    expect(s).toContain("struct MascotBreathe: ViewModifier");
    expect(s).toContain("@Environment(\\.accessibilityReduceMotion)");
    const body = s.slice(s.indexOf("struct MascotBreathe"));
    const guardAt = body.indexOf("guard !reduceMotion else { return }");
    const loopAt = body.indexOf("repeatForever(autoreverses: true)");
    expect(guardAt).toBeGreaterThan(-1);
    expect(loopAt).toBeGreaterThan(guardAt);
    expect(s).toContain("func mascotBreathe()");
  });

  it("MascotTile shows the moment's pose on a tile, breathing, cross-fading on a pose change", () => {
    const s = read("DesignSystem/MascotTile.swift");
    expect(s).toContain("struct MascotTile: View");
    expect(s).toContain("MascotArt.assetName(for: moment)");
    expect(s).toContain("tone.background");
    expect(s).toContain(".mascotBreathe()");
    expect(s).toMatch(/\.id\(art\)\s*\n\s*\.transition\(\.opacity\)/);
    expect(s).toMatch(
      /\.animation\(reduceMotion \? nil : \.easeInOut\(duration: 0\.2\), value: art\)/,
    );
    expect(s).toContain(".aspectRatio(contentMode: .fit)");
  });

  it("every small mascot goes through MascotTile", () => {
    const lesson = read("LessonPlayerView.swift");
    expect(lesson).toContain("MascotTile(moment: .emptyState");
    expect(lesson).toContain("MascotTile(moment: .lessonComplete");
    expect(read("ListenView.swift")).toContain("MascotTile(moment: .emptyState");
    expect(read("DesignSystem/AlphonsoComponents.swift")).toContain("MascotTile(moment: moment ??");
    for (const f of [
      "LessonPlayerView.swift",
      "ListenView.swift",
      "DesignSystem/AlphonsoComponents.swift",
    ]) {
      expect(read(f), f).not.toMatch(
        /Image\(MascotArt\.assetName\(for: \.(emptyState|lessonComplete)\)\)/,
      );
    }
  });

  it("Hector's header breathes and cross-fades between listening, thinking and talking", () => {
    const s = read("HectorView.swift");
    const hero = s.slice(s.indexOf("private var hero: some View"));
    expect(hero).toMatch(/Image\(art\)[\s\S]{0,400}\.mascotBreathe\(\)/);
    expect(hero).toMatch(/\.id\(art\)\s*\n\s*\.transition\(\.opacity\)/);
    expect(hero).toContain("value: art)");
  });

  it("the mascot banner maps a plain mascot to its everyday moment, as on the web", () => {
    const s = read("DesignSystem/AlphonsoComponents.swift");
    expect(s).toMatch(/case \.alphonso: return \.learnGreeting/);
    expect(s).toMatch(/case \.hector: return \.hectorIdle/);
  });
});
