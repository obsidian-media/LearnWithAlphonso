import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const getUserById = vi.fn();
const updateUserById = vi.fn();
const eq = vi.fn();
const update = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ update }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { auth: { getUser, admin: { getUserById, updateUserById } }, from },
}));

const { Route } = await import("./learner-profile");
const handlers = Route.options.server!.handlers as unknown as Record<
  "GET" | "PUT",
  (opts: { request: Request }) => Promise<Response>
>;

function req(method: string, body?: unknown, authorization = "Bearer token-123") {
  return new Request("https://example.com/api/learner-profile", {
    method,
    headers: {
      ...(authorization ? { Authorization: authorization } : {}),
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  getUserById.mockReset();
  getUserById.mockResolvedValue({
    data: {
      user: {
        user_metadata: {
          voices: { alphonso: { es: "x" } },
          learner_profile: { goal: "work", ageRange: "12-", nativeLanguage: "fa" },
        },
      },
    },
    error: null,
  });
  updateUserById.mockReset();
  updateUserById.mockResolvedValue({ data: {}, error: null });
  eq.mockReset();
  eq.mockResolvedValue({ error: null });
  update.mockClear();
  from.mockClear();
});

describe("/api/learner-profile auth", () => {
  it.each(["GET", "PUT"] as const)("%s without a token is 401 and touches nothing", async (m) => {
    const res = await handlers[m]({ request: req(m, m === "PUT" ? { patch: {} } : undefined, "") });
    expect(res.status).toBe(401);
    expect(getUserById).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("an invalid token is 401", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error("bad") });
    const res = await handlers.PUT({ request: req("PUT", { patch: { goal: "travel" } }) });
    expect(res.status).toBe(401);
    expect(updateUserById).not.toHaveBeenCalled();
  });
});

describe("GET /api/learner-profile", () => {
  it("returns the parsed profile of the token's user, dropping values off the lists", async () => {
    const res = await handlers.GET({ request: req("GET") });
    expect(res.status).toBe(200);
    expect(getUserById).toHaveBeenCalledWith("user-1");
    const body = await res.json();
    expect(body.profile).toEqual({ showFlag: false, goal: "work", nativeLanguage: "fa" });
  });
});

describe("PUT /api/learner-profile", () => {
  it("saves into learner_profile for the token's user and keeps the rest of the metadata", async () => {
    const res = await handlers.PUT({
      request: req("PUT", { patch: { goal: "travel", ageRange: "25-34" }, mark: "completed" }),
    });
    expect(res.status).toBe(200);
    const [id, attrs] = updateUserById.mock.calls[0];
    expect(id).toBe("user-1");
    expect(attrs.user_metadata.voices).toEqual({ alphonso: { es: "x" } });
    expect(attrs.user_metadata.learner_profile).toMatchObject({
      goal: "travel",
      ageRange: "25-34",
      nativeLanguage: "fa",
    });
    expect(typeof attrs.user_metadata.learner_profile.completedAt).toBe("string");
    // Neither the flag nor the country changed: profiles is not written.
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    ["an under-13 range", { patch: { ageRange: "under-13" } }],
    ["a birth date (unknown key)", { patch: { birthDate: "2015-01-01" } }],
    ["a country off the list", { patch: { country: "ZZ" } }],
    ["an unknown mark", { patch: {}, mark: "deleted" }],
    ["an extra top-level key", { patch: {}, userId: "someone-else" }],
  ])("refuses %s with a 400 and writes nothing", async (_label, body) => {
    const res = await handlers.PUT({ request: req("PUT", body) });
    expect(res.status).toBe(400);
    expect(updateUserById).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("puts the country on profiles only while the flag is on, scoped to the token's user", async () => {
    await handlers.PUT({ request: req("PUT", { patch: { country: "CA", showFlag: true } }) });
    expect(from).toHaveBeenCalledWith("profiles");
    expect(update).toHaveBeenCalledWith({ country: "CA" });
    expect(eq).toHaveBeenCalledWith("id", "user-1");

    update.mockClear();
    await handlers.PUT({ request: req("PUT", { patch: { country: "CA", showFlag: false } }) });
    expect(update).toHaveBeenCalledWith({ country: null });
  });

  it("is a 500 with the save's message when the country write fails", async () => {
    eq.mockResolvedValue({ error: { message: "rls" } });
    const res = await handlers.PUT({
      request: req("PUT", { patch: { showFlag: true, country: "CA" } }),
    });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/flag setting wasn't/);
  });

  it("bad JSON is a 400", async () => {
    const res = await handlers.PUT({ request: req("PUT", "{nope") });
    expect(res.status).toBe(400);
  });
});
