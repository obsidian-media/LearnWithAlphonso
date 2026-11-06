import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { countRawValues, findViolations, loadBaseline, scanPlatform } from "./raw-design-values";

/**
 * iOS: screens use design tokens, never raw values (the spec's "No raw values"). Scans every .swift file under
 * ios/LearnWithAlphonso/Sources except DesignSystem/ (where the token files live) for raw colours (Color(hex:),
 * Color(red:), UIColor(red:), ...) and raw font sizes (.system(size: 14), Font.custom(, a number passed to
 * AlphonsoFont.display/sans, UIFont.systemFont(ofSize: 14)). design/baselines/ios.json holds today's count per
 * file; a count may only go down. A file that uses AlphonsoDS must have none.
 */
const root = path.resolve(import.meta.dirname, "../..");

describe("iOS: no raw design values", () => {
  it("no Swift file has more raw colours or font sizes than its baseline, and AlphonsoDS files have none", () => {
    expect(findViolations(root, "ios", loadBaseline(root, "ios"))).toEqual([]);
  });

  it("the baseline itself only goes down: never above the 404 raw values it started with (2026-11-06)", () => {
    const total = Object.values(loadBaseline(root, "ios")).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(404);
  });

  it("counts what the spec bans", () => {
    expect(countRawValues("ios", ".background(Color(hex: 0xFBF6EC))")).toBe(1);
    expect(countRawValues("ios", "Color(red: 0.1, green: 0.2, blue: 0.3)")).toBe(1);
    expect(countRawValues("ios", ".font(.system(size: 14, weight: .bold))")).toBe(1);
    expect(countRawValues("ios", ".font(AlphonsoFont.display(21, weight: .semiBold))")).toBe(1);
    expect(countRawValues("ios", 'Font.custom("Figtree", size: 16)')).toBe(1);
    expect(
      countRawValues(
        "ios",
        ".font(AlphonsoDS.font(AlphonsoDS.Typography.title)).foregroundStyle(ds.ink)",
      ),
    ).toBe(0);
    expect(countRawValues("ios", ".font(AlphonsoFont.display(size, weight: .bold))")).toBe(0);
  });
});

describe("iOS guard proves it can fail", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ds-guard-ios-"));
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const plant = (rel: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
    fs.writeFileSync(path.join(tmp, rel), text);
  };

  it("a planted Color(hex: 0x123456) in a screen with no baseline goes red", () => {
    plant(
      "ios/LearnWithAlphonso/Sources/PlantedView.swift",
      'Text("x").foregroundStyle(Color(hex: 0x123456))',
    );
    expect(findViolations(tmp, "ios", {})).toEqual([
      "ios/LearnWithAlphonso/Sources/PlantedView.swift: 1 raw value(s), baseline allows 0",
    ]);
  });

  it("the token folder is exempt", () => {
    plant(
      "ios/LearnWithAlphonso/Sources/DesignSystem/Tokens.swift",
      "let x = Color(hex: 0x123456)",
    );
    expect(Object.keys(scanPlatform(tmp, "ios"))).toEqual([
      "ios/LearnWithAlphonso/Sources/PlantedView.swift",
    ]);
  });

  it("a view that uses AlphonsoDS goes red even when a baseline lists it", () => {
    plant(
      "ios/LearnWithAlphonso/Sources/NewCard.swift",
      'Text("x").foregroundStyle(ds.ink).font(.system(size: 13))\n// AlphonsoDS.Space.s4',
    );
    expect(
      findViolations(tmp, "ios", {
        "ios/LearnWithAlphonso/Sources/PlantedView.swift": 1,
        "ios/LearnWithAlphonso/Sources/NewCard.swift": 9,
      }),
    ).toEqual([
      "ios/LearnWithAlphonso/Sources/NewCard.swift: 1 raw value(s) in a design-system file, which must have none",
    ]);
  });
});
