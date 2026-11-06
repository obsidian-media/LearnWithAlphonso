import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const blockedRpc = vi.fn(async (_fn: string, args: { _texts: string[] }) => ({
  data: args._texts.map(() => false),
  error: null,
}));
const authorizeAiRequest = vi.fn();
vi.mock("@/lib/ai-consent.server", () => ({ authorizeAiRequest }));
// Voice time budget (20261105100900): read and charged with the service role.
let secondsUsed = 0;
type RpcReply = { data: number | null; error: { message: string } | null };
const adminRpc = vi.fn(
  async (fn: string, args: { _user_id: string; _seconds?: number }): Promise<RpcReply> => {
    if (fn === "stt_audio_seconds_used") return { data: secondsUsed, error: null };
    if (fn === "add_stt_audio_seconds") {
      secondsUsed += args._seconds ?? 0;
      return { data: secondsUsed, error: null };
    }
    throw new Error(`unexpected rpc ${fn}`);
  },
);
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: adminRpc } }));

const { Route } = await import("./stt");
const handler = (
  Route.options.server!.handlers as unknown as {
    POST: (opts: { request: Request }) => Promise<Response>;
  }
).POST;

function reqWithFile(file: Blob | null, course?: string, debugTiming?: string) {
  const form = new FormData();
  if (file) form.set("file", file, "audio.webm");
  if (course !== undefined) form.set("course", course);
  if (debugTiming !== undefined) form.set("debugTiming", debugTiming);
  return new Request("https://example.com/api/stt", { method: "POST", body: form });
}

const CONSENT_REQUEST = () => reqWithFile(new Blob(["x".repeat(600)]));

const originalFetch = global.fetch;

