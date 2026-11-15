import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { countRawValues } from "./raw-design-values";

// The redesigned streak widget (round 13). The iOS extension and the Glance widget only compile in CI, so these read
// the sources; each assertion names the property it protects. The pure logic (caption, layout, look, snapshot) has
// its own Kit and core tests.
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const IOS = "ios/LearnWithAlphonso";
const ANDROID = "android/LearnWithAlphonso/app/src/main";
const iosView = read(`${IOS}/LearnWithAlphonsoWidget/StreakWidgetView.swift`);
const iosFonts = read(`${IOS}/LearnWithAlphonsoWidget/WidgetDesignSystem.swift`);
const publisher = read(`${IOS}/Sources/WidgetProgressPublisher.swift`);
const theme = read(`${IOS}/Sources/DesignSystem/AlphonsoTheme.swift`);
const project = read(`${IOS}/project.yml`);
const widgetPlist = read(`${IOS}/LearnWithAlphonsoWidget/Info.plist`);
const androidWidget = read(`${ANDROID}/java/com/obsidianmedia/learnwithalphonso/widget/StreakWidget.kt`);
const container = read(`${ANDROID}/java/com/obsidianmedia/learnwithalphonso/AppContainer.kt`);

describe("the widget draws with design system tokens only", () => {
  it("the iOS view has no raw colour, font size or system colour", () => {
    expect(countRawValues("ios", iosView)).toBe(0);
    expect(iosView).toContain("AlphonsoDS.colors(look.palette, night: look.night)");
    for (const system of [".systemBackground", "Color(.system", ".secondary", ".green", ".foregroundStyle(.primary"]) {
      expect(iosView, system).not.toContain(system);
    }
  });

  it("the Android widget has no raw colour or font size and reads the tokens", () => {
    expect(countRawValues("android", androidWidget)).toBe(0);
    expect(androidWidget).toContain("AlphonsoTokens.royalLight");
    expect(androidWidget).toContain("AlphonsoTokens.royalNight");
    expect(androidWidget).toContain("AlphonsoTokens.meadowLight");
  });

  it("the iOS extension compiles the generated token file and bundles the two fonts the roles use", () => {
    const widget = project.slice(project.indexOf("  LearnWithAlphonsoWidget:\n"));
    expect(widget).toContain("path: Sources/DesignSystem/AlphonsoDS.generated.swift");
    expect(widget).toContain("path: Sources/Fonts/BricolageGrotesque-Variable.ttf");
    expect(widget).toContain("path: Sources/Fonts/Figtree-Variable.ttf");
    expect(widgetPlist).toContain("<string>BricolageGrotesque-Variable.ttf</string>");
    expect(widgetPlist).toContain("<string>Figtree-Variable.ttf</string>");
    // The fonts the generated roles name must be the ones registered.
    expect(readFileSync(`${IOS}/Sources/DesignSystem/AlphonsoDS.generated.swift`, "utf8")).toContain("BricolageGrotesque-96ptExtraBold");
    expect(iosFonts).toContain("style.role.postScriptName");
  });
});

describe("the look follows the theme, and Meadow ignores dark mode", () => {
  it("the iOS view resolves its look through the Kit rule, with the device appearance", () => {
    expect(iosView).toContain("StreakWidgetLook.resolve(theme: entry.snapshot?.theme, deviceDark: colorScheme == .dark)");
  });

  it("Android hands the system a day and a night colour from the same rule, so Meadow's two halves match", () => {
    expect(androidWidget).toContain("resolveStreakWidgetLook(theme, systemDark = false)");
    expect(androidWidget).toContain("resolveStreakWidgetLook(theme, systemDark = true)");
  });
});

describe("the theme reaches the widget", () => {
  it("iOS writes the theme with every snapshot and rewrites it when the learner changes theme", () => {
    expect(publisher).toContain("theme: AlphonsoThemeManager.shared.themeID.rawValue");
    expect(publisher).toContain("static func themeChanged(to theme: String)");
    expect(publisher).toContain("stored.withTheme(theme)");
    expect(publisher).toContain("WidgetCenter.shared.reloadTimelines(ofKind: WidgetSharing.streakWidgetKind)");
    // setTheme is the one place the theme changes (a server value goes through it too).
    const setTheme = theme.slice(theme.indexOf("public func setTheme("));
    expect(setTheme.slice(0, setTheme.indexOf("\n    }\n"))).toContain("WidgetProgressPublisher.themeChanged(to: id.rawValue)");
  });

  it("Android writes the theme with every snapshot and redraws the widget when the theme changes", () => {
    expect(container).toContain("WidgetPublisher.publish(app, it, themeManager.theme.value.raw)");
    expect(container).toContain("themeManager.theme.drop(1).collect { WidgetPublisher.republishTheme(app, it.raw) }");
    expect(androidWidget).toContain("StreakWidget().updateAll(context)");
  });
});

describe("one copy on both platforms", () => {
  it("neither platform keeps its own words", () => {
    expect(iosView).not.toMatch(/Text\("[A-Za-z]/);
    expect(androidWidget).not.toMatch(/Text\(\s*"[A-Za-z]/);
    expect(androidWidget).not.toContain("day streak");
    expect(androidWidget).not.toContain("Open Learn with Alphonso");
  });
});

describe("the two pictures stay small enough for a widget", () => {
  const files: [string, number][] = [
    [`${IOS}/LearnWithAlphonsoWidget/Assets.xcassets/AlphonsoStreakFlame.imageset/alphonso-streak-flame@3x.png`, 160_000],
    [`${IOS}/LearnWithAlphonsoWidget/Assets.xcassets/AlphonsoStreakFlame.imageset/alphonso-streak-flame@2x.png`, 90_000],
    [`${IOS}/LearnWithAlphonsoWidget/Assets.xcassets/Fire.imageset/fire@3x.png`, 50_000],
    [`${ANDROID}/res/drawable-nodpi/widget_alphonso_streak_flame.webp`, 60_000],
    [`${ANDROID}/res/drawable-nodpi/widget_fire.png`, 20_000],
  ];
  it.each(files)("%s is under %i bytes (a widget process has a few MB)", (file, max) => {
    expect(statSync(file).size).toBeLessThan(max);
  });
});
