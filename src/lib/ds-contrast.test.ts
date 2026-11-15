import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// WCAG contrast of the token pairs that put text or an icon on a coloured fill. White on the night `choice` (#8EA2F5,
// about 2.4:1) and a light icon on the night `wrongInk` (#FFB4A6) failed this; `onChoice` and the wrong fill's own
// `onWrong` are the pairs that pass. Meadow is light-only (owner decision), so only Royal light, Royal night and
// Meadow light are checked.
type Palette = Record<string, string>;
const tokens = JSON.parse(readFileSync("design/tokens.json", "utf8")).palettes as Record<
  string,
  Record<string, Palette>
>;

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

const SETS: [string, Palette][] = [
  ["royal light", tokens.royal!.light!],
  ["royal night", tokens.royal!.night!],
  ["meadow light", tokens.meadow!.light!],
];

describe("contrast helper", () => {
  it("knows the extremes and the failure this fixes", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrast("#FFFFFF", "#8EA2F5")).toBeLessThan(3);
    expect(contrast("#FFB4A6", "#FFFFFF")).toBeLessThan(2);
  });
});

describe.each(SETS)("%s: content on a coloured fill", (_name, p) => {
  it("onChoice on choice is text-legible (4.5:1)", () => {
    expect(contrast(p.onChoice!, p.choice!)).toBeGreaterThanOrEqual(4.5);
  });
  it("onWrong on wrong is text-legible (4.5:1), which is what the recording mic icon uses", () => {
    expect(contrast(p.onWrong!, p.wrong!)).toBeGreaterThanOrEqual(4.5);
  });
  it("onAction on action stays legible (the mini bar's gold play)", () => {
    expect(contrast(p.onAction!, p.action!)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the screens use those pairs", () => {
  const read = (f: string) => readFileSync(`ios/LearnWithAlphonso/Sources/${f}`, "utf8");
  it("the user bubble and the hold-to-talk buttons never put a fixed-light colour on choice or a wrongInk fill", () => {
    const hector = read("HectorView.swift");
    expect(hector).toContain("foregroundStyle(AlphonsoDS.current.onChoice)");
    expect(hector).toContain("recordingColor: AlphonsoDS.current.wrong,");
    expect(hector).toContain("recordingIconColor: AlphonsoDS.current.onWrong");
    const speak = read("SpeakQuestionCard.swift");
    expect(speak).toContain("iconColor: ds.onChoice");
    expect(speak).toContain("recordingColor: ds.wrong,");
    expect(speak).not.toContain("recordingColor: ds.wrongInk");
  });
});
