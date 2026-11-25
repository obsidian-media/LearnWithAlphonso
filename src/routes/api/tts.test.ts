import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const blockedRpc = vi.fn(async (_fn: string, args: { _texts: string[] }) => ({
  data: args._texts.map(() => false),
  error: null,
}));
const authorizeAiRequest = vi.fn();
vi.mock("@/lib/ai-consent.server", () => ({ authorizeAiRequest }));

const { Route } = await import("./tts");
const handler = (
  Route.options.server!.handlers as unknown as {
    POST: (opts: { request: Request }) => Promise<Response>;
  }
).POST;

function req(body: unknown) {
  return new Request("https://example.com/api/tts", { method: "POST", body: JSON.stringify(body) });
}

const CONSENT_REQUEST = () => req({ text: "hi" });

const originalFetch = global.fetch;

beforeEach(() => {
  authorizeAiRequest.mockReset();
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

describe("POST /api/tts", () => {
  it("returns 500 when DEEPGRAM_API_KEY is not configured", async () => {
    delete process.env.DEEPGRAM_API_KEY;
    const res = await handler({ request: req({ text: "hi" }) });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "TTS is not configured" });
  });

  it("returns the quota error when quota is exceeded", async () => {
    authorizeAiRequest.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Daily TTS limit reached" }, { status: 429 }),
    });
    const res = await handler({ request: req({ text: "hi" }) });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Daily TTS limit reached" });
  });

  it("returns 400 for invalid JSON", async () => {
    const res = await handler({
      request: new Request("https://example.com/api/tts", { method: "POST", body: "{bad" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON" });
  });

  it("rejects empty or whitespace-only text", async () => {
    const res = await handler({ request: req({ text: "   " }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "text required" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("uses Alphonso's English default when no voice or course is provided", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("audio-bytes", { status: 200, headers: { "Content-Type": "audio/mpeg" } }),
    );
    await handler({ request: req({ text: "hello" }) });
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain(encodeURIComponent("aura-2-saturn-en"));
    expect(url).toContain("mip_opt_out=true");
  });

  it("uses a caller-provided voice that is on the allow-list", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("audio-bytes", { status: 200, headers: { "Content-Type": "audio/mpeg" } }),
    );
    await handler({ request: req({ text: "hello", voice: "aura-2-orpheus-en", course: "en" }) });
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain(encodeURIComponent("aura-2-orpheus-en"));
  });

  it("refuses a real Aura-2 voice that is not on the allow-list (zeus) and uses the default", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("audio-bytes", { status: 200, headers: { "Content-Type": "audio/mpeg" } }),
    );
    await handler({ request: req({ text: "hello", voice: "aura-2-zeus-en", course: "en" }) });
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain("model=aura-2-saturn-en");
  });

  it("refuses text over the 600-character cap and calls no vendor", async () => {
    const res = await handler({ request: req({ text: "a".repeat(601) }) });
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: string }).error).toBe("text-too-long");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("speaks text of exactly the cap, whole", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("audio-bytes", { status: 200, headers: { "Content-Type": "audio/mpeg" } }),
    );
    const res = await handler({ request: req({ text: "a".repeat(600) }) });
    expect(res.status).toBe(200);
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body as string).text).toHaveLength(600);
  });

  it("streams back the audio body with the upstream content type", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("audio-bytes", { status: 200, headers: { "Content-Type": "audio/mpeg" } }),
    );
    const res = await handler({ request: req({ text: "hello" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).toBe("audio-bytes");
  });

  it("falls back to audio/mpeg when upstream omits Content-Type", async () => {
    // A string body would make Response default Content-Type to
    // text/plain; an ArrayBuffer body carries no implicit type, matching
    // the "upstream sent no header" case this test targets.
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(new TextEncoder().encode("audio-bytes").buffer, { status: 200 }),
    );
    const res = await handler({ request: req({ text: "hello" }) });
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
  });

  it("maps an upstream Deepgram failure to a generic error", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("bad", { status: 500 }),
    );
    const res = await handler({ request: req({ text: "hello" }) });
    expect(res.status).toBe(500);
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
    expect(authorizeAiRequest).toHaveBeenCalledWith(expect.any(Request), "tts", { route: "tts" });
  });

  it("speaks a French course with Alphonso's French default", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("mp3", { status: 200 }),
    );
    await handler({ request: req({ text: "Bonjour", course: "fr" }) });
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(url)).toContain("model=aura-2-hector-fr");
    expect(String(url)).toContain("mip_opt_out=true");
  });

  it("speaks a Spanish course with Alphonso's Spanish default", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("mp3", { status: 200 }),
    );
    await handler({ request: req({ text: "Hola", course: "es" }) });
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(url)).toContain("model=aura-2-javier-es");
  });

  it("refuses a voice from another course's allow-list, and ignores an unknown course", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("mp3", { status: 200 }),
    );
    await handler({ request: req({ text: "x", voice: "aura-2-hector-fr", course: "es" }) });
    await handler({ request: req({ text: "x", course: "de" }) });
    await handler({ request: req({ text: "x", voice: "aura-2-agathe-fr" }) });
    const urls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map(([u]) => String(u));
    expect(urls[0]).toContain("model=aura-2-javier-es");
    expect(urls[1]).toContain("model=aura-2-saturn-en");
    // A voice-only request (no course) is checked against its own language's list.
    expect(urls[2]).toContain("model=aura-2-agathe-fr");
  });

  it("uses Hector's default when the caller names Hector and sends no allowed voice", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("mp3", { status: 200 }),
    );
    await handler({ request: req({ text: "x", course: "es", character: "hector" }) });
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(url)).toContain("model=aura-2-alvaro-es");
  });

  it.each([
    "aura-asteria-en",
    "aura-2-thalia-de",
    "some-premium-model",
    "aura-2-x-en&model=y",
    "aura-2-valentina-es",
  ])("ignores a voice outside the allow-list (%s) and uses the course default", async (voice) => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("mp3", { status: 200 }),
    );
    await handler({ request: req({ text: "Hola", voice, course: "es" }) });
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(url)).toContain("model=aura-2-javier-es");
  });

  it("gives up with a retryable 504 when the speech provider does not answer in time", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    let sent: RequestInit | undefined;
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      async (_url: string, init?: RequestInit) => {
        sent = init;
        throw new DOMException("timed out", "TimeoutError");
      },
    );
    const res = await handler({ request: req({ text: "hi" }) });
    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ error: "speech-unavailable" });
    expect(timeout).toHaveBeenCalledWith(30_000);
    expect(sent?.signal).toBeInstanceOf(AbortSignal);
    timeout.mockRestore();
  });
});

