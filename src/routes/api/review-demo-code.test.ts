import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateLink = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { auth: { admin: { generateLink } } },
}));

const { Route } = await import("./review-demo-code");
const handler = (
  Route.options.server!.handlers as unknown as {
    GET: (opts: { request: Request }) => Promise<Response>;
  }
).GET;

const KEY = "k".repeat(40);
const DEMO = "demo@example.com";

function req(key?: string) {
  const url = new URL("https://example.com/api/review-demo-code");
  if (key !== undefined) url.searchParams.set("key", key);
  return new Request(url);
}

beforeEach(() => {
  generateLink.mockReset();
  vi.stubEnv("REVIEW_DEMO_CODE_KEY", KEY);
  vi.stubEnv("DEMO_ACCOUNT_EMAIL", DEMO);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/review-demo-code", () => {
  it("returns a fresh sign-in code for the demo account when the key matches", async () => {
    generateLink.mockResolvedValue({ data: { properties: { email_otp: "482913" } }, error: null });

    const res = await handler({ request: req(KEY) });

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("482913");
    expect(generateLink).toHaveBeenCalledWith({ type: "magiclink", email: DEMO });
    // Never cached: every visit must mint a fresh code.
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });

  it("404s on a wrong key without touching auth", async () => {
    const res = await handler({ request: req("k".repeat(39) + "x") });
    expect(res.status).toBe(404);
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("404s with no key", async () => {
    const res = await handler({ request: req() });
    expect(res.status).toBe(404);
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("is switched off (404) when the key env var is unset, even for an empty key", async () => {
    vi.stubEnv("REVIEW_DEMO_CODE_KEY", "");
    const res = await handler({ request: req("") });
    expect(res.status).toBe(404);
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("refuses a key too short to be a real secret", async () => {
    vi.stubEnv("REVIEW_DEMO_CODE_KEY", "short");
    const res = await handler({ request: req("short") });
    expect(res.status).toBe(404);
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("is switched off when the demo account email is unset", async () => {
    vi.stubEnv("DEMO_ACCOUNT_EMAIL", "");
    const res = await handler({ request: req(KEY) });
    expect(res.status).toBe(404);
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("503s without leaking the auth error when Supabase fails", async () => {
    generateLink.mockResolvedValue({ data: null, error: { message: "internal detail" } });
    const res = await handler({ request: req(KEY) });
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("internal detail");
  });
});
