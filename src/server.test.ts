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
});
