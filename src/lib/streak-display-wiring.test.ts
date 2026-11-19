import fs from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Every place the learner's own streak is shown reads it through the one shared rule (shownStreak on the web,
 * StreakDisplay on Android), never the raw `streak` column: after missed days the column still holds the old run.
 * The rule itself is tested in streak-display.test.ts and the Android core's StreakDisplayTest.
 */
const read = (p: string) => fs.readFileSync(p, "utf8");
const KT = "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso";

describe("the shown streak is used wherever the learner's streak appears", () => {
  it("web: the top bar and the Learn pill use useShownStreak, with the protected mark", () => {
    const shell = read("src/components/AppShell.tsx");
    expect(shell).toMatch(/const shown = useShownStreak\(\)/);
    expect(shell).toMatch(/shown\.state === "protected"/);
    const learn = read("src/routes/_authenticated/learn.tsx");
    expect(learn).toMatch(/useShownStreak\(\)/);
    expect(learn).not.toMatch(/useProgress\(\(s\) => s\.streak\)/);
  });

  it("web: the profile tile shows the protected caption from bigNumbers' state", () => {
    expect(read("src/components/profile/ProfileSections.tsx")).toMatch(
      /n\.streakState === "protected"[\s\S]{0,40}STREAK_PROTECTED_CAPTION/,
    );
    expect(read("src/lib/profile.functions.ts")).toMatch(/last_active_date,day_basis/);
  });

  it("Android: the Learn header, the profile tile and the widget read StreakDisplay", () => {
    const learn = read(`${KT}/ui/learn/LearnScreen.kt`);
    expect(learn).toMatch(/StreakDisplay\.shown\(progress, /);
    expect(learn).not.toMatch(/"\$\{progress\.streak\}"/);
    expect(read(`${KT}/ui/profile/ProfileOverviewUi.kt`)).toMatch(
      /StreakDisplay\.PROTECTED_CAPTION/,
    );
    const widget = read(`${KT}/widget/StreakWidget.kt`);
    expect(widget).toMatch(/\?\.asOf\(System\.currentTimeMillis\(\)\)/);
    expect(widget).toMatch(
      /streakFreezes = progress\.streakFreezes, dayBasis = progress\.dayBasis/,
    );
  });
});
