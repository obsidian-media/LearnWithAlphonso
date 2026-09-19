import { afterEach, describe, expect, it, vi } from "vitest";
import { createSupabaseFetch, isNewSupabaseApiKey } from "./fetch";

describe("isNewSupabaseApiKey", () => {
  it("recognizes the new publishable/secret key prefixes", () => {
    expect(isNewSupabaseApiKey("sb_publishable_abc123")).toBe(true);
    expect(isNewSupabaseApiKey("sb_secret_abc123")).toBe(true);
  });

  it("rejects a legacy JWT-style key", () => {
    expect(isNewSupabaseApiKey("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9")).toBe(false);
  });
});

describe("createSupabaseFetch", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("always sets the apikey header", async () => {
    const captured: Record<string, string> = {};
    globalThis.fetch = vi.fn(async (_input, init) => {
      new Headers(init?.headers).forEach((v, k) => (captured[k] = v));
      return new Response("ok");
    }) as typeof fetch;

    const supabaseFetch = createSupabaseFetch("legacy-anon-key");
    await supabaseFetch("https://example.com", { headers: {} });
    expect(captured["apikey"]).toBe("legacy-anon-key");
  });

  it("strips a redundant Authorization: Bearer <key> header for new-style keys", async () => {
    const captured: Record<string, string> = {};
    globalThis.fetch = vi.fn(async (_input, init) => {
      new Headers(init?.headers).forEach((v, k) => (captured[k] = v));
      return new Response("ok");
    }) as typeof fetch;

    const key = "sb_publishable_abc123";
    const supabaseFetch = createSupabaseFetch(key);
    await supabaseFetch("https://example.com", { headers: { Authorization: `Bearer ${key}` } });
    expect(captured["authorization"]).toBeUndefined();
  });

  it("keeps a real user Authorization header for new-style keys", async () => {
    const captured: Record<string, string> = {};
    globalThis.fetch = vi.fn(async (_input, init) => {
      new Headers(init?.headers).forEach((v, k) => (captured[k] = v));
      return new Response("ok");
    }) as typeof fetch;

    const key = "sb_publishable_abc123";
    const supabaseFetch = createSupabaseFetch(key);
    await supabaseFetch("https://example.com", {
      headers: { Authorization: "Bearer real-user-token" },
    });
    expect(captured["authorization"]).toBe("Bearer real-user-token");
  });

  it("keeps Authorization: Bearer <key> intact for legacy keys", async () => {
    const captured: Record<string, string> = {};
    globalThis.fetch = vi.fn(async (_input, init) => {
      new Headers(init?.headers).forEach((v, k) => (captured[k] = v));
      return new Response("ok");
    }) as typeof fetch;

    const key = "legacy-anon-key";
    const supabaseFetch = createSupabaseFetch(key);
    await supabaseFetch("https://example.com", { headers: { Authorization: `Bearer ${key}` } });
    expect(captured["authorization"]).toBe(`Bearer ${key}`);
  });
});
