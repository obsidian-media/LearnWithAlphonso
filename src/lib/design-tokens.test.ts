import { describe, expect, it } from "vitest";
import tokens from "../../design/tokens.json";
import { contrastRatio } from "./design-tokens";

/**
 * design/tokens.json is the one source for the design system's values
 * (visual round 6). These checks reproduce the spec page's: the same 18
 * pairs in Royal and Meadow, light and night, 72 checks in all.
 */

type Mode = Record<string, string>;
type Palettes = Record<string, Record<string, Mode>>;
const palettes = tokens.palettes as unknown as Palettes;
const COMBOS = [
  ["royal", "light"],
  ["royal", "night"],
  ["meadow", "light"],
  ["meadow", "night"],
] as const;

describe("design tokens: palettes", () => {
  it("has exactly the two palettes, each with light and night", () => {
    expect(Object.keys(palettes)).toEqual(["royal", "meadow"]);
    for (const p of Object.keys(palettes))
      expect(Object.keys(palettes[p])).toEqual(["light", "night"]);
  });

  it("every palette and mode defines the same names, as six-digit hex", () => {
    const names = Object.keys(palettes.royal.light);
    expect(names.length).toBeGreaterThanOrEqual(40);
    for (const [p, m] of COMBOS) {
      expect(Object.keys(palettes[p][m]), `${p} ${m}`).toEqual(names);
      for (const [n, v] of Object.entries(palettes[p][m]))
        expect(v, `${p}.${m}.${n}`).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it("keeps the spec's anchor values (Royal navy and gold, raspberry heart, Meadow green)", () => {
    expect(palettes.royal.light.brand).toBe("#1D2B64");
    expect(palettes.royal.light.action).toBe("#E6A72A");
    expect(palettes.royal.light.heart).toBe("#D93A63");
    expect(palettes.meadow.light.heart).toBe("#D93A63");
    expect(palettes.royal.light.flame).toBe("#D9700F");
    expect(palettes.meadow.light.brand).toBe("#153C25");
    expect(palettes.meadow.night.choice).toBe("#D9C9A3");
  });
});

describe("design tokens: contrast (the spec page's 72 checks)", () => {
  const pairs = tokens.contrastPairs as [string, string, number][];

  it("lists the spec's 18 pairs", () => {
    expect(pairs).toHaveLength(18);
    expect(pairs.filter(([, , min]) => min === 4.5)).toHaveLength(15);
    expect(pairs.filter(([, , min]) => min === 3)).toHaveLength(3);
  });

  const checks = pairs.flatMap(([fg, bg, min]) =>
    COMBOS.map(([p, m]) => ({
      label: `${fg} on ${bg}, ${p} ${m}`,
      fg: palettes[p][m][fg],
      bg: palettes[p][m][bg],
      min,
    })),
  );

  it("runs 72 checks", () => expect(checks).toHaveLength(72));

  it.each(checks)("$label reaches $min:1", ({ fg, bg, min }) => {
    expect(fg).toBeDefined();
    expect(bg).toBeDefined();
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it("contrastRatio matches WCAG: black on white is 21, a colour on itself is 1", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#1D2B64", "#1D2B64")).toBeCloseTo(1, 5);
  });
});

describe("design tokens: scales", () => {
  it("spacing is the 4 pt scale with s3 and s5 added", () => {
    expect(tokens.space).toEqual({
      s1: 4,
      s2: 8,
      s3: 12,
      s4: 16,
      s5: 20,
      s6: 24,
      s8: 32,
      s12: 48,
      gutter: 16,
      minTouch: 44,
    });
  });
  it("radii: pressables 16, floating 22 to 28, pills full", () => {
    expect(tokens.radius).toEqual({ key: 8, control: 16, bubble: 22, sheet: 28, pill: 999 });
  });
  it("type scale has the ten roles with display and body families only", () => {
    expect(Object.keys(tokens.type)).toEqual([
      "displayXL",
      "display",
      "title",
      "headline",
      "body",
      "footnote",
      "caption",
      "overline",
      "numeralXL",
      "numeral",
    ]);
    for (const [n, t] of Object.entries(tokens.type)) {
      expect(["display", "body"], n).toContain(t.family);
      expect(t.lineHeight, n).toBeGreaterThanOrEqual(t.size);
    }
    expect(tokens.type.numeralXL.tnum).toBe(true);
    expect(tokens.type.numeral.tnum).toBe(true);
  });
  it("the pressable edge is 4 pt (answers, secondary) and 5 pt (primary), leaving a 1 pt sliver when pressed", () => {
    expect(tokens.edge).toEqual({ answer: 4, secondary: 4, primary: 5, pressedSliver: 1 });
  });
  it("motion keeps the spec's durations and curves", () => {
    expect(tokens.motion.duration).toMatchObject({
      press: 70,
      select: 180,
      progress: 450,
      wobble: 300,
      heartLost: 420,
      swap: 200,
      reducedMax: 150,
    });
    expect(tokens.motion.easing.out).toEqual([0.2, 0.8, 0.2, 1]);
    expect(tokens.motion.easing.sheet).toEqual([0.32, 0.72, 0, 1]);
    expect(tokens.motion.spring.press).toEqual({ response: 0.25, damping: 0.7 });
  });
});
