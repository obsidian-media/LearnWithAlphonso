import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn().mockReturnValue({ auth: { getSession: vi.fn() }, from: vi.fn() });
vi.mock("@supabase/supabase-js", () => ({ createClient }));

beforeEach(() => {
  vi.resetModules();
  createClient.mockClear();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
});

describe("supabase client", () => {
  it("throws when both env vars are missing, naming both", async () => {
    const { supabase } = await import("./client");
    expect(() => supabase.auth).toThrow(
      /Missing Supabase environment variable\(s\): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY/,
    );
  });

  it("throws naming only the one missing env var", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    const { supabase } = await import("./client");
    expect(() => supabase.auth).toThrow(/SUPABASE_PUBLISHABLE_KEY/);
    expect(() => supabase.auth).not.toThrow(/SUPABASE_URL,/);
  });

  it("lazily creates the client only on first property access", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_abc";
    const { supabase } = await import("./client");
    expect(createClient).not.toHaveBeenCalled();
    void supabase.auth;
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it("caches the client across repeated property accesses", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_abc";
    const { supabase } = await import("./client");
    void supabase.auth;
    void supabase.from;
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it("passes the URL and key through to createClient with session persistence enabled", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_abc";
    const { supabase } = await import("./client");
    void supabase.auth;
    expect(createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "sb_publishable_abc",
      expect.objectContaining({
        auth: { persistSession: true, autoRefreshToken: true },
      }),
    );
  });

  it("strips a redundant Authorization header for the new opaque API key format", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_abc";
    const { supabase } = await import("./client");
    void supabase.auth;
    const customFetch = createClient.mock.calls[0][2].global.fetch as typeof fetch;

    const fetchSpy = vi.fn().mockResolvedValue(new Response("ok"));
    const originalFetch = global.fetch;
    global.fetch = fetchSpy;
    try {
      await customFetch("https://x", { headers: { Authorization: "Bearer sb_publishable_abc" } });
    } finally {
      global.fetch = originalFetch;
    }
    const sentHeaders = fetchSpy.mock.calls[0][1].headers as Headers;
    expect(sentHeaders.has("Authorization")).toBe(false);
    expect(sentHeaders.get("apikey")).toBe("sb_publishable_abc");
  });

  it("keeps a real user session's Authorization header intact", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_abc";
    const { supabase } = await import("./client");
    void supabase.auth;
    const customFetch = createClient.mock.calls[0][2].global.fetch as typeof fetch;

    const fetchSpy = vi.fn().mockResolvedValue(new Response("ok"));
    const originalFetch = global.fetch;
    global.fetch = fetchSpy;
    try {
      await customFetch("https://x", { headers: { Authorization: "Bearer real-session-jwt" } });
    } finally {
      global.fetch = originalFetch;
    }
    const sentHeaders = fetchSpy.mock.calls[0][1].headers as Headers;
    expect(sentHeaders.get("Authorization")).toBe("Bearer real-session-jwt");
  });
});