beforeEach(() => {
  authorizeAiRequest.mockReset();
  adminRpc.mockClear();
  secondsUsed = 0;
  delete process.env.STT_DAILY_AUDIO_SECONDS;
  delete process.env.STT_MAX_CALL_SECONDS;
  blockedRpc.mockClear();
  authorizeAiRequest.mockResolvedValue({
    ok: true,
    userId: "user-1",
    supabase: { rpc: blockedRpc, from: vi.fn() },
  });
  process.env.DEEPGRAM_API_KEY = "test-key";
  global.fetch = vi.fn();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("POST /api/stt", () => {
  it("returns 500 when DEEPGRAM_API_KEY is not configured", async () => {
    delete process.env.DEEPGRAM_API_KEY;
    const res = await handler({ request: reqWithFile(new Blob(["x".repeat(600)])) });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "STT is not configured" });
  });

  it("returns the quota error when quota is exceeded", async () => {
    authorizeAiRequest.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Daily STT limit reached" }, { status: 429 }),
    });
    const res = await handler({ request: reqWithFile(new Blob(["x".repeat(600)])) });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Daily STT limit reached" });
  });

  it("rejects a request with no file field", async () => {
    const res = await handler({ request: reqWithFile(null) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Empty or missing audio" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects audio under the minimum size", async () => {
    const res = await handler({ request: reqWithFile(new Blob(["short"])) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Empty or missing audio" });
  });

  it("rejects audio over 1 MB with 413 and calls no provider", async () => {
    const res = await handler({ request: reqWithFile(new Blob([new Uint8Array(1_000_001)])) });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "audio-too-long" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("still transcribes a recording of exactly 1 MB (about 80 s of the apps' audio)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(
        JSON.stringify({ results: { channels: [{ alternatives: [{ transcript: "ok" }] }] } }),
        { status: 200 },
      ),
    );
    const res = await handler({ request: reqWithFile(new Blob([new Uint8Array(1_000_000)])) });
    expect(res.status).toBe(200);
  });

  it("rejects a request body that isn't form data", async () => {
    const res = await handler({
      request: new Request("https://example.com/api/stt", {
        method: "POST",
        body: "not form data",
      }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Empty or missing audio" });
  });

  it("sends the file's mime type through to Deepgram and returns the transcript", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(
        JSON.stringify({
          results: { channels: [{ alternatives: [{ transcript: "hello world" }] }] },
        }),
        { status: 200 },
      ),
    );
    const file = new Blob(["x".repeat(600)], { type: "audio/mp4" });
    const res = await handler({ request: reqWithFile(file) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "hello world", confidence: null });

    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("api.deepgram.com/v1/listen");
    // Deepgram must not keep the recording or use it to improve its models (the privacy policy says so).
    expect(url).toContain("mip_opt_out=true");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("audio/mp4");
  });

  // This bug lived in the request Deepgram never saw and nothing asserted on
  // -- every course's audio was silently transcribed as English (Deepgram
  // defaults every model to language=en when the parameter is omitted, and
  // this endpoint never set it). Pinning the actual outbound URL, not just
  // that a call was made, is what would have caught it originally.
  describe("forwards the right Deepgram language for the requesting course", () => {
    function okResponse() {
      return new Response(
        JSON.stringify({ results: { channels: [{ alternatives: [{ transcript: "x" }] }] } }),
        { status: 200 },
      );
    }

    it.each([
      ["fr", "fr"],
      ["es", "es"],
      ["en", "en"],
    ])("course=%s -> language=%s", async (course, expectedLanguage) => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(okResponse());
      await handler({ request: reqWithFile(new Blob(["x".repeat(600)]), course) });
      const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(new URL(url as string).searchParams.get("language")).toBe(expectedLanguage);
    });

    it("defaults to language=en when the caller sends no course (the conversation route today)", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(okResponse());
      await handler({ request: reqWithFile(new Blob(["x".repeat(600)])) });
      const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(new URL(url as string).searchParams.get("language")).toBe("en");
    });

    it("defaults to language=en rather than forwarding an unrecognised course string", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(okResponse());
      await handler({ request: reqWithFile(new Blob(["x".repeat(600)]), "klingon") });
      const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(new URL(url as string).searchParams.get("language")).toBe("en");
    });

    it("still requests model=nova-3, the model verified to support fr/es/en", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(okResponse());
      await handler({ request: reqWithFile(new Blob(["x".repeat(600)]), "fr") });
      const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(new URL(url as string).searchParams.get("model")).toBe("nova-3");
    });
  });

  it("returns Deepgram's utterance-level confidence as a pronunciation-clarity heuristic", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(
        JSON.stringify({
          results: {
            channels: [{ alternatives: [{ transcript: "good morning", confidence: 0.93 }] }],
          },
        }),
        { status: 200 },
      ),
    );
    const res = await handler({ request: reqWithFile(new Blob(["x".repeat(600)])) });
    expect(await res.json()).toEqual({ text: "good morning", confidence: 0.93 });
  });

  it("falls back to audio/webm when the blob's type is falsy", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ results: { channels: [] } }), { status: 200 }),
    );
    // Real FormData round-tripping normalizes both an unset type and an
    // explicit `{ type: "" }` to "application/octet-stream" in this
    // runtime, so the empty-type case is exercised by stubbing
    // request.formData() directly instead. Needs a real Blob (not a
    // prototype-only stand-in) -- the route reads the body via
    // arrayBuffer(), which Node's Blob implementation refuses to run on
    // anything lacking its real internal data slot.
    const file = new Blob(["x".repeat(600)], { type: "" });
    const request = new Request("https://example.com/api/stt", { method: "POST" });
    request.formData = vi.fn().mockResolvedValue({ get: () => file });
    await handler({ request });
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("audio/webm");
  });

  it("still succeeds when an older iOS build sends the retired debugTiming field, and never logs it", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const logs = vi.spyOn(console, "log").mockImplementation(() => {});
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ results: { channels: [] } }), { status: 200 }),
    );
    const res = await handler({
      request: reqWithFile(new Blob(["x".repeat(600)]), "en", "press=0.10 capture=0.40"),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "", confidence: null });
    // An empty transcript is the case the retired diagnostics logged on.
    const written = JSON.stringify([...errors.mock.calls, ...logs.mock.calls]);
    expect(written).not.toMatch(/debugTiming|press=0.10|boxes/);
    errors.mockRestore();
    logs.mockRestore();
  });

  it("returns empty text when Deepgram finds no alternatives", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ results: { channels: [] } }), { status: 200 }),
    );
    const res = await handler({ request: reqWithFile(new Blob(["x".repeat(600)])) });
    expect(await res.json()).toEqual({ text: "", confidence: null });
  });

  it("maps an upstream Deepgram failure to a generic error", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("bad request", { status: 400 }),
    );
    const res = await handler({ request: reqWithFile(new Blob(["x".repeat(600)])) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Request failed" });
  });

  it("refuses with 403 ai-consent-required and calls no vendor without consent", async () => {
    authorizeAiRequest.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "ai-consent-required" }, { status: 403 }),
    });
    const res = await handler({ request: CONSENT_REQUEST() });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "ai-consent-required" });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(authorizeAiRequest).toHaveBeenCalledWith(expect.any(Request), "stt", { route: "stt" });
  });

  it("gives up with a retryable 504 when the transcription provider does not answer in time", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    let sent: RequestInit | undefined;
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      async (_url: string, init?: RequestInit) => {
        sent = init;
        throw new DOMException("timed out", "TimeoutError");
      },
    );
    const res = await handler({ request: reqWithFile(new Blob(["x".repeat(600)])) });
    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ error: "transcription-unavailable" });
    expect(timeout).toHaveBeenCalledWith(20_000);
    expect(sent?.signal).toBeInstanceOf(AbortSignal);
    timeout.mockRestore();
  });

  describe("daily voice time", () => {
    const deepgram = (duration?: number) =>
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(
          JSON.stringify({
            metadata: duration === undefined ? {} : { duration },
            results: { channels: [{ alternatives: [{ transcript: "hi" }] }] },
          }),
          { status: 200 },
        ),
      );
    const charged = () =>
      adminRpc.mock.calls.filter(([fn]) => fn === "add_stt_audio_seconds").map(([, a]) => a);

    /** An .m4a whose mvhd says `seconds`, the shape iOS and Android upload. */
    function m4a(seconds: number) {
      const out = new Uint8Array(700);
      const v = new DataView(out.buffer);
      const put = (o: number, t: string) =>
        [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
      v.setUint32(0, 16);
      put(4, "ftyp");
      v.setUint32(16, 116);
      put(20, "moov");
      v.setUint32(24, 108);
      put(28, "mvhd");
      v.setUint32(44, 1000);
      v.setUint32(48, seconds * 1000);
      v.setUint32(132, 700 - 132);
      put(136, "mdat");
      return new Blob([out], { type: "audio/m4a" });
    }

    it("charges the length the provider reports, rounded up, to the caller", async () => {
      deepgram(12.2);
      const res = await handler({ request: CONSENT_REQUEST() });
      expect(res.status).toBe(200);
      expect(charged()).toEqual([{ _user_id: "user-1", _seconds: 13 }]);
    });

    it("still charges a caller who hangs up after the upload: the provider call is not tied to their connection", async () => {
      const caller = new AbortController();
      const form = new FormData();
      form.set("file", new Blob(["x".repeat(600)]), "audio.webm");
      const request = new Request("https://example.com/api/stt", {
        method: "POST",
        body: form,
        signal: caller.signal,
      });
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
        async (_url: string, init?: RequestInit) => {
          caller.abort(); // the caller hangs up while the provider is transcribing
          if (init?.signal?.aborted) throw init.signal.reason; // what a real fetch does
          return new Response(JSON.stringify({ metadata: { duration: 600 }, results: {} }), {
            status: 200,
          });
        },
      );
      await handler({ request });
      expect(charged()).toEqual([{ _user_id: "user-1", _seconds: 600 }]);
    });

    it("charges the per-call maximum when the provider times out, since it already had the audio", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new DOMException("timed out", "TimeoutError"),
      );
      const res = await handler({ request: CONSENT_REQUEST() });
      expect(res.status).toBe(504);
      expect(charged()).toEqual([{ _user_id: "user-1", _seconds: 120 }]);
    });

    it("charges nothing when the provider could not be reached at all", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("fetch failed"));
      const res = await handler({ request: CONSENT_REQUEST() });
      expect(res.status).toBe(504);
      expect(charged()).toEqual([]);
    });

    it("charges the per-call maximum when a success answer cannot be read", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response("not json", { status: 200 }),
      );
      const res = await handler({ request: CONSENT_REQUEST() });
      expect(res.status).toBe(502);
      expect(charged()).toEqual([{ _user_id: "user-1", _seconds: 120 }]);
    });

    it("charges the per-call maximum when the provider reports no length", async () => {
      deepgram();
      await handler({ request: CONSENT_REQUEST() });
      expect(charged()).toEqual([{ _user_id: "user-1", _seconds: 120 }]);
    });

    it("charges a long recording in full and still returns its transcript", async () => {
      deepgram(1320);
      const res = await handler({ request: CONSENT_REQUEST() });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ text: "hi" });
      expect(charged()).toEqual([{ _user_id: "user-1", _seconds: 1320 }]);
    });

    it("refuses with the daily-limit 429 the apps already handle once 20 minutes are spent, and calls no provider", async () => {
      secondsUsed = 1200;
      const res = await handler({ request: CONSENT_REQUEST() });
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body).toMatchObject({ error: "quota-exceeded" });
      expect(typeof body.resetsAt).toBe("string");
      expect(body.message).toMatch(/voice/i);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(charged()).toEqual([]);
    });

    it("still transcribes with one second of the day left", async () => {
      secondsUsed = 1199;
      deepgram(30);
      expect((await handler({ request: CONSENT_REQUEST() })).status).toBe(200);
      expect(secondsUsed).toBe(1229);
      expect((await handler({ request: CONSENT_REQUEST() })).status).toBe(429);
    });

    it("reads the budget and the per-call maximum from the environment", async () => {
      process.env.STT_DAILY_AUDIO_SECONDS = "60";
      process.env.STT_MAX_CALL_SECONDS = "30";
      secondsUsed = 60;
      expect((await handler({ request: CONSENT_REQUEST() })).status).toBe(429);
      secondsUsed = 0;
      deepgram();
      await handler({ request: CONSENT_REQUEST() });
      expect(charged()).toEqual([{ _user_id: "user-1", _seconds: 30 }]);
    });

    it("refuses an .m4a whose header says it is over the per-call maximum, before calling the provider", async () => {
      const res = await handler({ request: reqWithFile(m4a(121)) });
      expect(res.status).toBe(413);
      expect(await res.json()).toEqual({ error: "audio-too-long" });
      expect(global.fetch).not.toHaveBeenCalled();
      deepgram(119);
      expect((await handler({ request: reqWithFile(m4a(119)) })).status).toBe(200);
    });

    it("fails closed when the day's usage cannot be read", async () => {
      adminRpc.mockImplementationOnce(async () => ({ data: null, error: { message: "down" } }));
      const res = await handler({ request: CONSENT_REQUEST() });
      expect(res.status).toBe(500);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("returns the transcript even when recording the seconds fails", async () => {
      deepgram(5);
      adminRpc
        .mockImplementationOnce(async () => ({ data: 0, error: null }))
        .mockImplementationOnce(async () => ({ data: null, error: { message: "down" } }));
      const res = await handler({ request: CONSENT_REQUEST() });
      expect(res.status).toBe(200);
    });
  });
});
