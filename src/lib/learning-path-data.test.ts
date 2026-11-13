import { describe, expect, it } from "vitest";
import { getCourse } from "@/data/courses";
import { CAMPAIGNS } from "@/data/campaigns";
import { buildLearningPath, type PathData } from "./learning-path-data";

const NOW = new Date("2026-11-11T10:00:00Z");
const units = getCourse("en").curriculum;
const firstLessons = units.flatMap((u) => u.lessons).slice(0, 3);

const data = (over: Partial<PathData> = {}): PathData => ({
  course: "en",
  now: NOW,
  currentLevel: "A1",
  goal: { targetLevel: "A2", targetDate: "2029-06-01", createdAt: "2026-10-01T00:00:00.000Z" },
  completions: [],
  learningDays: [],
  skillDays: [],
  episodes: [
    {
      id: "ep-coffee",
      folder: "a1",
      slug: "ordering-coffee-v2",
      title: "Ordering coffee",
      durationSeconds: 173,
      levelId: "A1",
    },
    {
      id: "ep-hard",
      folder: "c1",
      slug: "why-cant-we-focus-v2",
      title: "Focus",
      durationSeconds: 233,
      levelId: "C1",
    },
  ],
  listen: [],
  calls: [],
  stars: [],
  profile: { showFlag: false, goal: "travel", interests: ["food"], dailyMinutes: 10 },
  ...over,
});

describe("buildLearningPath", () => {
  it("builds a path from nothing but a goal: today has a lesson and the next lesson is the first uncompleted", () => {
    const path = buildLearningPath(data())!;
    expect(path.today.items[0]).toMatchObject({ type: "lesson", id: firstLessons[0].id });
  });

  it("returns null when the goal level is below the learner's level (no plan)", () => {
    expect(buildLearningPath(data({ currentLevel: "B1" }))).toBeNull();
  });

  it("turns a completed lesson into an event for its day, using the day's real lesson seconds", () => {
    const path = buildLearningPath(
      data({
        completions: [{ lessonId: firstLessons[0].id, completedAt: "2026-11-11T08:00:00.000Z" }],
        learningDays: [{ day: "2026-11-11", lessonSeconds: 420, practiceSeconds: 0 }],
      }),
    )!;
    expect(path.today.items[0]).toMatchObject({ state: "done", type: "lesson", minutes: 7 });
    expect(path.today.items.some((i) => i.id === firstLessons[0].id && i.state !== "done")).toBe(
      false,
    );
  });

  it("does not offer a podcast the learner finished, and uses the episode's real duration plus its quiz", () => {
    const fresh = buildLearningPath(data())!;
    const pod = fresh.week.flatMap((d) => d.items).find((i) => i.type === "podcast");
    expect(pod?.id).toBe("ep-coffee");
    expect(pod?.minutes).toBe(Math.ceil(173 / 60) + 2);
    const done = buildLearningPath(
      data({ listen: [{ episodeId: "ep-coffee", completedAt: "2026-11-10T09:00:00.000Z" }] }),
    )!;
    expect(
      done.week.flatMap((d) => d.items).some((i) => i.type === "podcast" && i.state !== "done"),
    ).toBe(false);
    expect(done.streaks.find((s) => s.type === "podcast")?.days).toBe(1);
  });

  it("offers a campaign's next scene without stars, and skips a finished campaign", () => {
    const c = CAMPAIGNS.find((x) => x.id === "city-day")!;
    const stars = (n: number) =>
      c.scenes.slice(0, n).map((s) => ({
        kind: "scene" as const,
        itemKey: `${c.id}/${s.id}`,
        bestStars: 2,
        lastPlayedAt: "2026-11-01T00:00:00.000Z",
      }));
    const half = buildLearningPath(data({ stars: stars(1) }))!;
    const item = half.week
      .flatMap((d) => d.items)
      .find((i) => i.type === "campaign" && i.ref?.id === "city-day");
    expect(item?.ref?.sceneIndex).toBe(1);
    const all = buildLearningPath(data({ stars: stars(c.scenes.length) }))!;
    expect(all.week.flatMap((d) => d.items).some((i) => i.ref?.id === "city-day")).toBe(false);
  });

  it("measures a finished call's minutes from its own start and last reply", () => {
    const path = buildLearningPath(
      data({
        calls: [
          {
            kind: "scenario",
            itemKey: "coffee",
            startedAt: "2026-11-11T07:00:00.000Z",
            lastReplyAt: "2026-11-11T07:05:10.000Z",
            finishedAt: "2026-11-11T07:05:30.000Z",
          },
        ],
      }),
    )!;
    expect(path.today.items.find((i) => i.type === "talk")).toMatchObject({
      state: "done",
      minutes: 5,
    });
  });

  it("reads the learner's switches and trim date from their profile", () => {
    const path = buildLearningPath(
      data({
        profile: {
          showFlag: false,
          goal: "travel",
          interests: [],
          dailyMinutes: 10,
          pathOff: ["podcast"],
        },
      }),
    )!;
    expect(path.off).toEqual(["podcast"]);
    expect(path.mix.find((m) => m.type === "podcast")?.minutes).toBe(0);
  });

  it("labels the goal in plain words", () => {
    expect(buildLearningPath(data())!.goalLabel).toBe("A2 by 1 June");
  });
});
