import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chainable, type ChainCall } from "@/lib/__testutils__/supabase-mock";

const getUser = vi.fn();
const from = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { auth: { getUser }, from },
}));

const { Route } = await import("./learning-goal");
const { lessonsByLevel } = await import("@/lib/learning-goal.server");
const handlers = Route.options.server!.handlers as unknown as Record<
  "GET" | "PUT" | "DELETE",
  (opts: { request: Request }) => Promise<Response>
>;

const URL_BASE = "https://example.com/api/learning-goal";
function req(method: string, query = "", body?: unknown, authorization = "Bearer token-123") {
  return new Request(`${URL_BASE}${query}`, {
    method,
    headers: {
      ...(authorization ? { Authorization: authorization } : {}),
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

let chains: ChainCall[][] = [];
/** Queue the table reads/writes in the order the route makes them. */
function queue(...results: unknown[]) {
  from.mockReset();
  chains = results.map(() => []);
  results.forEach((r, i) => from.mockReturnValueOnce(chainable(r, chains[i])));
}
const LEVEL = (level: string | null) => ({
  data: level ? { cefr_level: level } : null,
  error: null,
});
const DONE = (rows: { lesson_id: string; completed_at: string }[]) => ({ data: rows, error: null });
const GOAL = (level: string, createdAt: string) => ({
  data: { target_level: level, target_date: "2026-12-01", created_at: createdAt },
  error: null,
});
const NO_GOAL = { data: null, error: null };
/** How PostgREST really formats a timestamptz. */
const PG_TS = "2026-09-01T00:00:00.123456+00:00";
const DB_ERROR = { data: null, error: { message: "boom" } };

const NOW = new Date("2026-10-06T12:00:00Z");
const FUTURE = "2026-12-01";
const body = { course: "en", targetLevel: "B1", targetDate: FUTURE };
const calledMethods = (i: number) => chains[i].map((c) => c.method);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("/api/learning-goal auth", () => {
  it.each(["GET", "PUT", "DELETE"] as const)(
    "%s without a token is 401 and touches nothing",
    async (m) => {
      queue();
      const res = await handlers[m]({
        request: req(m, "?course=en", m === "PUT" ? body : undefined, ""),
      });
      expect(res.status).toBe(401);
      expect(from).not.toHaveBeenCalled();
    },
  );
  it("an invalid token is 401", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error("bad") });
    expect((await handlers.GET({ request: req("GET", "?course=en") })).status).toBe(401);
  });
});

describe("GET stored goal", () => {
  it("returns no goal and no plan when none is saved", async () => {
    queue(NO_GOAL);
    const res = await handlers.GET({ request: req("GET", "?course=en") });
    expect(await res.json()).toEqual({ goal: null, plan: null });
  });

  it("returns the goal and a plan computed from the learner's own data", async () => {
    const all = lessonsByLevel("en");
    const first = all.A1[0];
    queue(
      GOAL("B1", PG_TS),
      LEVEL("A1"),
      DONE([{ lesson_id: first, completed_at: "2026-10-05T00:00:00Z" }]),
    );
    const res = await handlers.GET({ request: req("GET", "?course=en") });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.goal).toEqual({
      course: "en",
      targetLevel: "B1",
      targetDate: "2026-12-01",
      // Normalised to ISO-8601 with milliseconds and Z: PostgREST sends microseconds and +00:00,
      // which Swift's ISO8601 decoders reject.
      createdAt: "2026-09-01T00:00:00.123Z",
    });
    expect(json.plan.lessonsInScope).toBe(all.A1.length + all.A2.length + all.B1.length);
    expect(json.plan.lessonsRemaining).toBe(json.plan.lessonsInScope - 1);
    expect(json.plan.lessonsDoneLast7Days).toBe(1);
    expect(json.plan.asOf).toBe(NOW.toISOString());
    // Every read is scoped to the token's user AND the requested course.
    for (let i = 0; i < 3; i++) {
      const eqs = chains[i].filter((c) => c.method === "eq").map((c) => c.args);
      expect(eqs, `read ${i}`).toContainEqual(["user_id", "user-1"]);
      expect(eqs, `read ${i}`).toContainEqual(["language", "en"]);
    }
  });

  it("returns the goal with a null plan when the learner's level has passed the target", async () => {
    queue(GOAL("B1", "2026-09-01T00:00:00Z"), LEVEL("C1"), DONE([]));
    const json = await (await handlers.GET({ request: req("GET", "?course=en") })).json();
    expect(json.goal.targetLevel).toBe("B1");
    expect(json.plan).toBeNull();
  });

  it("treats a learner with no language_progress row as A1", async () => {
    queue(GOAL("A1", "2026-09-01T00:00:00Z"), LEVEL(null), DONE([]));
    const json = await (await handlers.GET({ request: req("GET", "?course=en") })).json();
    expect(json.plan.currentLevel).toBe("A1");
  });

  it("rejects an unknown course", async () => {
    queue();
    expect((await handlers.GET({ request: req("GET", "?course=de") })).status).toBe(400);
    expect((await handlers.GET({ request: req("GET", "") })).status).toBe(400);
  });

  it.each([
    ["the goal read", [DB_ERROR]],
    ["the level read", [GOAL("B1", "2026-09-01T00:00:00Z"), DB_ERROR]],
    ["the completions read", [GOAL("B1", "2026-09-01T00:00:00Z"), LEVEL("A1"), DB_ERROR]],
  ])("is a 500, never 'no goal', when %s fails", async (_n, results) => {
    queue(...results);
    const res = await handlers.GET({ request: req("GET", "?course=en") });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: expect.any(String) });
  });
});

