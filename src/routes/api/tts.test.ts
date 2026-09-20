import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const consumeQuota = vi.fn();
vi.mock("@/lib/ai-quota.server", () => ({ consumeQuota }));

const { Route } = await import("./tts");
const handler = (
  Route.options.server!.handlers as unknown as {
    POST: (opts: { request: Request }) => Promise<Response>;
  }
).POST;

function req(body: unknown) {
  return new Request("https://example.com/api/tts", { method: "POST", body: JSON.stringify(body) });
}

const originalFetch = global.fetch;

beforeEach(() => {
  consumeQuota.mockReset();
  consumeQuota.mockResolvedValue({ ok: true, used: 1, limit: 60 });
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
    consumeQuota.mockResolvedValue({ ok: false, status: 429, message: "Daily TTS limit reached" });
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

  it("uses the default voice model when none is provided", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("audio-bytes", { status: 200, headers: { "Content-Type": "audio/mpeg" } }),
    );
    await handler({ request: req({ text: "hello" }) });
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain(encodeURIComponent("aura-2-thalia-en"));
  });

  it("uses a caller-provided voice model", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("audio-bytes", { status: 200, headers: { "Content-Type": "audio/mpeg" } }),
    );
    await handler({ request: req({ text: "hello", voice: "aura-2-zeus-en" }) });
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain(encodeURIComponent("aura-2-zeus-en"));
  });

  it("truncates text to 2000 characters before sending upstream", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("audio-bytes", { status: 200, headers: { "Content-Type": "audio/mpeg" } }),
    );
    const longText = "a".repeat(3000);
    await handler({ request: req({ text: longText }) });
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.text).toHaveLength(2000);
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
});
