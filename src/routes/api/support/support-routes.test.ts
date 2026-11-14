import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The three Help routes' wiring: who is the learner (the verified session, never the body), the ban check, bad input,
 * what reaches the database (only the support_* functions, with the session id), and what the production runtime logs
 * when the provider fails (the status only).
 */
const SESSION = "00000000-0000-4000-8000-0000000000a1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";

const getUser = vi.fn();
const rpc = vi.fn();
const from = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { auth: { getUser }, rpc, from },
}));
vi.mock("@/lib/app-switches.server", () => ({ isSwitchOn: vi.fn(async () => true) }));
vi.mock("@/lib/ai-consent.server", () => ({
  readAiConsent: vi.fn(async () => "granted"),
}));
const consumeQuota = vi.fn(async () => ({ ok: true, used: 1, limit: 30 }));
vi.mock("@/lib/ai-quota.server", () => ({ consumeQuota }));
vi.mock("@/lib/support-facts.server", async (orig) => ({
  ...(await orig<typeof import("@/lib/support-facts.server")>()),
  loadSupportFacts: vi.fn(async () => ({
    pro: { active: false, source: "none", until: null, unavailable: false },
    course: "en",
    level: null,
    streak: 0,
    daysActiveLast30: 0,
    lastActiveDay: null,
    lessonsLast7Days: 0,
    lastLessonDay: null,
    platforms: [],
    socialBlocked: false,
    previousTickets: [],
  })),
}));

const conversation = (await import("./conversation")).Route.options.server!.handlers as unknown as {
  GET: (o: { request: Request }) => Promise<Response>;
};
const message = (await import("./message")).Route.options.server!.handlers as unknown as {
  POST: (o: { request: Request }) => Promise<Response>;
};
const handoff = (await import("./handoff")).Route.options.server!.handlers as unknown as {
  POST: (o: { request: Request }) => Promise<Response>;
};

const req = (path: string, init: RequestInit & { token?: string | null } = {}) => {
  const { token = "good-token", ...rest } = init;
  return new Request(`https://example.com/api/support/${path}`, {
    ...rest,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
      ...(rest.headers ?? {}),
    },
  });
};
const post = (path: string, body: unknown, token: string | null = "good-token") =>
  req(path, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    token,
  });

/** A fake database that answers the support_* functions. */
function wireDatabase({ banned = false }: { banned?: boolean } = {}) {
  getUser.mockImplementation(async (token: string) =>
    token === "good-token"
      ? { data: { user: { id: SESSION } }, error: null }
      : { data: { user: null }, error: { message: "bad" } },
  );
  rpc.mockImplementation(async (fn: string) => {
    if (fn === "is_restricted") return { data: banned, error: null };
    if (fn === "support_open_conversation") return { data: "conv-1", error: null };
    if (fn === "support_add_learner_message") return { data: 7, error: null };
    if (fn === "support_learner_view")
      return {
        data: {
          status: "ai",
          unread: 0,
          messages: [{ id: 7, kind: "you", body: "hi", at: "2026-11-14T00:00:00Z" }],
        },
        error: null,
      };
    if (fn === "support_handoff") return { data: true, error: null };
    if (fn === "support_add_ai_message") return { data: 8, error: null };
    if (fn === "ai_output_blocked") return { data: [false], error: null };
    return { data: null, error: { message: `unexpected rpc ${fn}` } };
  });
  from.mockImplementation((table: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gt", "order", "limit"]) q[m] = () => q;
    q.maybeSingle = async () => ({
      data: table === "support_conversations" ? { status: "new" } : null,
      error: null,
    });
    q.then = (res: (v: unknown) => unknown) => res({ data: [], error: null });
    return q;
  });
}

beforeEach(() => {
  getUser.mockReset();
  rpc.mockReset();
  from.mockReset();
  consumeQuota.mockClear();
  wireDatabase();
});
afterEach(() => vi.restoreAllMocks());

describe("authentication", () => {
  it.each([
    ["GET conversation", () => conversation.GET({ request: req("conversation", { token: null }) })],
    [
      "POST message",
      () => message.POST({ request: post("message", { text: "hi", clientId: "x" }, null) }),
    ],
    ["POST handoff", () => handoff.POST({ request: post("handoff", {}, null) })],
  ])("%s without a token is 401 and touches nothing", async (_n, call) => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("an invalid token is 401", async () => {
    const res = await conversation.GET({ request: req("conversation", { token: "forged" }) });
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalledWith("support_learner_view", expect.anything());
  });

  it("a banned account's valid token gets account_suspended and reaches no support function", async () => {
    wireDatabase({ banned: true });
    for (const res of [
      await conversation.GET({ request: req("conversation") }),
      await message.POST({
        request: post("message", { text: "hi", clientId: "20000000-0000-4000-8000-000000000001" }),
      }),
      await handoff.POST({ request: post("handoff", {}) }),
    ]) {
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "account_suspended" });
    }
    expect(rpc.mock.calls.every(([fn]) => fn === "is_restricted")).toBe(true);
  });

  it("a blocked (not banned) learner still gets Help: only the ban kind is checked", async () => {
    const res = await conversation.GET({ request: req("conversation") });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("is_restricted", { p_user: SESSION, p_kind: "ban" });
  });
});

