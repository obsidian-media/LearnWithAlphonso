import { beforeEach, describe, expect, it, vi } from "vitest";
import { LEARNER_PROFILE_KEY, parseLearnerProfile } from "@/lib/learner-profile";
import type { PathData } from "@/lib/learning-path-data";

/**
 * The route end to end: PUT set_fix_off writes the learner profile (the REAL saveLearnerProfileFor), the next load
 * reads it back and the REAL buildLearningPath drops the Fix card; a refresher on the path is recorded in the profile.
 * Only the database reads (loadPathData) and the auth admin client are stood in for; the account's metadata is a
 * plain object, written and read the way auth.admin does.
 */
let meta: Record<string, unknown> = {};
const updateUserById = vi.fn(
  async (_id: string, attrs: { user_metadata: Record<string, unknown> }) => {
    meta = attrs.user_metadata;
    return { error: null };
  },
);
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    auth: {
      getUser: async () => ({ data: { user: { id: "u1" } }, error: null }),
      admin: {
        getUserById: async () => ({
          data: { user: { id: "u1", user_metadata: meta } },
          error: null,
        }),
        updateUserById,
      },
    },
  },
}));

const NOW = new Date("2026-11-11T10:00:00Z");
const loadPathData = vi.fn(async (): Promise<PathData> => {
  // The weak-spot rows are fixed; the profile is whatever the account holds right now.
  return {
    course: "en",
    now: NOW,
    currentLevel: "A1",
    goal: { targetLevel: "A2", targetDate: "2027-06-01", createdAt: "2026-10-01T00:00:00.000Z" },
    completions: [{ lessonId: "a1p1l1", completedAt: "2026-10-20T08:00:00.000Z" }],
    learningDays: [],
    skillDays: [],
    episodes: [],
    listen: [],
    videos: [],
    videoWatches: [],
    calls: [],
    stars: [],
    profile: parseLearnerProfile(meta[LEARNER_PROFILE_KEY]),
    weak: {
      reviewDue: [1, 2, 3, 4, 5].map((n) => ({ itemKey: `k${n}`, weaknessLabel: null })),
      weaknessEvents: [3, 4, 5].map((d) => ({
        category: "plurals",
        eventType: "detected",
        createdAt: `2026-11-0${d}T09:00:00.000Z`,
      })),
      mistakes: [],
    },
  };
});
vi.mock("@/lib/learning-path.server", () => ({ loadPathData }));

const { Route } = await import("./learning-path");
const handlers = Route.options.server!.handlers as unknown as {
  GET: (o: { request: Request }) => Promise<Response>;
  PUT: (o: { request: Request }) => Promise<Response>;
};
const headers = { Authorization: "Bearer a.b.c" };
const get = async () =>
  (await (
    await handlers.GET({
      request: new Request("https://x.test/api/learning-path?course=en", { headers }),
    })
  ).json()) as {
    path: { fix: { items: { id: string; title: string }[] } | null; fixOff: boolean };
  };
const put = async (body: unknown) =>
  (await (
    await handlers.PUT({
      request: new Request("https://x.test/api/learning-path", {
        method: "PUT",
        headers,
        body: JSON.stringify(body),
      }),
    })
  ).json()) as { path: { fix: unknown; fixOff: boolean } };
const profile = () => parseLearnerProfile(meta[LEARNER_PROFILE_KEY]);

beforeEach(() => {
  meta = {};
  updateUserById.mockClear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

describe("/api/learning-path: the Fix card switch and the refresher record", () => {
  it("shows the Fix card by default, with both items", async () => {
    const { path } = await get();
    expect(path.fixOff).toBe(false);
    expect(path.fix?.items.map((i) => i.title)).toEqual([
      "5 items due in Review",
      "Refresher: Plurals (A1)",
    ]);
  });

  it("set_fix_off true writes the profile, and the card is gone from that answer and the next load", async () => {
    const off = await put({ course: "en", action: "set_fix_off", off: true });
    expect(profile().pathFixOff).toBe(true);
    expect(off.path.fix).toBeNull();
    expect(off.path.fixOff).toBe(true);
    expect((await get()).path.fix).toBeNull();
  });

  it("set_fix_off false brings it back and clears the stored switch", async () => {
    await put({ course: "en", action: "set_fix_off", off: true });
    const on = await put({ course: "en", action: "set_fix_off", off: false });
    expect(profile().pathFixOff).toBeUndefined();
    expect(on.path.fixOff).toBe(false);
    expect(on.path.fix).not.toBeNull();
  });

  it("a refresher on the path is recorded for today, once, and keeps the switch", async () => {
    await get();
    expect(profile().pathRefresher).toEqual({
      en: { lessonId: "a1p1l1", offeredOn: "2026-11-11" },
    });
    const writes = updateUserById.mock.calls.length;
    await get();
    expect(updateUserById.mock.calls.length).toBe(writes);
  });

  it("with the switch off no refresher is recorded", async () => {
    await put({ course: "en", action: "set_fix_off", off: true });
    updateUserById.mockClear();
    await get();
    expect(profile().pathRefresher).toBeUndefined();
  });

  it("a non-boolean switch value is read as off:false, never as a truthy string", async () => {
    await put({ course: "en", action: "set_fix_off", off: "yes" });
    expect(profile().pathFixOff).toBeUndefined();
  });
});
