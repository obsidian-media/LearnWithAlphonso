import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source-text guards for iPhone behaviour that only runs on a device (CI compiles it, nothing runs it).
const read = (f: string) => readFileSync(`ios/LearnWithAlphonso/Sources/${f}`, "utf8");

describe("iPhone visual polish", () => {
  it("Hector opened from lesson complete has a Done button", () => {
    const hector = read("HectorView.swift");
    expect(hector).toMatch(/var onClose: \(\(\) -> Void\)\? = nil/);
    expect(hector).toMatch(/Button\("Done", action: onClose\)/);
    const player = read("LessonPlayerView.swift");
    expect(player).toMatch(/HectorView\([\s\S]{0,300}onClose: \{ showingHector = false \}/);
  });

  it("Practice drops to one column at accessibility text sizes", () => {
    const practice = read("PracticeHubView.swift");
    expect(practice).toMatch(/dynamicTypeSize\.isAccessibilitySize/);
  });

  it("mascot art goes through the app-side check that the image exists", () => {
    for (const f of [
      "HectorView.swift",
      "LessonPlayerView.swift",
      "ListenView.swift",
      "DesignSystem/AlphonsoComponents.swift",
    ]) {
      expect(read(f), f).not.toMatch(/MascotPoseCatalog\.art\([^)]*\)\.assetName/);
    }
    expect(read("DesignSystem/MascotArt.swift")).toMatch(/UIImage\(named: posed\) != nil/);
  });
});
