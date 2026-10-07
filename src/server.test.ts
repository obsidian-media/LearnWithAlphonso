import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./lib/error-capture", () => ({ consumeLastCapturedError: vi.fn(() => null) }));

const renderErrorPage = vi.fn(() => "<html>error</html>");
vi.mock("./lib/error-page", () => ({ renderErrorPage }));

const entryFetch = vi.fn();
vi.mock("@tanstack/react-start/server-entry", () => ({ default: { fetch: entryFetch } }));

const { default: server } = await import("./server");

beforeEach(() => {
  renderErrorPage.mockClear();
  entryFetch.mockReset();
});

describe("server.ts fetch handler", () => {
  it("passes through a normal successful response", async () => {
    const ok = new Response("hi", { status: 200 });
    entryFetch.mockResolvedValue(ok);
    const result = await server.fetch(new Request("https://x"), {}, {});
    expect(result).toBe(ok);
  });

  it("passes through a 500 that isn't JSON", async () => {
    const resp = new Response("Internal Server Error", { status: 500 });
    entryFetch.mockResolvedValue(resp);
    const result = await server.fetch(new Request("https://x"), {}, {});
    expect(result).toBe(resp);
  });

  it("passes through a JSON 500 that isn't the h3-swallowed shape", async () => {
    const resp = new Response(JSON.stringify({ message: "Some other error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
    entryFetch.mockResolvedValue(resp);
    const result = await server.fetch(new Request("https://x"), {}, {});
    expect(result).toBe(resp);
  });

  it("replaces an h3-swallowed error body with the rendered error page", async () => {
    const resp = new Response(JSON.stringify({ unhandled: true, message: "HTTPError" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
    entryFetch.mockResolvedValue(resp);
    const result = await server.fetch(new Request("https://x"), {}, {});
    expect(result.status).toBe(500);
    expect(result.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await result.text()).toBe("<html>error</html>");
  });

  it("returns the rendered error page when the handler itself throws", async () => {
    entryFetch.mockRejectedValue(new Error("fatal"));
    const result = await server.fetch(new Request("https://x"), {}, {});
    expect(result.status).toBe(500);
    expect(await result.text()).toBe("<html>error</html>");
  });
  it("escapes raw NUL bytes in HTML so the document is not binary, and drops content-length", async () => {
    const raw = '<script>$R={i:"\u0000terms\u0000terms"}</script>';
    entryFetch.mockResolvedValue(
      new Response(raw, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-length": String(raw.length),
        },
      }),
    );
    const result = await server.fetch(new Request("https://x/terms"), {}, {});
    const bytes = new Uint8Array(await result.arrayBuffer());
    expect(bytes.includes(0)).toBe(false);
    expect(new TextDecoder().decode(bytes)).toBe(
      '<script>$R={i:"\\u0000terms\\u0000terms"}</script>',
    );
    expect(result.headers.get("content-length")).toBeNull();
    expect(result.status).toBe(200);
  });

  it("keeps the JavaScript value identical: the escaped literal evaluates to the original string", async () => {
    entryFetch.mockResolvedValue(
      new Response('"\u0000terms\u0000terms"', { headers: { "content-type": "text/html" } }),
    );
    const escaped = await (await server.fetch(new Request("https://x/terms"), {}, {})).text();
    expect(new Function(`return ${escaped};`)()).toBe("\u0000terms\u0000terms");
  });

  it("escapes NULs split across stream chunks", async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('<p>a"\u0000'));
        c.enqueue(enc.encode('\u0000b"</p>'));
        c.close();
      },
    });
    entryFetch.mockResolvedValue(new Response(body, { headers: { "content-type": "text/html" } }));
    const text = await (await server.fetch(new Request("https://x/"), {}, {})).text();
    expect(text).toBe('<p>a"\\u0000\\u0000b"</p>');
  });

  it("returns non-HTML responses as the same object", async () => {
    const resp = new Response("a\u0000b", {
      headers: { "content-type": "application/octet-stream" },
    });
    entryFetch.mockResolvedValue(resp);
    expect(await server.fetch(new Request("https://x/file"), {}, {})).toBe(resp);
  });
});
