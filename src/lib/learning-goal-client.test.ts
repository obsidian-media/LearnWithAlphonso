// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth-headers", () => ({
  authHeaders: vi.fn(async () => ({ Authorization: "Bearer tok" })),
}));

import {
  GoalError,
  fetchGoal,
  goalErrorMessage,
  isPlan,
  previewGoal,
  readCachedGoal,
  removeGoal,
  saveGoal,
} from "./learning-goal-client";

const fixtures = JSON.parse(
  fs.readFileSync(path.resolve(import.meta.dirname, "learning-goal.fixtures.json"), "utf8"),
) as Record<string, unknown>;
const plan = fixtures.on_track;
const goal = {
  course: "en",
  targetLevel: "B1",
  targetDate: "2026-12-01",
  createdAt: "2026-10-01T00:00:00Z",
};

function respond(status: number, body: unknown): typeof fetch {
  return vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  ) as unknown as typeof fetch;
}
const lastCall = (f: typeof fetch) =>
  (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("isPlan (the cross-platform contract)", () => {
  it("accepts every checked-in sample plan", () => {
    for (const [name, sample] of Object.entries(fixtures)) expect(isPlan(sample), name).toBe(true);
  });
  it("rejects a plan with a missing or mistyped field", () => {
    expect(isPlan({ ...(plan as object), status: "wat" })).toBe(false);
    expect(isPlan({ ...(plan as object), requiredPerWeek: "10" })).toBe(false);
    const { asOf: _asOf, ...rest } = plan as Record<string, unknown>;
    expect(isPlan(rest)).toBe(false);
    expect(isPlan(null)).toBe(false);
  });
});

describe("requests", () => {
  it("fetchGoal GETs the course with the bearer token and caches the result", async () => {
    const f = respond(200, { goal, plan });
    const result = await fetchGoal("en", f);
    expect(result.goal).toEqual(goal);
    const [url, init] = lastCall(f);
    expect(url).toBe("/api/learning-goal?course=en");
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok" });
    expect(readCachedGoal("en")).toMatchObject({ goal, plan });
  });
  it("fetchGoal caches nothing for 'no goal' and clears an old cache", async () => {
    await fetchGoal("en", respond(200, { goal, plan }));
    await fetchGoal("en", respond(200, { goal: null, plan: null }));
    expect(readCachedGoal("en")).toBeNull();
  });
  it("previewGoal GETs with the candidate in the query and no body", async () => {
    const f = respond(200, { plan });
    await previewGoal("en", "B1", "2026-12-01", f);
    const [url, init] = lastCall(f);
    expect(url).toBe("/api/learning-goal?course=en&targetLevel=B1&targetDate=2026-12-01");
    expect(init.method ?? "GET").toBe("GET");
    expect(init.body).toBeUndefined();
  });
  it("saveGoal PUTs JSON and caches the saved goal", async () => {
    const f = respond(200, { goal, plan });
    await saveGoal("en", "B1", "2026-12-01", f);
    const [, init] = lastCall(f);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({
      course: "en",
      targetLevel: "B1",
      targetDate: "2026-12-01",
    });
    expect(readCachedGoal("en")).toMatchObject({ goal });
  });
  it("removeGoal DELETEs and clears the cache", async () => {
    await fetchGoal("en", respond(200, { goal, plan }));
    const f = respond(200, { ok: true });
    await removeGoal("en", f);
    expect(lastCall(f)[1].method).toBe("DELETE");
    expect(readCachedGoal("en")).toBeNull();
  });
});

describe("errors", () => {
  it.each([
    [400, "invalid"],
    [401, "notSignedIn"],
    [500, "unavailable"],
  ])("maps HTTP %i to %s", async (status, kind) => {
    await expect(fetchGoal("en", respond(status, { error: "x" }))).rejects.toMatchObject({ kind });
  });
  it("maps a network failure to offline", async () => {
    const failing = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await expect(fetchGoal("en", failing)).rejects.toMatchObject({ kind: "offline" });
  });
  it("treats a 200 with the wrong shape as unavailable, and a non-JSON body too", async () => {
    await expect(fetchGoal("en", respond(200, { goal, plan: { nope: 1 } }))).rejects.toMatchObject({
      kind: "unavailable",
    });
    const html = vi.fn(
      async () => new Response("<html>", { status: 200 }),
    ) as unknown as typeof fetch;
    await expect(fetchGoal("en", html)).rejects.toBeInstanceOf(GoalError);
  });
  it("gives every kind a distinct message", () => {
    const kinds = ["invalid", "notSignedIn", "unavailable", "offline"] as const;
    const messages = kinds.map(goalErrorMessage);
    expect(new Set(messages).size).toBe(kinds.length);
  });
});

describe("cache", () => {
  it("survives storage that throws", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await expect(fetchGoal("en", respond(200, { goal, plan }))).resolves.toMatchObject({ goal });
    expect(readCachedGoal("en")).toBeNull();
  });
  it("ignores a corrupt cache entry", () => {
    window.localStorage.setItem("lingua.learning-goal.v1.en", "{not json");
    expect(readCachedGoal("en")).toBeNull();
  });
});
