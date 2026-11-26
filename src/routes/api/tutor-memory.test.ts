import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  pro: vi.fn(),
  rpcs: [] as { fn: string; args: Record<string, unknown> }[],
  saved: [] as unknown[],
  deletes: [] as unknown[][],
  rows: [] as unknown[],
  user: "u1" as string | null,
}));
vi.mock("@/lib/call-recap.server", () => ({ proStateFor: h.pro }));
vi.mock("@/lib/learner-profile.server", () => ({
  saveLearnerProfileFor: async (_a: unknown, _u: string, input: unknown) => {
    h.saved.push(input);
    return {};
  },
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    auth: {
      getUser: async () => ({
        data: h.user ? { user: { id: h.user } } : null,
        error: h.user ? null : {},
      }),
      admin: {
        getUserById: async () => ({
          data: {
            user: {
              user_metadata: {
                learner_profile: { goal: "travel", dailyMinutes: 10, interests: ["food"] },
              },
            },
          },
          error: null,
        }),
      },
    },
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      q.delete = () => ({
        eq: async (c: string, v: string) => {
          h.deletes.push([table, c, v]);
          return { error: null };
        },
      });
      for (const n of ["select", "eq", "order"]) q[n] = () => q;
      q.limit = async () => ({ data: h.rows, error: null });
      return q;
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      h.rpcs.push({ fn, args });
      return { data: { memory: 1, events: 0, review: 0 }, error: null };
    },
  },
}));

const { Route } = await import("./tutor-memory");
const handlers = Route.options.server!.handlers as unknown as Record<
  string,
  (o: { request: Request }) => Promise<Response>
>;
const req = (method: string, body?: unknown) => ({
  request: new Request("https://x/api/tutor-memory", {
    method,
    headers: { Authorization: "Bearer t" },
    body: body ? JSON.stringify(body) : undefined,
  }),
});
const ID = "00000000-0000-4000-8000-0000000000d1";

beforeEach(() => {
  h.pro.mockReset();
  h.rpcs = [];
  h.saved = [];
  h.deletes = [];
  h.user = "u1";
  h.rows = [
    {
      id: ID,
      course: "es",
      kind: "mistake",
      memory_key: "ser-estar",
      text: "x -> y",
      detail: null,
      seen_count: 4,
      last_seen_at: "2026-11-14T10:00:00Z",
    },
    {
      id: "p1",
      course: "es",
      kind: "phrase",
      memory_key: "hola",
      text: "Hola",
      detail: "Hello",
      seen_count: 1,
      last_seen_at: "2026-11-14T10:00:00Z",
    },
  ];
});

describe("GET is open to every signed-in learner", () => {
  it("200 for a learner who is not Pro, with their lines, labels and goals", async () => {
    h.pro.mockResolvedValue("inactive");
    const res = await handlers.GET!(req("GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      mistakes: [{ id: ID, label: "Ser or estar", seenCount: 4 }],
      phrases: [{ id: "p1", text: "Hola", meaning: "Hello" }],
      goals: { goal: "travel", dailyMinutes: 10, interests: ["food"] },
    });
  });
  it("never asks about the entitlement, so an unreadable one cannot block it", async () => {
    h.pro.mockResolvedValue("unavailable");
    expect((await handlers.GET!(req("GET"))).status).toBe(200);
    expect(h.pro).not.toHaveBeenCalled();
  });
  it("401 without a session", async () => {
    h.user = null;
    expect((await handlers.GET!(req("GET"))).status).toBe(401);
  });
});

describe("DELETE works for everyone signed in, scoped to the token's user", () => {
  it("removes one line through the delete function, even for a lapsed subscriber", async () => {
    h.pro.mockResolvedValue("inactive");
    const res = await handlers.DELETE!(req("DELETE", { id: ID, userId: "someone-else" }));
    expect(res.status).toBe(200);
    expect(h.rpcs).toEqual([{ fn: "delete_tutor_memory_line", args: { _user_id: "u1", _id: ID } }]);
    expect(h.pro).not.toHaveBeenCalled();
  });
  it("forget everything calls the one forget function for this user, then clears the goals", async () => {
    const res = await handlers.DELETE!(req("DELETE", { all: true }));
    expect(res.status).toBe(200);
    expect(h.rpcs).toEqual([{ fn: "forget_tutor_memory", args: { _user_id: "u1" } }]);
    expect(h.saved).toEqual([{ patch: { clear: ["goal", "dailyMinutes", "interests"] } }]);
  });
  it("topic notes only: deletes this learner's weakness events and nothing else, even when not Pro", async () => {
    h.pro.mockResolvedValue("inactive");
    const res = await handlers.DELETE!(req("DELETE", { events: true }));
    expect(res.status).toBe(200);
    expect(h.deletes).toEqual([["weakness_events", "user_id", "u1"]]);
    expect(h.rpcs).toEqual([]);
    expect(h.saved).toEqual([]);
  });
  it("rejects a malformed id and an anonymous caller", async () => {
    expect((await handlers.DELETE!(req("DELETE", { id: "'; drop" }))).status).toBe(400);
    h.user = null;
    expect((await handlers.DELETE!(req("DELETE", { all: true }))).status).toBe(401);
    expect(h.rpcs).toEqual([]);
  });
});
