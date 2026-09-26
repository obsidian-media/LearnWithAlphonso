import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const upsert = vi.fn();
const from = vi.fn(() => ({ upsert }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { auth: { getUser }, from },
}));

const { Route } = await import("./hector-link");
const handler = (
  Route.options.server!.handlers as unknown as {
    POST: (opts: { request: Request }) => Promise<Response>;
  }
).POST;

// zod's .uuid() validates the RFC 4122 version/variant nibbles, not just
// the 8-4-4-4-12 shape -- an all-1s placeholder fails that check.
const CLOUD_VOICE_USER_ID = "11111111-1111-4111-8111-111111111111";

function req(body: unknown, authorization = "Bearer token-123") {
  return new Request("https://example.com/api/hector-link", {
    method: "POST",
    headers: authorization ? { Authorization: authorization } : undefined,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getUser.mockReset();
  upsert.mockReset();
  from.mockClear();
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  upsert.mockResolvedValue({ error: null });
});

describe("POST /api/hector-link", () => {
  it("rejects a request with no Authorization header", async () => {
    const res = await handler({ request: req({ cloudVoiceUserId: CLOUD_VOICE_USER_ID }, "") });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ linked: false, reason: "unauthorized" });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("rejects a body whose cloudVoiceUserId isn't a UUID", async () => {
    const res = await handler({ request: req({ cloudVoiceUserId: "not-a-uuid" }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ linked: false, reason: "bad-request" });
  });

  it("rejects an invalid or expired access token", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error("invalid") });
    const res = await handler({ request: req({ cloudVoiceUserId: CLOUD_VOICE_USER_ID }) });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ linked: false, reason: "unauthorized" });
  });

  it("upserts the link keyed by the caller's own user id, not a client-supplied one", async () => {
    const res = await handler({ request: req({ cloudVoiceUserId: CLOUD_VOICE_USER_ID }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ linked: true });
    expect(from).toHaveBeenCalledWith("hector_links");
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "user-1", cloud_voice_user_id: CLOUD_VOICE_USER_ID },
      { onConflict: "user_id" },
    );
  });

  it("reports store-failed rather than throwing when the upsert fails", async () => {
    upsert.mockResolvedValue({ error: new Error("db down") });
    const res = await handler({ request: req({ cloudVoiceUserId: CLOUD_VOICE_USER_ID }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ linked: false, reason: "store-failed" });
  });
});
