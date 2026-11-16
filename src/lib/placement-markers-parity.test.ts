import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Placement band chips: "not passed" (asked, missed) and "not reached" (never asked) must not look the same on any
// platform. The web struck the missed chip through and set the unreached one in the fainter ink; iOS and Android drew
// both identically (OPEN-ITEMS 60). The apps cannot be run from here, so these read the three sources.
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const web = read("src/routes/_authenticated/placement.tsx");
const ios = read("ios/LearnWithAlphonso/Sources/PlacementView.swift");
const android = read(
  "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/placement/PlacementScreen.kt",
);

/** The line that builds one state's look, so each assertion reads one chip. */
const line = (src: string, needle: string) => {
  const found = src.split("\n").filter((l) => l.includes(needle));
  expect(found, needle).toHaveLength(1);
  return found[0]!;
};

describe("placement band chips: missed and not reached differ on every platform", () => {
  it("web: missed is struck through, not reached is the fainter ink", () => {
    const missed = line(web, 'missed: "border-ds-line');
    const upcoming = line(web, 'upcoming: "border-ds-line');
    expect(missed).toContain("line-through");
    expect(missed).toContain("text-ds-ink-soft");
    expect(upcoming).not.toContain("line-through");
    expect(upcoming).toContain("text-ds-ink-faint");
  });

  it("iOS: missed is struck through in inkSoft, not reached is inkFaint with no strike", () => {
    const missed = line(ios, 'words: "not passed"');
    const upcoming = line(ios, 'words: "not reached"');
    expect(missed).toContain("text: ds.inkSoft");
    expect(missed).toContain("struckThrough: true");
    expect(upcoming).toContain("text: ds.inkFaint");
    expect(upcoming).not.toContain("struckThrough");
    // The strike is actually drawn from the look, on the chip's own text.
    expect(ios).toMatch(/Text\(marker\.level\)\s*\.strikethrough\(look\.struckThrough\)/);
  });

  it("Android: missed is struck through in inkSoft, not reached is inkFaint with no strike", () => {
    const missed = line(android, 'MarkerLook("not passed"');
    const upcoming = line(android, 'MarkerLook("not reached"');
    expect(missed).toContain("ds.inkSoft");
    expect(missed).toContain("struckThrough = true");
    expect(upcoming).toContain("ds.inkFaint");
    expect(upcoming).not.toContain("struckThrough");
    expect(android).toContain("TextDecoration.LineThrough");
    expect(android).toMatch(/if \(look\.struckThrough\) CaptionType\.copy\(/);
  });

  it("each chip still reads its state aloud, so the difference is not only visual", () => {
    expect(ios).toContain('.accessibilityLabel("\\(marker.level), \\(look.words)")');
    expect(android).toContain('contentDescription = "${m.level}, ${look.words}"');
  });
});
