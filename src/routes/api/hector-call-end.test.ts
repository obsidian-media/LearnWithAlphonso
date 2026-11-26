import { beforeEach, describe, expect, it, vi } from "vitest";

const CALL = "00000000-0000-4000-8000-0000000000d1";
const h = vi.hoisted(() => ({
  authorize: vi.fn(),
  charge: vi.fn(),
  generate: vi.fn(),
  pro: vi.fn(),
  rpcs: [] as { fn: string; args: Record<string, unknown> }[],
  existing: [] as unknown[],
  rpcError: null as unknown,
}));
vi.mock("@/lib/ai-consent.server", () => ({ authorizeAiRequest: h.authorize }));
vi.mock("@/lib/llm-chat-model.server", () => ({
  resolveLlmApiKey: () => "k",
  resolveLlmChatModel: () => "m",
}));
vi.mock("@/lib/ai-safety", () => ({
  makeBlockedTermCheck: () => async () => [],
  filterModelOutputs: async (t: string[]) => t.map(() => false),
}));
vi.mock("@/lib/call-recap.server", () => ({ generateCallRecap: h.generate, proStateFor: h.pro }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => {
      const q: Record<string, unknown> = {};
      for (const n of ["select", "eq"]) q[n] = () => q;
      q.limit = async () => ({ data: h.existing, error: null });
      return q;
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      h.rpcs.push({ fn, args });
      return { data: 1, error: h.rpcError };
    },
  },
}));

const { Route } = await import("./hector-call-end");
const POST = (
  Route.options.server!.handlers as unknown as {
    POST: (o: { request: Request }) => Promise<Response>;
  }
).POST;

const turns = [
  { role: "assistant", content: "Hola, ¿qué tal?" },
  { role: "user", content: "Soy cansado" },
  { role: "assistant", content: "¿Por qué?" },
  { role: "user", content: "Yo trabajo mucho" },
  { role: "assistant", content: "Ah." },
  { role: "user", content: "Sí" },
];
const call = (body: unknown) =>
  POST({
    request: new Request("https://x/api/hector-call-end", {
      method: "POST",
      headers: { Authorization: "Bearer t" },
      body: JSON.stringify(body),
    }),
  });
const recap = {
  corrections: [
    {
      said: "Soy cansado",
      fixed: "Estoy cansado",
      why: "estar",
      topic: "ser-estar",
      wrong: ["a", "b"],
    },
  ],
  phrase: null,
};

beforeEach(() => {
  vi.restoreAllMocks();
  h.rpcs.length = 0;
  h.existing = [];
  h.rpcError = null;
  h.charge.mockReset();
  h.charge.mockResolvedValue(null);
  h.authorize.mockReset();
  h.authorize.mockResolvedValue({ ok: true, userId: "u1", chargeQuota: h.charge });
  h.generate.mockReset();
  h.generate.mockResolvedValue(recap);
  h.pro.mockReset();
  h.pro.mockResolvedValue("active");
});

describe("POST /api/hector-call-end", () => {
  it("writes the call's mistakes to Hector's memory for a Pro learner, from the actual conversation", async () => {
    const res = await call({ callId: CALL, course: "es", messages: turns });
    expect(await res.json()).toEqual({ saved: true, lines: 1 });
    expect(h.generate.mock.calls[0][0].turns).toEqual(turns);
    expect(h.generate.mock.calls[0][0].course).toBe("es");
    expect(h.rpcs).toHaveLength(1);
    expect(h.rpcs[0].fn).toBe("remember_call_recap");
    expect(h.rpcs[0].args).toMatchObject({
      _user_id: "u1",
      _course: "es",
      _call_id: CALL,
      _topics: ["ser-estar"],
      _mistakes: [{ topic: "ser-estar", text: "Estoy cansado" }],
      _save: true,
    });
    expect(JSON.stringify(h.rpcs[0].args)).not.toContain("Soy cansado");
  });

  it("writes nothing and spends no AI for a learner without Pro", async () => {
    h.pro.mockResolvedValue("inactive");
    const res = await call({ callId: CALL, course: "es", messages: turns });
    expect(await res.json()).toMatchObject({ saved: false, reason: "not_pro" });
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.charge).not.toHaveBeenCalled();
    expect(h.rpcs).toHaveLength(0);
  });

  it("a short call costs nothing and writes nothing", async () => {
    const res = await call({ callId: CALL, course: "es", messages: turns.slice(0, 3) });
    expect(await res.json()).toMatchObject({ saved: false, reason: "short_call" });
    expect(h.authorize).not.toHaveBeenCalled();
    expect(h.rpcs).toHaveLength(0);
  });

  it("a call already saved is not written twice", async () => {
    h.existing = [{ id: "x" }];
    const res = await call({ callId: CALL, course: "es", messages: turns });
    expect(await res.json()).toMatchObject({ saved: false, reason: "already_saved" });
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.rpcs).toHaveLength(0);
  });

  it("a refused consent or quota is returned as-is and nothing is written", async () => {
    h.authorize.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "ai-consent-required" }, { status: 403 }),
    });
    expect((await call({ callId: CALL, course: "es", messages: turns })).status).toBe(403);
    expect(h.rpcs).toHaveLength(0);
  });

  it("a failed write is logged with its stage, never silent", async () => {
    h.rpcError = { code: "42501", message: "denied" };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await call({ callId: CALL, course: "es", messages: turns });
    expect(await res.json()).toMatchObject({ saved: false, reason: "write_failed" });
    expect(warn.mock.calls.map((c) => String(c[0])).join("\n")).toContain(
      '"event":"hector_call_end_failed","stage":"write"',
    );
  });

  it("an unusable recap is logged with its stage", async () => {
    h.generate.mockResolvedValue(null);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await call({ callId: CALL, course: "es", messages: turns });
    expect(warn.mock.calls.map((c) => String(c[0])).join("\n")).toContain('"stage":"recap"');
  });
});
