import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const consumeQuota = vi.fn();
vi.mock("@/lib/ai-quota.server", () => ({ consumeQuota }));

const { Route } = await import("./stt");
const handler = (
  Route.options.server!.handlers as unknown as {
    POST: (opts: { request: Request }) => Promise<Response>;
  }
).POST;

function reqWithFile(file: Blob | null) {
  const form = new FormData();
  if (file) form.set("file", file, "audio.webm");
  return new Request("https://example.com/api/stt", { method: "POST", body: form });
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

describe("POST /api/stt", () => {
  it("returns 500 when DEEPGRAM_API_KEY is not configured", async () => {
    delete process.env.DEEPGRAM_API_KEY;
    const res = await handler({ request: reqWithFile(new Blob(["x".repeat(600)])) });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "STT is not configured" });
  });

  it("returns the quota error when quota is exceeded", async () => {
    consumeQuota.mockResolvedValue({ ok: false, status: 429, message: "Daily STT limit reached" });
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
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("audio/mp4");
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
    // request.formData() directly with a Blob-shaped object that
    // reports "" without going through that normalization.
    const file = Object.create(Blob.prototype, {
      type: { value: "" },
      size: { value: 600 },
    });
    const request = new Request("https://example.com/api/stt", { method: "POST" });
    request.formData = vi.fn().mockResolvedValue({ get: () => file });
    await handler({ request });
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("audio/webm");
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
});
