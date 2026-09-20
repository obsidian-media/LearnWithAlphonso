import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getRequest = vi.fn();
vi.mock("@tanstack/react-start/server", () => ({ getRequest }));

const getClaims = vi.fn();
const createClient = vi.fn().mockReturnValue({ auth: { getClaims } });
vi.mock("@supabase/supabase-js", () => ({ createClient }));

const { requireSupabaseAuth } = await import("./auth-middleware");
const server = requireSupabaseAuth.options.server as (opts: {
  next: (ctx: unknown) => unknown;
}) => unknown;

function requestWith(headers: Record<string, string> = {}) {
  // A plain lookup rather than a real Headers instance: Headers trims
  // trailing OWS from values, which would silently turn "Bearer " into
  // "Bearer" and mask the empty-token branch this suite exercises below.
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { headers: { get: (name: string) => lower[name.toLowerCase()] ?? null } };
}

const next = vi.fn((ctx) => ctx);

beforeEach(() => {
  getRequest.mockReset();
  getClaims.mockReset();
  createClient.mockClear();
  next.mockClear();
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_abc";
});

afterEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
});

describe("requireSupabaseAuth", () => {
  it("throws when Supabase env vars are missing", async () => {
    delete process.env.SUPABASE_URL;
    await expect(server({ next })).rejects.toThrow(
      /Missing Supabase environment variable.*SUPABASE_URL/,
    );
  });

  it("throws when there is no request", async () => {
    getRequest.mockReturnValue(undefined);
    await expect(server({ next })).rejects.toThrow("Unauthorized: No request headers available");
  });

  it("throws when there is no authorization header", async () => {
    getRequest.mockReturnValue(requestWith());
    await expect(server({ next })).rejects.toThrow(
      "Unauthorized: No authorization header provided",
    );
  });

  it("throws for a non-Bearer authorization scheme", async () => {
    getRequest.mockReturnValue(requestWith({ authorization: "Basic abc123" }));
    await expect(server({ next })).rejects.toThrow(
      "Unauthorized: Only Bearer tokens are supported",
    );
  });

  it("throws when the bearer token is empty", async () => {
    getRequest.mockReturnValue(requestWith({ authorization: "Bearer " }));
    await expect(server({ next })).rejects.toThrow("Unauthorized: No token provided");
  });

  it("throws when the token isn't a 3-part JWT", async () => {
    getRequest.mockReturnValue(requestWith({ authorization: "Bearer not-a-jwt" }));
    await expect(server({ next })).rejects.toThrow("Unauthorized: Invalid token");
  });

  it("throws when Supabase rejects the claims", async () => {
    getRequest.mockReturnValue(requestWith({ authorization: "Bearer a.b.c" }));
    getClaims.mockResolvedValue({ data: null, error: new Error("bad token") });
    await expect(server({ next })).rejects.toThrow("Unauthorized: Invalid token");
  });

  it("throws when claims have no subject", async () => {
    getRequest.mockReturnValue(requestWith({ authorization: "Bearer a.b.c" }));
    getClaims.mockResolvedValue({ data: { claims: {} }, error: null });
    await expect(server({ next })).rejects.toThrow("Unauthorized: No user ID found in token");
  });

  it("calls next with the supabase client, userId, and claims on success", async () => {
    getRequest.mockReturnValue(requestWith({ authorization: "Bearer a.b.c" }));
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
    const result = (await server({ next })) as { context: { userId: string; claims: unknown } };
    expect(next).toHaveBeenCalledOnce();
    expect(result.context.userId).toBe("user-1");
    expect(result.context.claims).toEqual({ sub: "user-1" });
  });

  it("strips the Authorization header when it duplicates a new-format API key", async () => {
    getRequest.mockReturnValue(requestWith({ authorization: "Bearer a.b.c" }));
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
    await server({ next });

    const clientOptions = createClient.mock.calls[0][2];
    const customFetch = clientOptions.global.fetch as typeof fetch;
    const fetchSpy = vi.fn().mockResolvedValue(new Response("ok"));
    const originalFetch = global.fetch;
    global.fetch = fetchSpy;
    try {
      await customFetch("https://x", {
        headers: { Authorization: "Bearer sb_publishable_abc" },
      });
    } finally {
      global.fetch = originalFetch;
    }
    const sentHeaders = fetchSpy.mock.calls[0][1].headers as Headers;
    expect(sentHeaders.has("Authorization")).toBe(false);
    expect(sentHeaders.get("apikey")).toBe("sb_publishable_abc");
  });

  it("keeps a caller-supplied Authorization header that isn't the API key itself", async () => {
    getRequest.mockReturnValue(requestWith({ authorization: "Bearer a.b.c" }));
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
    await server({ next });

    const clientOptions = createClient.mock.calls[0][2];
    const customFetch = clientOptions.global.fetch as typeof fetch;
    const fetchSpy = vi.fn().mockResolvedValue(new Response("ok"));
    const originalFetch = global.fetch;
    global.fetch = fetchSpy;
    try {
      await customFetch("https://x", { headers: { Authorization: "Bearer user-session-token" } });
    } finally {
      global.fetch = originalFetch;
    }
    const sentHeaders = fetchSpy.mock.calls[0][1].headers as Headers;
    expect(sentHeaders.get("Authorization")).toBe("Bearer user-session-token");
  });
});