describe("GET preview", () => {
  const q = `?course=en&targetLevel=B1&targetDate=${FUTURE}`;

  it("returns a just_started plan and writes nothing", async () => {
    queue(LEVEL("A1"), DONE([]));
    const res = await handlers.GET({ request: req("GET", q) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.plan.status).toBe("just_started");
    expect(json.goal).toBeUndefined();
    expect(from).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 2; i++) {
      expect(calledMethods(i)).not.toContain("upsert");
      expect(calledMethods(i)).not.toContain("insert");
    }
  });

  it.each([
    ["a past date", "?course=en&targetLevel=B1&targetDate=2026-09-01"],
    ["today", "?course=en&targetLevel=B1&targetDate=2026-10-06"],
    ["an unknown level", `?course=en&targetLevel=D1&targetDate=${FUTURE}`],
    ["an impossible date", "?course=en&targetLevel=B1&targetDate=2026-02-30"],
  ])("rejects %s with 400", async (_n, query) => {
    queue(LEVEL("A1"), DONE([]));
    expect((await handlers.GET({ request: req("GET", query) })).status).toBe(400);
  });
});

describe("PUT", () => {
  // A brand-new goal was created just now; PostgREST formats it with microseconds and +00:00.
  const SAVED = { data: { created_at: "2026-10-06T12:00:00.123456+00:00" }, error: null };

  it("validates, upserts for the token's user, and returns the goal and plan", async () => {
    queue(LEVEL("A1"), DONE([]), SAVED);
    const res = await handlers.PUT({
      request: req("PUT", "", { ...body, user_id: "someone-else" }),
    });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.goal).toMatchObject({
      course: "en",
      targetLevel: "B1",
      targetDate: FUTURE,
      createdAt: "2026-10-06T12:00:00.123Z",
    });
    expect(json.plan.status).toBe("just_started");
    const upsert = chains[2].find((c) => c.method === "upsert")!;
    expect(upsert.args[0]).toMatchObject({
      user_id: "user-1",
      language: "en",
      target_level: "B1",
      target_date: FUTURE,
    });
    expect(upsert.args[1]).toEqual({ onConflict: "user_id,language" });
  });

  it.each([
    ["malformed JSON", "{nope"],
    ["an unknown course", { ...body, course: "de" }],
    ["a level below the learner's", { ...body, targetLevel: "A1" }],
    ["today", { ...body, targetDate: "2026-10-06" }],
    ["a past date", { ...body, targetDate: "2026-09-01" }],
    ["more than three years out", { ...body, targetDate: "2030-01-01" }],
    ["an impossible date", { ...body, targetDate: "2026-02-30" }],
  ])("returns 400 for %s and writes nothing", async (_n, b) => {
    queue(LEVEL("A2"), DONE([]), SAVED);
    const res = await handlers.PUT({ request: req("PUT", "", b) });
    expect(res.status).toBe(400);
    for (let i = 0; i < chains.length; i++) expect(calledMethods(i)).not.toContain("upsert");
  });

  it("is a 500 when the upsert fails", async () => {
    queue(LEVEL("A1"), DONE([]), DB_ERROR);
    expect((await handlers.PUT({ request: req("PUT", "", body) })).status).toBe(500);
  });
});

describe("DELETE", () => {
  it("deletes only the caller's row for that course", async () => {
    queue({ error: null });
    const res = await handlers.DELETE({ request: req("DELETE", "?course=en") });
    expect(await res.json()).toEqual({ ok: true });
    const eqs = chains[0].filter((c) => c.method === "eq").map((c) => c.args);
    expect(calledMethods(0)).toContain("delete");
    expect(eqs).toContainEqual(["user_id", "user-1"]);
    expect(eqs).toContainEqual(["language", "en"]);
  });
  it("rejects an unknown course and reports database errors", async () => {
    queue({ error: null });
    expect((await handlers.DELETE({ request: req("DELETE", "?course=de") })).status).toBe(400);
    queue({ error: { message: "boom" } });
    expect((await handlers.DELETE({ request: req("DELETE", "?course=en") })).status).toBe(500);
  });
});