describe("POST /api/tts with a Hector turn token", () => {
  const REPLY = "Very good, you did it! Now tell me what you ate.";
  const turnReq = (token: string, part: number | string, body: unknown = { text: REPLY }) =>
    new Request(`https://example.com/api/tts?turn=${encodeURIComponent(token)}&part=${part}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  const audio = () =>
    new Response("audio-bytes", { status: 200, headers: { "Content-Type": "audio/mpeg" } });

  beforeEach(() => {
    process.env.LESSON_SESSION_SECRET = "test-secret";
  });
  afterEach(() => {
    delete process.env.LESSON_SESSION_SECRET;
  });

  it("speaks one part of exactly that reply, and does not spend a second quota unit", async () => {
    const { issueHectorTurnToken } = await import("@/lib/hector-turn-token.server");
    const chargeQuota = vi.fn(async () => null);
    authorizeAiRequest.mockResolvedValue({ ok: true, userId: "user-1", chargeQuota });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(audio());
    const token = issueHectorTurnToken("user-1", REPLY);

    const res = await handler({ request: turnReq(token, 0) });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("audio-bytes");
    // Deferred, and never charged: the turn already spent Hector's allowance.
    expect(authorizeAiRequest.mock.calls[0]![2]).toMatchObject({ route: "tts", deferQuota: true });
    expect(chargeQuota).not.toHaveBeenCalled();
    // The first part only: the first sentence, not the whole reply.
    const sent = JSON.parse(
      String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1].body),
    );
    expect(sent).toEqual({ text: "Very good, you did it!" });
  });

  it("part 1 is the rest of the reply", async () => {
    const { issueHectorTurnToken } = await import("@/lib/hector-turn-token.server");
    authorizeAiRequest.mockResolvedValue({ ok: true, userId: "user-1", chargeQuota: vi.fn() });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(audio());
    const res = await handler({ request: turnReq(issueHectorTurnToken("user-1", REPLY), 1) });
    expect(res.status).toBe(200);
    const sent = JSON.parse(
      String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1].body),
    );
    expect(sent).toEqual({ text: "Now tell me what you ate." });
  });

  it("refuses a token for another user, another text, a missing token and a bad part, calling no vendor", async () => {
    const { issueHectorTurnToken } = await import("@/lib/hector-turn-token.server");
    authorizeAiRequest.mockResolvedValue({ ok: true, userId: "user-1", chargeQuota: vi.fn() });
    const other = issueHectorTurnToken("user-2", REPLY);
    expect((await handler({ request: turnReq(other, 0) })).status).toBe(403);
    const mine = issueHectorTurnToken("user-1", REPLY);
    expect(
      (await handler({ request: turnReq(mine, 0, { text: `${REPLY} Extra words.` }) })).status,
    ).toBe(403);
    expect((await handler({ request: turnReq("", 0) })).status).toBe(403);
    expect((await handler({ request: turnReq(mine, 2) })).status).toBe(400);
    expect((await handler({ request: turnReq(mine, "x") })).status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("an expired token is refused", async () => {
    const { issueHectorTurnToken } = await import("@/lib/hector-turn-token.server");
    authorizeAiRequest.mockResolvedValue({ ok: true, userId: "user-1", chargeQuota: vi.fn() });
    const old = issueHectorTurnToken("user-1", REPLY, Date.now() - 10 * 60_000);
    expect((await handler({ request: turnReq(old, 0) })).status).toBe(403);
  });

  it("a plain request still charges quota up front and is capped at 600 characters", async () => {
    const res = await handler({ request: req({ text: "x".repeat(601) }) });
    expect(res.status).toBe(413);
    expect(authorizeAiRequest.mock.calls[0]![2]).toEqual({ route: "tts" });
  });

  it("never stores a turn's speech in the shared cache and streams the body through", async () => {
    const { issueHectorTurnToken } = await import("@/lib/hector-turn-token.server");
    authorizeAiRequest.mockResolvedValue({ ok: true, userId: "user-1", chargeQuota: vi.fn() });
    const upstream = audio();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(upstream);
    const res = await handler({ request: turnReq(issueHectorTurnToken("user-1", REPLY), 0) });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Server-Timing")).toMatch(
      /auth;dur=\d+.*deepgram;dur=\d+.*total;dur=\d+/,
    );
  });
});
