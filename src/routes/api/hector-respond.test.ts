import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import { AI_OUTPUT_FALLBACK, SAFETY_PREAMBLE } from "@/lib/ai-safety";

const getUser = vi.fn();
const blockedRpc = vi.fn(async (_fn: string, args: { _texts: string[] }) => ({
  data: args._texts.map(() => false),
  error: null,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { auth: { getUser }, rpc: blockedRpc },
}));

const requireAiConsent = vi.fn();
vi.mock("@/lib/ai-consent.server", () => ({ requireAiConsent }));

const revenueCatConfigFromEnv = vi.fn();
const isProSubscriber = vi.fn();
vi.mock("@/lib/revenuecat-entitlement", () => ({ revenueCatConfigFromEnv, isProSubscriber }));

const consumeQuota = vi.fn();
vi.mock("@/lib/ai-quota.server", () => ({ consumeQuota }));

const { Route } = await import("./hector-respond");
const handler = (
  Route.options.server!.handlers as unknown as {
    POST: (opts: { request: Request }) => Promise<Response>;
  }
).POST;

function req(body: unknown = { text: "hola", language: "en" }, authorization = "Bearer token-123") {
  return new Request("https://example.com/api/hector-respond", {
    method: "POST",
    headers: {
      ...(authorization ? { Authorization: authorization } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

const realFetch = globalThis.fetch;

beforeEach(() => {
  getUser.mockReset();
  revenueCatConfigFromEnv.mockReset();
  isProSubscriber.mockReset();
  consumeQuota.mockReset();
  requireAiConsent.mockReset();
  requireAiConsent.mockResolvedValue(null);
  blockedRpc.mockClear();
  process.env.NVIDIA_API_KEY = "nv_test";
  process.env.DEEPGRAM_API_KEY = "dg_test";
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  revenueCatConfigFromEnv.mockReturnValue({ secretApiKey: "sk_test" });
  isProSubscriber.mockResolvedValue(true);
  consumeQuota.mockResolvedValue({ ok: true });
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("POST /api/hector-respond", () => {
  it("returns 500 when the AI providers are not configured", async () => {
    delete process.env.NVIDIA_API_KEY;
    const res = await handler({ request: req() });
    expect(res.status).toBe(500);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("rejects a request with no Authorization header (401)", async () => {
    const res = await handler({ request: req(undefined, "") });
    expect(res.status).toBe(401);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("rejects an invalid or expired token (401)", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error("invalid") });
    const res = await handler({ request: req() });
    expect(res.status).toBe(401);
  });

  it("fails closed (403) when RevenueCat is not configured, not open", async () => {
    revenueCatConfigFromEnv.mockReturnValue(null);
    const res = await handler({ request: req() });
    expect(res.status).toBe(403);
    // Must not have proceeded to a tutor turn.
    expect(isProSubscriber).not.toHaveBeenCalled();
  });

  it("refuses a non-Pro subscriber (403) -- the authorization gate itself", async () => {
    isProSubscriber.mockResolvedValue(false);
    const res = await handler({ request: req() });
    expect(res.status).toBe(403);
  });

  it("returns text required (400) for an empty utterance", async () => {
    const res = await handler({ request: req({ text: "  ", language: "en" }) });
    expect(res.status).toBe(400);
  });

  it("returns a TutorReply with the exact keys the iOS client decodes", async () => {
    // NVIDIA reply, then Deepgram audio, in call order.
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ message: { content: "¡Hola! ¿Cómo estás?" } }] }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 })) as never;

    const res = await handler({ request: req({ text: "hi", language: "en", session_id: "s1" }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      [
        "agent",
        "audio_base64",
        "language",
        "reply",
        "request_id",
        "session_id",
        "state",
        "timings_ms",
        "tts_model",
        "tts_provider",
      ].sort(),
    );
    expect(body.reply).toBe("¡Hola! ¿Cómo estás?");
    expect(body.session_id).toBe("s1");
    expect(body.tts_provider).toBe("deepgram");
    expect(typeof body.audio_base64).toBe("string");
  });

  describe("stage timing (BACKLOG 0.0-z #3: slow replies must be attributable)", () => {
    function mockProviders() {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ choices: [{ message: { content: "Hello!" } }] }), {
            status: 200,
          }),
        )
        .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 })) as never;
    }

    it("reports every stage of a successful turn in a Server-Timing header", async () => {
      mockProviders();
      const res = await handler({ request: req() });
      expect(res.status).toBe(200);
      const header = res.headers.get("Server-Timing") ?? "";
      const names = header.split(",").map((p) => p.trim().split(";")[0]);
      expect(names).toEqual(["auth", "entitlement", "quota", "llm", "tts", "total"]);
    });

    it("writes one [ai-timing] log line with the route, status and stages", async () => {
      mockProviders();
      const info = vi.spyOn(console, "info").mockImplementation(() => {});
      try {
        await handler({ request: req() });
        const lines = info.mock.calls
          .map((c) => String(c[0]))
          .filter((l) => l.startsWith("[ai-timing]"));
        expect(lines).toHaveLength(1);
        expect(lines[0]).toMatch(
          /^\[ai-timing\] route=hector-respond status=200 total=\d+ms auth=\d+ms entitlement=\d+ms quota=\d+ms llm=\d+ms tts=\d+ms$/,
        );
      } finally {
        info.mockRestore();
      }
    });

    it("still times and logs a turn that fails at the LLM, with the failing status", async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(new Response("upstream down", { status: 500 })) as never;
      const info = vi.spyOn(console, "info").mockImplementation(() => {});
      try {
        const res = await handler({ request: req() });
        expect(res.status).not.toBe(200);
        expect(res.headers.get("Server-Timing")).toContain("llm;dur=");
        const line = info.mock.calls
          .map((c) => String(c[0]))
          .find((l) => l.startsWith("[ai-timing]"));
        expect(line).toContain(`status=${res.status}`);
        expect(line).toContain("llm=");
        expect(line).not.toContain("tts=");
      } finally {
        info.mockRestore();
      }
    });

    it("does not add any timing fields to the JSON body the iOS client decodes", async () => {
      mockProviders();
      const res = await handler({ request: req() });
      const body = (await res.json()) as Record<string, unknown>;
      expect(Object.keys(body)).not.toContain("auth");
      expect(Object.keys(body)).not.toContain("server_timing");
    });
  });

  it("refuses with 403 ai-consent-required before entitlement and quota, and calls no vendor", async () => {
    requireAiConsent.mockResolvedValue(
      Response.json({ error: "ai-consent-required" }, { status: 403 }),
    );
    globalThis.fetch = vi.fn() as never;
    const res = await handler({ request: req() });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "ai-consent-required" });
    expect(requireAiConsent).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ route: "hector-respond" }),
    );
    expect(isProSubscriber).not.toHaveBeenCalled();
    expect(consumeQuota).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("sends the persona with the safety preamble", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: "Hello!" } }] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 })) as never;
    await handler({ request: req() });
    const sent = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(sent.messages[0].content.endsWith(SAFETY_PREAMBLE)).toBe(true);
  });

  it("never speaks or returns a blocked reply: the fallback replaces it before TTS", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    blockedRpc.mockResolvedValueOnce({ data: [true], error: null });
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: "something bad" } }] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 })) as never;
    const res = await handler({ request: req() });
    const body = (await res.json()) as { reply: string };
    expect(body.reply).toBe(AI_OUTPUT_FALLBACK.en);
    const ttsBody = JSON.parse(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].body,
    );
    expect(ttsBody).toEqual({ text: AI_OUTPUT_FALLBACK.en });
  });
});
