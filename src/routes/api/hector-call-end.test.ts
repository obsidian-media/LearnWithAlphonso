import { beforeEach, describe, expect, it, vi } from "vitest";

const CALL = "00000000-0000-4000-8000-0000000000d1";
const h = vi.hoisted(() => ({
  authorize: vi.fn(),
  charge: vi.fn(),
  generate: vi.fn(),
  pro: vi.fn(),
  rpcs: [] as { fn: string; args: Record<string, unknown> }[],
  /** "user:call" rows of hector_call_ends: when claimed, and whether completed. */
  claims: new Map<string, { at: number; done: boolean }>(),
  claimError: null as { code?: string } | null,
  released: [] as string[],
  rpcError: null as unknown,
}));
vi.mock("@/lib/ai-consent.server", () => ({ authorizeAiRequest: h.authorize }));
vi.mock("@/lib/llm-chat-model.server", () => ({
  resolveLlmApiKey: () => "k",
  resolveLlmChatModel: () => "m",
}));
vi.mock("@/lib/call-recap.server", () => ({ generateCallRecap: h.generate, proStateFor: h.pro }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      // The moderation filter's database function, with one blocked term: the REAL filter code runs on top of it.
      if (fn === "ai_output_blocked")
        return { data: (args._texts as string[]).map((t) => /blockedword/i.test(t)), error: null };
      const key = `${args._user_id}:${args._call_id}`;
      if (fn === "claim_hector_call") {
        if (h.claimError) return { data: null, error: h.claimError };
        const row = h.claims.get(key);
        if (row?.done) return { data: "done", error: null };
        // A live lease blocks; an unfinished claim older than 2 minutes can be taken over.
        if (row && Date.now() - row.at < 120_000) return { data: "busy", error: null };
        h.claims.set(key, { at: Date.now(), done: false });
        return { data: "claimed", error: null };
      }
      if (fn === "release_hector_call") {
        const row = h.claims.get(key);
        if (row && !row.done) {
          h.claims.delete(key);
          h.released.push(key);
        }
        return { data: !!row && !row.done, error: null };
      }
      if (fn === "complete_hector_call") {
        const row = h.claims.get(key);
        if (row) row.done = true;
        return { data: !!row, error: null };
      }
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
  h.claims.clear();
  h.claimError = null;
  h.released.length = 0;
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

  it("a call already saved is not charged, generated or written again", async () => {
    h.claims.set(`u1:${CALL}`, { at: Date.now(), done: true });
    const res = await call({ callId: CALL, course: "es", messages: turns });
    expect(await res.json()).toMatchObject({ saved: false, reason: "already_saved" });
    expect(h.charge).not.toHaveBeenCalled();
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.rpcs).toHaveLength(0);
  });

  it("two concurrent requests for one call produce one charge, one generate and one write", async () => {
    h.generate.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return recap;
    });
    const [a, b] = await Promise.all([
      call({ callId: CALL, course: "es", messages: turns }),
      call({ callId: CALL, course: "es", messages: turns }),
    ]);
    const bodies = [await a.json(), await b.json()];
    expect(bodies).toContainEqual({ saved: true, lines: 1 });
    expect(bodies).toContainEqual({ saved: false, reason: "in_progress" });
    expect(h.charge).toHaveBeenCalledTimes(1);
    expect(h.generate).toHaveBeenCalledTimes(1);
    expect(h.rpcs).toHaveLength(1);
  });

  it("a retry of an older call after a later one was saved is still refused", async () => {
    const OLDER = "00000000-0000-4000-8000-0000000000d2";
    await call({ callId: OLDER, course: "es", messages: turns });
    await call({ callId: CALL, course: "es", messages: turns });
    h.charge.mockClear();
    h.generate.mockClear();
    const res = await call({ callId: OLDER, course: "es", messages: turns });
    expect(await res.json()).toMatchObject({ saved: false, reason: "already_saved" });
    expect(h.charge).not.toHaveBeenCalled();
    expect(h.generate).not.toHaveBeenCalled();
  });

  it("a live claim is not 'already saved': the answer is in_progress and nothing is spent", async () => {
    h.claims.set(`u1:${CALL}`, { at: Date.now() - 30_000, done: false });
    const res = await call({ callId: CALL, course: "es", messages: turns });
    expect(await res.json()).toEqual({ saved: false, reason: "in_progress" });
    expect(h.charge).not.toHaveBeenCalled();
    expect(h.generate).not.toHaveBeenCalled();
  });

  it("a claim whose holder died is taken over after the lease and the call is saved", async () => {
    h.claims.set(`u1:${CALL}`, { at: Date.now() - 3 * 60_000, done: false });
    const res = await call({ callId: CALL, course: "es", messages: turns });
    expect(await res.json()).toEqual({ saved: true, lines: 1 });
    expect(h.charge).toHaveBeenCalledTimes(1);
    expect(h.claims.get(`u1:${CALL}`)?.done).toBe(true);
  });

  it("fails closed when the claim cannot be taken: a 503, no charge, no model call", async () => {
    h.claimError = { code: "57014" };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await call({ callId: CALL, course: "es", messages: turns });
    expect(res.status).toBe(503);
    expect(h.charge).not.toHaveBeenCalled();
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.rpcs).toHaveLength(0);
    expect(warn.mock.calls.map((c) => String(c[0])).join("\n")).toContain('"stage":"claim"');
  });

  it("gives the claim back when the model produced nothing, so a retry can save the call", async () => {
    h.generate.mockResolvedValueOnce(null);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await call({ callId: CALL, course: "es", messages: turns });
    expect(h.claims.has(`u1:${CALL}`)).toBe(false);
    const retry = await call({ callId: CALL, course: "es", messages: turns });
    expect(await retry.json()).toEqual({ saved: true, lines: 1 });
  });

  it("gives the claim back when the write fails, and when the quota refuses", async () => {
    h.rpcError = { code: "42501" };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await call({ callId: CALL, course: "es", messages: turns });
    expect(h.claims.has(`u1:${CALL}`)).toBe(false);
    h.rpcError = null;
    h.charge.mockResolvedValueOnce(Response.json({ error: "quota" }, { status: 429 }));
    const res = await call({ callId: CALL, course: "es", messages: turns });
    expect(res.status).toBe(429);
    expect(h.claims.has(`u1:${CALL}`)).toBe(false);
  });

  it("keeps the claim once the call is saved or every word was dropped (the spend happened)", async () => {
    await call({ callId: CALL, course: "es", messages: turns });
    expect(h.claims.get(`u1:${CALL}`)?.done).toBe(true);
    const OTHER = "00000000-0000-4000-8000-0000000000d3";
    h.generate.mockResolvedValue({
      corrections: [{ ...recap.corrections[0], fixed: "un blockedword" }],
      phrase: null,
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await call({ callId: OTHER, course: "es", messages: turns });
    expect(h.claims.get(`u1:${OTHER}`)?.done).toBe(true);
    expect(h.released).toEqual([]);
  });

  it("drops a correction the blocked-term filter flags (the real filter runs) and keeps the rest", async () => {
    h.generate.mockResolvedValue({
      corrections: [
        recap.corrections[0],
        { said: "x", fixed: "a blockedword here", why: "y", topic: "articles", wrong: ["a", "b"] },
      ],
      phrase: null,
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await call({ callId: CALL, course: "es", messages: turns });
    expect(await res.json()).toEqual({ saved: true, lines: 1 });
    expect(h.rpcs[0].args).toMatchObject({
      _topics: ["ser-estar"],
      _mistakes: [{ topic: "ser-estar", text: "Estoy cansado" }],
    });
    expect(JSON.stringify(h.rpcs[0].args)).not.toContain("blockedword");
  });

  it("when every correction is blocked nothing is written (nothing_to_keep)", async () => {
    h.generate.mockResolvedValue({
      corrections: [{ ...recap.corrections[0], fixed: "un blockedword" }],
      phrase: null,
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await call({ callId: CALL, course: "es", messages: turns });
    expect(await res.json()).toEqual({ saved: false, reason: "nothing_to_keep" });
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
