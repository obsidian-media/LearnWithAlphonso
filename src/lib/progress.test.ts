import { beforeEach, describe, expect, it } from "vitest";
import { MAX_HEARTS } from "./hearts";
import { todayStr, useProgress } from "./progress";

beforeEach(() => {
  useProgress.getState().reset();
  useProgress.setState({ course: "en" });
});

describe("todayStr", () => {
  it("returns today's date as YYYY-MM-DD", () => {
    expect(todayStr()).toBe(new Date().toISOString().slice(0, 10));
  });
});

describe("useProgress store", () => {
  it("starts with the default state", () => {
    const s = useProgress.getState();
    expect(s.xp).toBe(0);
    expect(s.hearts).toBe(5);
    expect(s.course).toBe("en");
    expect(s.hydrated).toBe(true); // set by reset() in beforeEach
  });

  it("setCourse switches the active course", () => {
    useProgress.getState().setCourse("fr");
    expect(useProgress.getState().course).toBe("fr");
  });

  it("setLoading toggles the loading flag", () => {
    useProgress.getState().setLoading(true);
    expect(useProgress.getState().loading).toBe(true);
  });

  it("setCefrLevelLocal updates the cefr level", () => {
    useProgress.getState().setCefrLevelLocal("B2");
    expect(useProgress.getState().cefrLevel).toBe("B2");
  });

  it("setPlacementLocal stores the placement result", () => {
    useProgress.getState().setPlacementLocal({
      cefrLevel: "B1",
      placementLevel: "B1",
      placementScore: 12,
      placementTakenAt: "2026-01-01",
    });
    const s = useProgress.getState();
    expect(s.cefrLevel).toBe("B1");
    expect(s.placementLevel).toBe("B1");
    expect(s.placementScore).toBe(12);
    expect(s.placementTakenAt).toBe("2026-01-01");
  });

  it("applyCompletion patches xp/streak/hearts/etc in one call", () => {
    useProgress.getState().applyCompletion({
      xp: 50,
      streak: 1,
      longestStreak: 1,
      hearts: 4,
      streakFreezes: 0,
      leagueTier: "bronze",
      lastActiveDate: "2026-01-01",
      completedLessons: ["l1"],
      activityDates: ["2026-01-01"],
      answersByLesson: {},
      unlockedAchievements: [],
    });
    const s = useProgress.getState();
    expect(s.xp).toBe(50);
    expect(s.completedLessons).toEqual(["l1"]);
  });

  it("hydrate merges input over the initial defaults and marks hydrated", () => {
    useProgress.getState().hydrate({ xp: 42, streak: 3 });
    const s = useProgress.getState();
    expect(s.xp).toBe(42);
    expect(s.streak).toBe(3);
    expect(s.hydrated).toBe(true);
    expect(s.loading).toBe(false);
  });

  it("loseHeartLocal decrements hearts and floors at 0", () => {
    useProgress.setState({ hearts: 1 });
    useProgress.getState().loseHeartLocal();
    expect(useProgress.getState().hearts).toBe(0);
    useProgress.getState().loseHeartLocal();
    expect(useProgress.getState().hearts).toBe(0);
  });

  it("loseHeartLocal sets a refill timer once hearts hit 0", () => {
    useProgress.setState({ hearts: 1, heartsRefillAt: null });
    useProgress.getState().loseHeartLocal();
    expect(useProgress.getState().heartsRefillAt).not.toBeNull();
  });

  it("restoreHeartsLocal resets to MAX_HEARTS and clears the timer", () => {
    useProgress.setState({ hearts: 0, heartsRefillAt: Date.now() });
    useProgress.getState().restoreHeartsLocal();
    expect(useProgress.getState().hearts).toBe(MAX_HEARTS);
    expect(useProgress.getState().heartsRefillAt).toBeNull();
  });

  it("gainHeartsLocal adds hearts but caps at MAX_HEARTS", () => {
    useProgress.setState({ hearts: MAX_HEARTS - 1 });
    useProgress.getState().gainHeartsLocal(5);
    expect(useProgress.getState().hearts).toBe(MAX_HEARTS);
  });

  it("spendXpForHeartLocal buys a heart and deducts xp, floored at 0", () => {
    useProgress.setState({ hearts: 2, xp: 10 });
    useProgress.getState().spendXpForHeartLocal(50);
    const s = useProgress.getState();
    expect(s.hearts).toBe(3);
    expect(s.xp).toBe(0);
  });

  it("reset restores initial values and marks hydrated", () => {
    useProgress.setState({ xp: 999, course: "fr" });
    useProgress.getState().reset();
    const s = useProgress.getState();
    expect(s.xp).toBe(0);
    expect(s.hydrated).toBe(true);
  });

  it("reset also restores the active course", () => {
    // Regression test: `course` lives outside the `initial` object (it
    // can't be part of it -- hydrate() also spreads `...initial` and must
    // NOT reset course there), so reset() has to restore it explicitly.
    // A prior version of reset() omitted this, and zustand's shallow-merge
    // `set()` silently left a switched-to course in place after "reset".
    useProgress.getState().setCourse("fr");
    useProgress.getState().reset();
    expect(useProgress.getState().course).toBe("en");
  });
});
