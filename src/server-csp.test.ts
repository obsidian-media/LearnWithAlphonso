import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const entryFetch = vi.fn();
vi.mock("@tanstack/react-start/server-entry", () => ({ default: { fetch: entryFetch } }));

const { default: server } = await import("./server");

beforeEach(() => entryFetch.mockReset());
afterEach(() => vi.unstubAllEnvs());

describe("learner server CSP integration", () => {
  it("replaces caller-supplied nonce and binds production CSP/HSTS to the server nonce", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    entryFetch.mockResolvedValue(
      new Response("<html></html>", { headers: { "content-type": "text/html" } }),
    );
    const response = await server.fetch(
      new Request("https://app.example/", { headers: { "x-app-csp-nonce": "attacker" } }),
      {},
      {},
    );
    const [forwardedRequest] = entryFetch.mock.calls[0] as [Request];
    const receivedNonce = forwardedRequest?.headers.get("x-app-csp-nonce");
    expect(receivedNonce).toBeTruthy();
    expect(receivedNonce).not.toBe("attacker");
    expect(response.headers.get("content-security-policy")).toContain(`nonce-${receivedNonce}`);
    expect(response.headers.get("strict-transport-security")).toBe("max-age=31536000");
  });
});
