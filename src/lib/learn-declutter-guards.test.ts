import fs from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Learn tab declutter (design "Learn A"): one hero, one "For you" rail, a level menu on the units header, and on
 * iOS/Android a slim status row whose streak pill still reaches the streak-freeze shop. Web has behaviour tests
 * (learn.test.tsx, ForYouRail.test.tsx); the native screens cannot run here, so their wiring is pinned from source.
 */
const read = (p: string) => fs.readFileSync(p, "utf8");
const IOS = "ios/LearnWithAlphonso/Sources";
const KT =
  "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/learn";

describe("web Learn", () => {
  const learn = read("src/routes/_authenticated/learn.tsx");
  it("mounts the rail and the hero, and no longer stacks the old cards", () => {
    expect(learn).toContain("<ForYouRail");
    expect(learn).toContain("<LearnHero");
    expect(learn).not.toMatch(/<PathCard\b|<WeeklySocialCards\b|<SegmentedControl\b/);
    expect(learn).not.toContain("Review missed items");
  });
  it("the shell's top bar owns the stats: Learn draws no streak or XP pill of its own", () => {
    expect(learn).not.toContain("streakAriaLabel");
    expect(learn).not.toMatch(/🔥|aria-label=\{`\$\{xp\} XP`\}/);
  });
  it("the level picker is a labelled menu on the units header", () => {
    expect(learn).toMatch(/data-learn-units-header[\s\S]*Select CEFR level[\s\S]*<select/);
  });
  it("the rail keeps every card's destination", () => {
    const rail = read("src/components/learn/ForYouRail.tsx");
    for (const to of ['to="/review"', "pathHref", "<TeamMissionCard", "<WeeklyChallengesCard"])
      expect(rail).toContain(to);
    expect(rail).toContain('"/path/build"');
  });
});

describe("iOS Learn", () => {
  const browser = read(`${IOS}/LessonBrowserView.swift`);
  const rail = read(`${IOS}/LearnForYouRail.swift`);
  const status = read(`${IOS}/StatusHeaderView.swift`);
  it("one hero: the stage and the Continue lesson card, no path map, no second Continue", () => {
    expect(browser).toContain("LearnHeroStage(");
    expect(browser).not.toContain("LearnPathMap(");
    expect(read(`${IOS}/LearnFoldViews.swift`)).toContain('Text("Continue lesson")');
  });
  it("one rail replaces the Review row and the stacked path, mission and challenge sections", () => {
    expect(browser).toContain("LearnForYouRail(items: forYouItems)");
    expect(browser).not.toContain('AlphonsoRowCard(\n                        title: "Review"');
    // The sections still exist, but only as the opened card's detail.
    for (const detail of [
      "forYouDetail == .path",
      "forYouDetail == .team",
      "forYouDetail == .weekly",
    ])
      expect(browser).toContain(detail);
    for (const id of ['id: "review"', 'id: "path"', 'id: "team"', 'id: "weekly"'])
      expect(browser).toContain(id);
    expect(browser).toContain("action: { showingReview = true }");
    expect(browser).toContain("if hasNoGoal { showingPathBuild = true }");
  });
  it("every rail card is a button with one spoken label, and says whether it is expanded", () => {
    expect(rail).toContain("Button(action: item.action)");
    expect(rail).toContain(".accessibilityLabel(item.spoken)");
    expect(rail).toContain('"Expanded" : "Collapsed"');
  });
  it("the level picker is a menu on the units header, not a row of capsules", () => {
    expect(browser).toContain("LearnUnitsHeader(selectedLevel: $selectedLevel");
    expect(browser).not.toContain("LevelBandPicker");
    expect(browser).toMatch(/struct LearnUnitsHeader[\s\S]*Menu \{[\s\S]*Picker\("Level"/);
  });
  it("the streak pill still reaches the freeze shop, and keeps its protected wording", () => {
    expect(status).toContain("var onStreakTap: (() -> Void)? = nil");
    expect(status).toContain("StreakDisplay.accessibilityLabel(shown)");
    expect(status).toContain("shown.state == .protected");
    expect(browser).toContain("showingFreezeShop.toggle()");
    expect(browser).toContain(
      "if showingFreezeShop, let progress = syncQueueStore.lastKnownProgress()",
    );
  });
});

describe("Android Learn", () => {
  const screen = read(`${KT}/LearnScreen.kt`);
  it("one hero with a single Continue lesson button", () => {
    expect(screen).toContain('Text("Continue lesson"');
    expect(screen.match(/onClickLabel = "Continue /g)?.length).toBe(1);
  });
  it("one rail replaces the Review row and the stacked path, mission and challenge cards", () => {
    expect(screen).toContain("ForYouRail(cards)");
    expect(screen).not.toContain('item(key = "review")');
    expect(screen).not.toContain('item(key = "team-mission")');
    expect(screen).toContain("{ onOpenReview(state.course) }");
    expect(screen).toContain('if (hasNoGoal) onBuildPath() else toggleForYou("path")');
    for (const detail of ['"path" ->', '"team" ->', '"weekly" ->'])
      expect(screen).toContain(detail);
  });
  it("every rail card is a button with one spoken label and an expanded state", () => {
    const card = screen.slice(screen.indexOf("private fun ForYouRail"));
    expect(card).toContain("clickable(role = Role.Button");
    expect(card).toContain("contentDescription = item.spoken");
    expect(card).toContain('"Expanded" else "Collapsed"');
  });
  it("the level picker is a menu on the units header", () => {
    expect(screen).toContain("private fun UnitsHeader");
    expect(screen).toContain("DropdownMenu(");
    expect(screen).not.toContain("LevelBandPicker");
  });
  it("the streak pill still reaches the freeze shop, with the protected wording", () => {
    expect(screen).toContain("onToggleFreezeShop");
    expect(screen).toMatch(/if \(onBuyStreakFreeze != null && showFreezeShop\)/);
    expect(screen).toContain("StreakDisplay.accessibilityLabel(streak)");
    expect(screen).toContain("Buy freeze ($STREAK_FREEZE_XP_COST XP)");
  });
});
