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
  it("mounts the rail and the climbing map (which replaced the hero), and no longer stacks the old cards", () => {
    expect(learn).toContain("<ForYouRail");
    // Path B (PARITY-SPEC-6): the climbing map replaces Learn A's Continue hero; both never show.
    expect(learn).toContain("<LearnMap");
    expect(learn).not.toContain("<LearnHero");
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
  it("one map: the climbing map replaces the hero, no path map, one Continue lesson button in its sheet", () => {
    expect(browser).toContain("LearnClimbMap(");
    expect(browser).not.toContain("LearnHeroStage(");
    expect(browser).not.toContain("LearnPathMap(");
    const climb = read(`${IOS}/LearnClimbMap.swift`);
    expect(climb).toContain('"Continue lesson"');
    expect(climb).toContain('"Start lesson"');
    expect(climb.match(/Text\(ctaLabel\)/g)?.length).toBe(1);
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
    expect(browser).toContain("case .none: showingPathBuild = true");
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
    const card = screen.slice(screen.indexOf("fun ForYouRail"));
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
  it("the hero is one piece: the lesson line and the CTA sit inside the same Box as the scene, not below it", () => {
    const hero = screen.slice(
      screen.indexOf("fun CurrentUnitCard"),
      screen.indexOf("private fun greeting("),
    );
    expect(hero.indexOf(`Text("Continue lesson"`)).toBeGreaterThan(hero.indexOf("alphonso?.let"));
    expect(hero).not.toContain("Column(verticalArrangement");
    expect(hero).not.toContain("semantics(mergeDescendants");
  });
});

describe("iOS map is one unit on its own night hill", () => {
  it("the map gets the greeting, the course-wide Continue lesson and the open-lesson callback", () => {
    const browser = read(`${IOS}/LessonBrowserView.swift`);
    expect(browser).toMatch(
      /LearnClimbMap\(\s*climb: climb,\s*greeting: StatusHeaderView\.greeting[\s\S]*?continueLessonID: courseContinueLessonID,\s*onOpenLesson:/,
    );
    expect(read(`${IOS}/LearnFoldViews.swift`)).not.toContain("LessonArt.room");
  });
});

describe("review follow-ups", () => {
  it("iOS and Android: the streak pill shows a chevron, the Weekly card a claim dot, the path reloads after the planner", () => {
    const status = read(`${IOS}/StatusHeaderView.swift`);
    expect(status).toContain("trailingChevron");
    const browser = read(`${IOS}/LessonBrowserView.swift`);
    expect(browser).toContain("showsDot: claimReady");
    expect(browser).toMatch(
      /\.sheet\(isPresented: \$showingPathBuild, onDismiss:[\s\S]*railPath\?\.load\(\)/,
    );
    const screen = read(`${KT}/LearnScreen.kt`);
    expect(screen).toContain("showsDot = claimReady");
    expect(screen).toContain("LocalDensity.current.fontScale");
    expect(read(`${IOS}/LearnForYouRail.swift`)).toContain("@ScaledMetric");
  });
  it("web: only the nested card suppresses retry-on-mount, so the rail retries a failed load on return", () => {
    expect(read("src/lib/use-team-mission.ts")).toContain("nested ? { retryOnMount: false }");
    expect(read("src/components/learn/ForYouRail.tsx")).toContain("<TeamMissionCard nested />");
  });
});

describe("Learn does not scroll its own hero out of view", () => {
  it("Android: the only animateScrollToItem is the Jump to current button", () => {
    const screen = read(`${KT}/LearnScreen.kt`);
    expect(screen.match(/animateScrollToItem/g)?.length).toBe(1);
    expect(screen).not.toContain("var scrolled by remember");
  });
  it("iOS: no first-show scroll to the next lesson (the status row and hero are the top)", () => {
    const browser = read(`${IOS}/LessonBrowserView.swift`);
    expect(browser).not.toContain("hasScrolledToContinue");
    expect(browser).not.toContain("scrollProxy.scrollTo(newValue");
  });
});

describe("the hero's unit count is per level on every platform", () => {
  it("web, iOS and Android all count the units of the unit's own level", () => {
    // Web: the climbing map's strip counts the units of the level on screen (learn.test.tsx renders "Unit 1 of N").
    const learn = read("src/routes/_authenticated/learn.tsx");
    expect(learn).toContain("curriculum.filter((u) => u.level === level)");
    expect(learn).toContain("learnMap(mapUnits, completedSet)");
    expect(read(`${IOS}/LessonBrowserView.swift`)).toContain("filter { $0.level == unit.level }");
    expect(read(`${KT}/LearnScreen.kt`)).toContain("filter { it.level == u.level }");
  });
});

describe("the hero's room is the unit's mapped room on iOS and Android", () => {
  it("unit u1 (Everyday Basics) maps to one room, and iOS and Android read the same table", async () => {
    const { UNIT_ROOMS } = await import("../data/unit-rooms");
    const room = UNIT_ROOMS.u1;
    expect(room).toBeTruthy();
    // iOS and Android bundle the same table, so unit 1 is the same room on all three.
    for (const path of [
      "ios/LearnWithAlphonso/Resources/unit-rooms.json",
      "android/LearnWithAlphonso/app/src/main/assets/content/unit-rooms.json",
    ])
      expect(JSON.parse(read(path)).units.u1, path).toBe(room);
    // The web hero and its room are gone: the climbing map draws its own night-hill scene (PARITY-SPEC-6). iOS and
    // Android keep their room heroes until their maps land.
    expect(read(`${IOS}/LessonBrowserView.swift`)).toContain(
      "LessonData.roomMap?.roomID(forUnit: unit.id)",
    );
    expect(read(`${KT}/LearnScreen.kt`)).toContain("unitRooms[u.id]");
  });
});
