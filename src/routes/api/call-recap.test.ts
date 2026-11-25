import { beforeEach, describe, expect, it, vi } from "vitest";

const CALL = "00000000-0000-4000-8000-0000000000c1";
const h = vi.hoisted(() => ({
  authorize: vi.fn(),
  generate: vi.fn(),
  pro: vi.fn(),
  rpcs: [] as { fn: string; args: Record<string, unknown> }[],
  callRow: null as unknown,
  claim: true,
  blocked: [] as boolean[],
}));
vi.mock("@/lib/ai-consent.server", () => ({ authorizeAiRequest: h.authorize }));
vi.mock("@/lib/llm-chat-model.server", () => ({
  resolveLlmApiKey: () => "k",
  resolveLlmChatModel: () => "m",
}));
vi.mock("@/lib/ai-safety", () => ({
  makeBlockedTermCheck: () => async () => [],
  filterModelOutputs: async (t: string[]) => t.map((_, i) => h.blocked[i] === true),
}));
vi.mock("@/lib/call-recap.server", () => ({
  generateCallRecap: h.generate,
  proStateFor: h.pro,
  issueRecapToken: () => "tok",
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => {
      const q: Record<string, unknown> = {};
      for (const n of ["select", "eq"]) q[n] = () => q;
      q.maybeSingle = async () => ({ data: h.callRow });
      return q;
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      h.rpcs.push({ fn, args });
      if (fn === "claim_call_recap") return { data: h.claim, error: null };
      return { data: 1, error: null };
    },
  },
}));

const { Route } = await import("./call-recap");
const POST = (
  Route.options.server!.handlers as unknown as {
    POST: (o: { request: Request }) => Promise<Response>;
  }
).POST;

const msgs = [
  { role: "user", content: "a" },
  { role: "assistant", content: "b" },
  { role: "user", content: "c" },
  { role: "user", content: "d" },
];
const call = (body: unknown) =>
  POST({
    request: new Request("https://x/api/call-recap", {
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
      wrong: ["x", "y"],
    },
  ],
  phrase: { text: "Hola", meaning: "Hello", wrong: ["a", "b", "c"] },
};

beforeEach(() => {
  vi.clearAllMocks();
  h.rpcs = [];
  h.claim = true;
  h.blocked = [];
  h.callRow = { course: "es", finished_at: "2026-11-16T10:00:00Z", recap_at: null };
  h.authorize.mockResolvedValue({ ok: true, userId: "u1", supabase: {} });
  h.generate.mockResolvedValue(recap);
  h.pro.mockResolvedValue("inactive");
});

describe("hidden states: every one is a 200 with no recap, and spends nothing it should not", () => {
  it("a short call (under 3 learner replies) never reaches auth, quota or the AI", async () => {
    const res = await call({ callId: CALL, messages: msgs.slice(0, 2) });
    expect(await res.json()).toEqual({ recap: null });
    expect(h.authorize).not.toHaveBeenCalled();
    expect(h.generate).not.toHaveBeenCalled();
  });
  it("a bad call id", async () => {
    expect(await (await call({ callId: "x", messages: msgs })).json()).toEqual({ recap: null });
    expect(h.authorize).not.toHaveBeenCalled();
  });
  it("a call that is not this learner's, or not finished", async () => {
    h.callRow = null;
    expect(await (await call({ callId: CALL, messages: msgs })).json()).toEqual({ recap: null });
    h.callRow = { course: "es", finished_at: null, recap_at: null };
    expect(await (await call({ callId: CALL, messages: msgs })).json()).toEqual({ recap: null });
    expect(h.generate).not.toHaveBeenCalled();
  });
  it("a recap already written for this call is not written twice", async () => {
    h.callRow = { course: "es", finished_at: "x", recap_at: "2026-11-16T10:00:00Z" };
    expect(await (await call({ callId: CALL, messages: msgs })).json()).toEqual({ recap: null });
    h.callRow = { course: "es", finished_at: "x", recap_at: null };
    h.claim = false; // a second device won the claim
    expect(await (await call({ callId: CALL, messages: msgs })).json()).toEqual({ recap: null });
    expect(h.generate).not.toHaveBeenCalled();
  });
  it("an AI failure or an empty recap", async () => {
    h.generate.mockResolvedValue(null);
    expect(await (await call({ callId: CALL, messages: msgs })).json()).toEqual({ recap: null });
    h.generate.mockResolvedValue({ corrections: [], phrase: null });
    expect(await (await call({ callId: CALL, messages: msgs })).json()).toEqual({ recap: null });
  });
  it("everything the blocked-term check flags is dropped", async () => {
    h.blocked = [true, true];
    expect(await (await call({ callId: CALL, messages: msgs })).json()).toEqual({ recap: null });
    h.blocked = [false, true];
    const body = (await (await call({ callId: CALL, messages: msgs })).json()) as {
      recap: { phrase: unknown; corrections: unknown[] };
    };
    expect(body.recap.corrections).toHaveLength(1);
    expect(body.recap.phrase).toBeNull();
  });
  it("the gates answer with their own status (consent, quota) and nothing is generated", async () => {
    h.authorize.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "ai-consent-required" }, { status: 403 }),
    });
    expect((await call({ callId: CALL, messages: msgs })).status).toBe(403);
    expect(h.generate).not.toHaveBeenCalled();
  });
});

