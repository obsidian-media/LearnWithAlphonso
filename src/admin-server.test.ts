import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const entryFetch = vi.fn();
vi.mock("@tanstack/react-start/server-entry", () => ({ default: { fetch: entryFetch } }));

const { default: server } = await import("../admin/server");
beforeEach(() => entryFetch.mockReset());
afterEach(() => vi.unstubAllEnvs());

describe("admin server security boundary", () => {
  it("sets independently generated nonce CSP and baseline headers on admin responses", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    entryFetch.mockResolvedValue(new Response("ok"));
    const response = await server.fetch(new Request("https://admin.example/"), {}, {});
    expect(entryFetch).toHaveBeenCalledOnce();
    const [request] = entryFetch.mock.calls[0] as [Request];
    const nonce = request?.headers.get("x-app-csp-nonce");
    expect(nonce).toBeTruthy();
    expect(response.headers.get("content-security-policy")).toContain(`nonce-${nonce}`);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("strict-transport-security")).toBe("max-age=31536000");
  });
});
