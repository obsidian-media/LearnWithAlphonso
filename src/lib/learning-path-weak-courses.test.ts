import { describe, expect, it, vi } from "vitest";
import { getCourse, type Course } from "@/data/courses";

vi.mock("@/lib/rehearsals-flag", () => ({ rehearsalsEnabled: () => false }));

const { loadPathData } = await import("./learning-path.server");
const { buildLearningPath } = await import("./learning-path-data");

const NOW = new Date("2026-11-11T10:00:00Z");
type Row = Record<string, unknown>;

/** A tiny in-memory database: `.eq` filters really apply, so a missing course filter lets other courses' rows through. */
function fakeAdmin(tables: Record<string, Row[]>) {
  const from = (t: string) => {
    const filters: [string, unknown][] = [];
    const rows = () => (tables[t] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
    const q: Record<string, unknown> = {};
    for (const m of ["select", "gte", "lte", "not", "order", "limit"]) q[m] = () => q;
    q.eq = (c: string, v: unknown) => {
      filters.push([c, v]);
      return q;
    };
    q.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null });
    q.then = (ok: (v: unknown) => unknown) => ok({ data: rows(), error: null });
    return q;
  };
  return {
    from,
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: { id: "u1", user_metadata: {} } }, error: null }),
      },
    },
  } as never;
}

const detected = (course: string, category: string) =>
  [1, 2, 3].map((d) => ({
    user_id: "u1",
    course,
    category,
    event_type: "detected",
    created_at: `2026-11-0${d}T09:00:00.000Z`,
  }));

async function pathFor(course: Course, events: Row[]) {
  const data = await loadPathData(fakeAdmin({ weakness_events: events }), "u1", course, NOW);
  const done = getCourse(course).curriculum.flatMap((u) =>
    u.lessons.map((l) => ({ lessonId: l.id, completedAt: "2026-01-01T08:00:00.000Z" })),
  );
  return { data, path: buildLearningPath({ ...data, completions: done })! };
}
const refreshers = (p: NonNullable<Awaited<ReturnType<typeof pathFor>>["path"]>) =>
  (p.fix?.items ?? []).filter((i) => i.title.startsWith("Refresher"));

describe("the path reads weakness_events for its own course", () => {
  it("an FR learner's FR events make a weak spot and a refresher", async () => {
    const { data, path } = await pathFor("fr", detected("fr", "gender-agreement"));
    expect(data.weak!.weaknessEvents).toHaveLength(3);
    expect(refreshers(path)).toHaveLength(1);
  });

  it("an ES learner's ES events make a weak spot and a refresher", async () => {
    const { path } = await pathFor("es", detected("es", "ser-estar"));
    expect(refreshers(path)).toHaveLength(1);
  });

  it("English events never reach a French path", async () => {
    const { data, path } = await pathFor("fr", detected("en", "prepositions"));
    expect(data.weak!.weaknessEvents).toEqual([]);
    expect(refreshers(path)).toHaveLength(0);
  });

  it("French events never reach an English path", async () => {
    const { data, path } = await pathFor("en", detected("fr", "prepositions"));
    expect(data.weak!.weaknessEvents).toEqual([]);
    expect(refreshers(path)).toHaveLength(0);
  });

  it("English events still make an English weak spot", async () => {
    const { path } = await pathFor("en", detected("en", "plurals"));
    expect(refreshers(path)).toHaveLength(1);
  });
});