describe("the recap", () => {
  it("spends the 'recap' quota kind, not 'chat'", async () => {
    await call({ callId: CALL, messages: msgs });
    expect(h.authorize.mock.calls[0]![1]).toBe("recap");
    expect(h.authorize.mock.calls[0]![2]).toEqual({ route: "call-recap" });
  });
  it("times each stage in Server-Timing, and logs one [ai-timing] line", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const res = await call({ callId: CALL, messages: msgs });
      const names = (res.headers.get("Server-Timing") ?? "")
        .split(",")
        .map((p) => p.trim().split(";")[0]);
      expect(names).toEqual(["auth", "call", "claim", "llm", "memory", "total"]);
      const lines = info.mock.calls
        .map((c) => String(c[0]))
        .filter((l) => l.startsWith("[ai-timing]"));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain("route=call-recap status=200");
    } finally {
      info.mockRestore();
    }
  });
  it("takes the course from the server's call row, not the request", async () => {
    await call({ callId: CALL, messages: msgs, course: "en" });
    expect(h.generate.mock.calls[0]![0]).toMatchObject({ course: "es", userId: "u1" });
  });
  it("returns the recap with labels and a review token, never the wrong answers", async () => {
    const body = (await (await call({ callId: CALL, messages: msgs })).json()) as {
      recap: Record<string, unknown>;
    };
    expect(body.recap).toMatchObject({
      corrections: [{ said: "Soy cansado", fixed: "Estoy cansado", label: "Ser or estar" }],
      phrase: { text: "Hola", meaning: "Hello" },
      reviewToken: "tok",
      reviewCount: 2,
      saved: false,
    });
    expect(JSON.stringify(body)).not.toContain('"wrong"');
  });
});

describe("Pro gating is decided on the server", () => {
  const memoryCall = () => h.rpcs.find((r) => r.fn === "remember_call_recap")!;
  it("a free learner: events recorded, memory NOT saved", async () => {
    h.pro.mockResolvedValue("inactive");
    await call({ callId: CALL, messages: msgs, pro: true });
    expect(memoryCall().args).toMatchObject({ _save: false, _topics: ["ser-estar"] });
  });
  it("an unreadable entitlement is not Pro", async () => {
    h.pro.mockResolvedValue("unavailable");
    await call({ callId: CALL, messages: msgs });
    expect(memoryCall().args._save).toBe(false);
  });
  it("memory keeps only the corrected form, never the learner's own words", async () => {
    h.pro.mockResolvedValue("active");
    await call({ callId: CALL, messages: msgs });
    expect(memoryCall().args._mistakes).toEqual([{ topic: "ser-estar", text: "Estoy cansado" }]);
    expect(JSON.stringify(memoryCall().args)).not.toContain("Soy cansado");
  });
  it("a Pro learner: memory saved", async () => {
    h.pro.mockResolvedValue("active");
    const body = (await (await call({ callId: CALL, messages: msgs })).json()) as {
      recap: { saved: boolean };
    };
    expect(memoryCall().args).toMatchObject({ _save: true, _user_id: "u1", _course: "es" });
    expect(body.recap.saved).toBe(true);
  });
});
