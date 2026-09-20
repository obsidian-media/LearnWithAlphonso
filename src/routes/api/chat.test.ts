import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const consumeQuota = vi.fn();
vi.mock("@/lib/ai-quota.server", () => ({ consumeQuota }));

const { Route } = await import("./chat");
const handler = (
  Route.options.server!.handlers as unknown as {
    POST: (opts: { request: Request }) => Promise<Response>;
  }
).POST;

function req(body: unknown) {
  return new Request("https://example.com/api/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const originalFetch = global.fetch;

beforeEach(() => {
  consumeQuota.mockReset();
  consumeQuota.mockResolvedValue({ ok: true, used: 1, limit: 60 });
  process.env.NVIDIA_API_KEY = "test-key";
  global.fetch = vi.fn();
});

afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.NVIDIA_CHAT_MODEL;
});

describe("POST /api/chat", () => {
  it("returns 500 when NVIDIA_API_KEY is not configured", async () => {
    delete process.env.NVIDIA_API_KEY;
    const res = await handler({ request: req({ messages: [{ role: "user", content: "hi" }] }) });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Chat is not configured" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns the quota error status/message when quota is exceeded", async () => {
    consumeQuota.mockResolvedValue({ ok: false, status: 429, message: "Daily CHAT limit reached" });
    const res = await handler({ request: req({ messages: [{ role: "user", content: "hi" }] }) });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Daily CHAT limit reached" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON bodies", async () => {
    const badReq = new Request("https://example.com/api/chat", {
      method: "POST",
      body: "{not json",
    });
    const res = await handler({ request: badReq });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON" });
  });

  it("returns 400 when messages is missing or empty", async () => {
    const res = await handler({ request: req({ messages: [] }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "messages required" });
  });

  it("prepends a system prompt when provided", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "hello!" } }] }), {
        status: 200,
      }),
    );
    const res = await handler({
      request: req({ systemPrompt: "Be nice", messages: [{ role: "user", content: "hi" }] }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ content: "hello!" });

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.messages).toEqual([
      { role: "system", content: "Be nice" },
      { role: "user", content: "hi" },
    ]);
  });

  it("appends a CEFR difficulty hint after the scenario's system prompt when cefrLevel is provided", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "hello!" } }] }), {
        status: 200,
      }),
    );
    await handler({
      request: req({
        systemPrompt: "You are Mia, a barista.",
        cefrLevel: "A1",
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.messages[0].content).toContain("You are Mia, a barista.");
    expect(sentBody.messages[0].content).toContain("CEFR A1");
  });

  it("ignores an unrecognized cefrLevel and sends the system prompt unchanged", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "hello!" } }] }), {
        status: 200,
      }),
    );
    await handler({
      request: req({
        systemPrompt: "Be nice",
        cefrLevel: "not-a-real-level",
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.messages[0].content).toBe("Be nice");
  });

  it("uses NVIDIA_CHAT_MODEL override when set", async () => {
    process.env.NVIDIA_CHAT_MODEL = "custom/model";
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 }),
    );
    await handler({ request: req({ messages: [{ role: "user", content: "hi" }] }) });
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body as string).model).toBe("custom/model");
  });

  it("returns empty content when the upstream response has no choices", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    const res = await handler({ request: req({ messages: [{ role: "user", content: "hi" }] }) });
    expect(await res.json()).toEqual({ content: "" });
  });

  it("maps a 429 upstream failure to a rate-limited message", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("rate limited by nvidia", { status: 429 }),
    );
    const res = await handler({ request: req({ messages: [{ role: "user", content: "hi" }] }) });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Rate limited, please try again shortly" });
  });

  it("maps a non-429 upstream failure to a generic error", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("boom", { status: 502 }),
    );
    const res = await handler({ request: req({ messages: [{ role: "user", content: "hi" }] }) });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Request failed" });
  });
});