describe("input", () => {
  it("rejects a body that is not JSON, and a body that fails the schema, before any write", async () => {
    expect((await message.POST({ request: post("message", "{nope") })).status).toBe(400);
    expect((await message.POST({ request: post("message", { text: "hi" }) })).status).toBe(400);
    expect(
      rpc.mock.calls.some(
        ([fn]) => String(fn).startsWith("support_add") || fn === "support_open_conversation",
      ),
    ).toBe(false);
  });
});

describe("the learner is the session's user, never the body's", () => {
  it("every support_* call carries the session id, even when the body names another learner and conversation", async () => {
    const res = await message.POST({
      request: post("message", {
        text: "How do I restore Pro?",
        clientId: "20000000-0000-4000-8000-000000000002",
        userId: OTHER,
        user_id: OTHER,
        p_user: OTHER,
        conversationId: "someone-elses",
        author_kind: "staff",
      }),
    });
    expect(res.status).toBe(200);
    const supportCalls = rpc.mock.calls.filter(([fn]) => String(fn).startsWith("support_"));
    expect(supportCalls.length).toBeGreaterThan(0);
    for (const [fn, args] of supportCalls) {
      const a = args as Record<string, unknown>;
      if ("p_user" in a) expect(a.p_user, String(fn)).toBe(SESSION);
      expect(JSON.stringify(a), String(fn)).not.toContain(OTHER);
      expect(JSON.stringify(a), String(fn)).not.toContain("someone-elses");
    }
    // The learner message went in as a learner message through the one function that makes them.
    expect(rpc).toHaveBeenCalledWith("support_add_learner_message", {
      p_user: SESSION,
      p_conversation: "conv-1",
      p_body: "How do I restore Pro?",
      p_client_id: "20000000-0000-4000-8000-000000000002",
    });
  });

  it("the channel comes from the X-Client header, else web", async () => {
    await message.POST({
      request: new Request("https://example.com/api/support/message", {
        method: "POST",
        headers: {
          Authorization: "Bearer good-token",
          "Content-Type": "application/json",
          "X-Client": "ios",
        },
        body: JSON.stringify({ text: "hi", clientId: "20000000-0000-4000-8000-000000000003" }),
      }),
    });
    expect(rpc).toHaveBeenCalledWith("support_open_conversation", {
      p_user: SESSION,
      p_channel: "ios",
    });
  });
});

describe("the database cap errors reach the learner as a plain 429", () => {
  it("support_daily_cap from the function", async () => {
    const base = rpc.getMockImplementation()!;
    rpc.mockImplementation(async (fn: string, args: unknown) =>
      fn === "support_add_learner_message"
        ? { data: null, error: { message: "support_daily_cap" } }
        : base(fn, args),
    );
    const res = await message.POST({
      request: post("message", { text: "hi", clientId: "20000000-0000-4000-8000-000000000004" }),
    });
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("support-message-limit");
  });
});

describe("production runtime: logs", () => {
  it("a failing provider is logged by status only, never its body or the learner's text", async () => {
    const lines: string[] = [];
    for (const m of ["log", "info", "warn", "error"] as const) {
      vi.spyOn(console, m).mockImplementation(
        (...a: unknown[]) => void lines.push(a.map(String).join(" ")),
      );
    }
    process.env.OPENROUTER_API_KEY = "test-key-not-real";
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(
      async () =>
        new Response("provider says: SENTINEL-PROVIDER-BODY learner@example.org", { status: 500 }),
    ) as never;
    // The conversation is with the AI so the model is reached.
    from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "gt", "order", "limit"]) q[m] = () => q;
      q.maybeSingle = async () => ({
        data: table === "support_conversations" ? { status: "ai" } : null,
        error: null,
      });
      q.then = (res: (v: unknown) => unknown) => res({ data: [], error: null });
      return q;
    });
    try {
      const res = await message.POST({
        request: post("message", {
          text: "SENTINEL-LEARNER-TEXT learner@example.org",
          clientId: "20000000-0000-4000-8000-000000000005",
        }),
      });
      expect(res.status).toBe(200);
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.OPENROUTER_API_KEY;
    }
    const all = lines.join("\n");
    expect(all).toMatch(/provider returned 500/);
    for (const secret of [
      "SENTINEL-PROVIDER-BODY",
      "SENTINEL-LEARNER-TEXT",
      "learner@example.org",
      SESSION,
      "conv-1",
    ]) {
      expect(all, secret).not.toContain(secret);
    }
  });
});
