import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DRAWN_FLAGS } from "./drawn-flags";

/**
 * The converged Profile (identity hero, week strip, achievements preview, navy league card) on the three platforms.
 * These pin what no single platform's tests can: one list of drawn flags, the real Medallion component and DS icons
 * (never the mock's badge PNGs or 3D emoji), a gold bar and ring with no animated fill, and text equivalents.
 */
const root = path.resolve(import.meta.dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");

const KIT = "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/ProfileHero.swift";
const IOS_VIEW = "ios/LearnWithAlphonso/Sources/ProfileOverviewView.swift";
const IOS_HUB = "ios/LearnWithAlphonso/Sources/ProfileHubView.swift";
const CORE =
  "android/LearnWithAlphonso/core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/profile/ProfileOverview.kt";
const AND_UI =
  "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/profile/ProfileOverviewUi.kt";
const AND_HUB =
  "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/profile/ProfileHubScreen.kt";
const WEB = "src/components/profile/ProfileSections.tsx";

const codes = (src: string, open: RegExp) => {
  const body = open.exec(src)?.[1] ?? "";
  return [...body.matchAll(/"([A-Z]{2})"/g)].map((m) => m[1]).sort();
};

describe("one list of drawn flags on every platform", () => {
  it("iOS and Android draw exactly the countries the web draws", () => {
    const web = [...DRAWN_FLAGS].sort();
    expect(codes(read(KIT), /drawnFlags: Set<String> = \[([\s\S]*?)\]/)).toEqual(web);
    expect(codes(read(CORE), /DRAWN_FLAGS: Set<String> = setOf\(([\s\S]*?)\)/)).toEqual(web);
  });

  it("no platform draws the learner's flag from the emoji on Profile", () => {
    expect(read(IOS_VIEW)).not.toContain("flagEmoji");
    expect(read(AND_UI)).not.toMatch(/\.flag\b|m\.flag\?/);
    expect(read(WEB)).not.toContain("flagEmoji");
  });
});

describe("the hero is built from the real components and the design system", () => {
  it("uses the app's own medallion on every platform, never the mock's badge art", () => {
    expect(read(WEB)).toMatch(/<Medallion\s+achievement=/);
    expect(read(IOS_VIEW)).toContain("BadgeMedallion(id:");
    expect(read(AND_UI)).toContain("Medallion(");
    for (const f of [WEB, IOS_VIEW, AND_UI]) {
      const src = read(f);
      expect(src, f).not.toMatch(
        /badge-lessons-100|badge-league-promote|badge-freeze-earn|i3-trophy|i3-fire/,
      );
    }
  });

  it("the four numbers are drawn DS line icons, not 3D emoji", () => {
    const web = read(WEB);
    for (const icon of ["flame", "bolt", "words", "target"])
      expect(web).toContain(`icon="${icon}"`);
    const ios = read(IOS_VIEW);
    for (const icon of [".flameSolid", ".boltSolid", ".words", ".target"])
      expect(ios).toContain(icon);
    const and = read(AND_UI);
    for (const icon of ["ds_flame_solid", "ds_bolt_solid", "ds_words", "ds_target"])
      expect(and).toContain(icon);
  });

  it("the rows are DS-icon cards: Edit your answers, Settings, League, Friends, Invite", () => {
    expect(read(IOS_HUB)).toContain("icon: .target");
    expect(read(IOS_HUB)).toContain("icon: .gift");
    expect(read(AND_HUB)).toContain("R.drawable.ds_target");
    expect(read(AND_HUB)).toContain("R.drawable.ds_gift");
    expect(read(WEB)).toContain('icon="gift"');
  });

  it("the hero, ring and bars fill without an animation (Reduce Motion has nothing to turn off)", () => {
    const iosHero = read(IOS_VIEW).slice(
      read(IOS_VIEW).indexOf("// MARK: Hero"),
      read(IOS_VIEW).indexOf("struct ProfileHeatMapSection"),
    );
    expect(iosHero).not.toMatch(/withAnimation|\.animation\(|\.transition\(/);
    const andHero = read(AND_UI).slice(
      read(AND_UI).indexOf("fun ProfileHero("),
      read(AND_UI).indexOf("A Progress card that shows"),
    );
    expect(andHero).not.toMatch(/animate\w*As|Animatable|animateContentSize/);
    expect(read(WEB)).not.toMatch(/transition-\[width\]|animate-\[/);
  });
});

describe("the hero reads as phrases and reflows", () => {
  it("each stat is one phrase for the screen reader", () => {
    expect(read(IOS_VIEW)).toContain(".accessibilityLabel(spoken)");
    expect(read(AND_UI)).toContain("contentDescription = s.spoken");
    expect(read(WEB)).toContain("aria-label={spoken}");
  });

  it("the level ring and bars have a text equivalent", () => {
    expect(read(IOS_VIEW)).toContain(
      '.accessibilityValue("\\(level.level), \\(level.pct) percent of the level done")',
    );
    expect(read(AND_UI)).toContain(
      'stateDescription = "${level.level}, ${level.pct} percent of the level done"',
    );
    expect(read(WEB)).toContain("data-level-ring");
    expect(read(WEB)).toContain("aria-valuenow={lvl.pct}");
  });

  it("large text turns the 2x2 numbers into one column", () => {
    expect(read(IOS_VIEW)).toContain("dynamicTypeSize.isAccessibilitySize ? 1 : 2");
    expect(read(AND_UI)).toContain("fontScale >= 1.3f");
  });
});

describe("the derived rules match across platforms", () => {
  it("every platform asks the same three questions of the overview", () => {
    for (const n of ["leaguePct", "lessonsLeft", "weekStrip"]) {
      expect(read(KIT), `Kit ${n}`).toContain(`func ${n}`);
      expect(read(CORE), `core ${n}`).toContain(`fun ${n}`);
    }
  });

  it("the hero never states an XP-to-next-level the app does not track", () => {
    for (const f of [WEB, IOS_VIEW, AND_UI])
      expect(read(f), f).not.toMatch(/XP to Level|XP to next level/i);
  });
});
