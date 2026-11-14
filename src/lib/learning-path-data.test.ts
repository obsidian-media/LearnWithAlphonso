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
  videos: [],
  videoWatches: [],
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
            stars: 1,
          },
        ],
      }),
    )!;
    expect(path.today.items.find((i) => i.type === "talk")).toMatchObject({
      state: "done",
      minutes: 5,
    });
  });

  it("a finished call with no star is not a talk done (owner decision 2026-11-14)", () => {
    const call = {
      kind: "scenario" as const,
      itemKey: "coffee",
      startedAt: "2026-11-11T07:00:00.000Z",
      lastReplyAt: "2026-11-11T07:00:20.000Z",
      finishedAt: "2026-11-11T07:00:30.000Z",
    };
    const none = buildLearningPath(data({ calls: [{ ...call, stars: 0 }] }))!;
    expect(none.today.items.some((i) => i.type === "talk" && i.state === "done")).toBe(false);
    const one = buildLearningPath(data({ calls: [{ ...call, stars: 1 }] }))!;
    expect(one.today.items.some((i) => i.type === "talk" && i.state === "done")).toBe(true);
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

  describe("the learner's own calendar day (owner decision 2026-11-12)", () => {
    // NOW is Wednesday 10:00 UTC. In Kiritimati (UTC+14) it is already Thursday 2026-11-12 00:00.
    it("today is the learner's day: east of UTC it is already tomorrow", () => {
      const utc = buildLearningPath(data())!;
      const east = buildLearningPath(data({ timeZone: "Pacific/Kiritimati" }))!;
      expect(utc.today.day).toBe("2026-11-11");
      expect(east.today.day).toBe("2026-11-12");
      expect(east.asOf).toBe(utc.asOf);
    });
    it("west of UTC it is still yesterday", () => {
      const west = buildLearningPath(data({ timeZone: "Pacific/Pago_Pago" }))!; // UTC-11
      expect(west.today.day).toBe("2026-11-10");
    });
    it("no zone, or one that does not exist, is UTC", () => {
      expect(buildLearningPath(data({ timeZone: null }))!.today.day).toBe("2026-11-11");
      expect(buildLearningPath(data({ timeZone: "Not/AZone" }))!.today.day).toBe("2026-11-11");
    });
    it("a lesson finished at 23:30 UTC counts on the learner's day, not UTC's", () => {
      // 2026-11-10T23:30Z is Wednesday the 11th at 09:30 in Brisbane (UTC+10): the learner's day, and today there.
      const path = buildLearningPath(
        data({
          timeZone: "Australia/Brisbane",
          completions: [{ lessonId: firstLessons[0].id, completedAt: "2026-11-10T23:30:00.000Z" }],
        }),
      )!;
      expect(path.today.day).toBe("2026-11-11");
      expect(
        path.week.find((d) => d.day === "2026-11-11")!.items.some((i) => i.state === "done"),
      ).toBe(true);
    });
  });

  it("labels the goal in plain words", () => {
    expect(buildLearningPath(data())!.goalLabel).toBe("A2 by 1 June");
  });
});

describe("buildLearningPath: Alphonso videos", () => {
  const vid = (id: string, over: Partial<PathData["videos"][number]> = {}) => ({
    id,
    title: `Video ${id}`,
    durationSeconds: 49,
    levelId: "A1",
    tags: ["travel", "food", "ordering"],
    ...over,
  });
  const videoItems = (path: NonNullable<ReturnType<typeof buildLearningPath>>) =>
    path.week.flatMap((d) => d.items).filter((i) => i.type === "video");

  it("puts an unwatched video on the path with a video ref, a minute count rounded up and the title from the data", () => {
    const path = buildLearningPath(data({ videos: [vid("v1")] }))!;
    const items = videoItems(path);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "v1",
      title: "Video v1",
      minutes: 1,
      ref: { kind: "video", id: "v1" },
    });
  });

  it("leaves a completed video off the path and counts it as done activity", () => {
    const path = buildLearningPath(
      data({
        videos: [vid("v1")],
        videoWatches: [{ videoId: "v1", completedAt: "2026-11-11T08:00:00.000Z" }],
      }),
    )!;
    expect(videoItems(path).filter((i) => i.state !== "done")).toHaveLength(0);
    expect(path.mix.find((m) => m.type === "video")?.minutes).toBe(0);
    expect(path.streaks.find((s) => s.type === "video")?.days).toBe(1);
  });

  it("an unfinished watch (no completed_at) does not hide the video", () => {
    const path = buildLearningPath(
      data({ videos: [vid("v1")], videoWatches: [{ videoId: "v1", completedAt: null }] }),
    )!;
    expect(videoItems(path)).toHaveLength(1);
  });

  it("skips a video above the learner's level or with no usable level", () => {
    const path = buildLearningPath(
      data({ videos: [vid("hard", { levelId: "C1" }), vid("none", { levelId: null })] }),
    )!;
    expect(videoItems(path)).toHaveLength(0);
  });
});
