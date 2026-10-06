// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const userId = vi.hoisted(() => ({ current: "user-1" as string | null }));
vi.mock("./auth-headers", () => ({
  authHeaders: vi.fn(async () => ({ Authorization: "Bearer tok" })),
  currentUserId: vi.fn(async () => userId.current),
}));

import {
  GoalError,
  fetchGoal,
  goalErrorMessage,
  isPlan,
  parseState,
  previewGoal,
  readCachedGoal,
  removeGoal,
  saveGoal,
} from "./learning-goal-client";

const file = JSON.parse(
  fs.readFileSync(path.resolve(import.meta.dirname, "learning-goal.fixtures.json"), "utf8"),
) as { plans: Record<string, unknown>; envelopes: Record<string, unknown> };
const fixtures = file.plans;
const plan = fixtures.on_track;
const goal = {
  course: "en",
  targetLevel: "B1",
  targetDate: "2026-12-01",
  createdAt: "2026-10-01T00:00:00.000Z",
};

function respond(status: number, body: unknown): typeof fetch {
  return vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  ) as unknown as typeof fetch;
}
const lastCall = (f: typeof fetch) =>
  (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];

beforeEach(() => {
  window.localStorage.clear();
  userId.current = "user-1";
});
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

describe("parseState (the full response envelope)", () => {
  it("decodes every checked-in envelope, including a goal whose plan is null", () => {
    for (const [name, envelope] of Object.entries(file.envelopes)) {
      expect(() => parseState(envelope as never), name).not.toThrow();
    }
    expect(parseState(file.envelopes.stored_plan_null as never)).toMatchObject({ plan: null });
    expect(parseState(file.envelopes.none as never)).toEqual({ goal: null, plan: null });
  });
  it("rejects a goal createdAt that is not ISO-8601 with milliseconds and Z", () => {
    const stored = file.envelopes.stored as { goal: object; plan: unknown };
    const bad = {
      ...stored,
      goal: { ...stored.goal, createdAt: "2026-09-06T12:00:00.123456+00:00" },
    };
    expect(() => parseState(bad as never)).toThrow(GoalError);
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
    expect(await readCachedGoal("en")).toMatchObject({ goal, plan });
  });
  it("fetchGoal caches nothing for 'no goal' and clears an old cache", async () => {
    await fetchGoal("en", respond(200, { goal, plan }));
    await fetchGoal("en", respond(200, { goal: null, plan: null }));
    expect(await readCachedGoal("en")).toBeNull();
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
    expect(await readCachedGoal("en")).toMatchObject({ goal });
  });
  it("removeGoal DELETEs and clears the cache", async () => {
    await fetchGoal("en", respond(200, { goal, plan }));
    const f = respond(200, { ok: true });
    await removeGoal("en", f);
    expect(lastCall(f)[1].method).toBe("DELETE");
    expect(await readCachedGoal("en")).toBeNull();
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
  it("carries the server's reason on a 400 so the learner is told what to fix", async () => {
    const f = respond(400, { error: "That level is below yours" });
    const error = await fetchGoal("en", f).catch((e) => e);
    expect(error).toMatchObject({ kind: "invalid", detail: "That level is below yours" });
    expect(goalErrorMessage("invalid", error.detail)).toBe("That level is below yours");
    expect(goalErrorMessage("invalid")).toMatch(/can't be saved/i);
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
    const messages = kinds.map((k) => goalErrorMessage(k));
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
    expect(await readCachedGoal("en")).toBeNull();
  });
  it("ignores a corrupt cache entry", async () => {
    window.localStorage.setItem("lingua.learning-goal.v1.user-1.en", "{not json");
    expect(await readCachedGoal("en")).toBeNull();
  });
  it("never caches for a signed-out session", async () => {
    userId.current = null;
    await fetchGoal("en", respond(200, { goal, plan }));
    expect(await readCachedGoal("en")).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });
  it("is per user: another account on the same browser never sees it", async () => {
    await fetchGoal("en", respond(200, { goal, plan }));
    expect(await readCachedGoal("en")).not.toBeNull();
    userId.current = "user-2";
    expect(await readCachedGoal("en")).toBeNull();
    userId.current = null; // signed out
    expect(await readCachedGoal("en")).toBeNull();
  });
});
