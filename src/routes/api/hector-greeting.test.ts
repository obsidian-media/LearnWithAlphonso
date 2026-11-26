import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  pro: vi.fn(),
  memory: [] as { memory_key: string }[],
  events: [] as { category: string; event_type: string; created_at: string }[],
  eqs: [] as { table: string; col: string; val: unknown }[],
}));
vi.mock("@/lib/account-ban.server", () => ({ checkBan: async () => null }));
vi.mock("@/lib/call-recap.server", () => ({ proStateFor: h.pro }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    auth: {
      getUser: async () => ({
        data: { user: { id: "u1", user_metadata: { learner_profile: { name: "Sam" } } } },
        error: null,
      }),
    },
    from: (t: string) => {
      const q: Record<string, unknown> = {};
      for (const n of ["select", "order"]) q[n] = () => q;
      q.eq = (col: string, val: unknown) => {
        h.eqs.push({ table: t, col, val });
        return q;
      };
      q.limit = async () => ({ data: h.memory, error: null });
      q.then = (ok: (v: unknown) => unknown) =>
        ok({ data: t === "weakness_events" ? h.events : h.memory, error: null });
      return q;
    },
  },
}));

const { Route } = await import("./hector-greeting");
const POST = (
  Route.options.server!.handlers as unknown as {
    POST: (o: { request: Request }) => Promise<Response>;
  }
).POST;
const call = (body: unknown, auth = "Bearer t") =>
  POST({
    request: new Request("https://x/api/hector-greeting", {
      method: "POST",
      headers: auth ? { Authorization: auth } : {},
      body: JSON.stringify(body),
    }),
  });

beforeEach(() => {
  h.pro.mockReset();
  h.pro.mockResolvedValue("active");
  h.memory = [];
  h.events = [];
  h.eqs = [];
});

describe("POST /api/hector-greeting", () => {
  it("opens with what the last call saved, by name", async () => {
    h.memory = [{ memory_key: "ser-estar" }];
    const body = await (await call({ course: "es", cefrLevel: "B1", lastVariant: 0 })).json();
    expect(body.remembered).toBe(true);
    expect(body.topic).toBe("ser-estar");
    expect(body.greeting).toContain("Sam");
    expect(body.greeting).toContain("ser y estar");
  });

  it("never repeats the variant the client said last", async () => {
    for (let i = 0; i < 20; i++) {
      const body = await (await call({ course: "en", lastVariant: 1 })).json();
      expect(body.variant).not.toBe(1);
    }
  });

  it("falls back to an open weakness, then to a plain hello", async () => {
    h.events = [{ category: "articles", event_type: "detected", created_at: "2026-11-01" }];
    const withEvents = await (await call({ course: "en" })).json();
    expect(withEvents).toMatchObject({ topic: "articles", remembered: false });
    h.events = [];
    const none = await (await call({ course: "en" })).json();
    expect(none).toMatchObject({ topic: null, remembered: false });
  });

  it("reads the weak spots of the course asked for, not every course's", async () => {
    await call({ course: "fr" });
    expect(h.eqs).toContainEqual({ table: "weakness_events", col: "course", val: "fr" });
    expect(h.eqs).toContainEqual({ table: "tutor_memory", col: "course", val: "fr" });
  });

  it("is Pro only, like Hector", async () => {
    h.pro.mockResolvedValue("inactive");
    expect((await call({ course: "en" })).status).toBe(403);
    h.pro.mockResolvedValue("unavailable");
    expect((await call({ course: "en" })).status).toBe(503);
    expect((await call({ course: "en" }, "")).status).toBe(401);
  });
});
