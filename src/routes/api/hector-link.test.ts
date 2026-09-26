import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const upsert = vi.fn();
const from = vi.fn(() => ({ upsert }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { auth: { getUser }, from },
}));

const cloudVoiceAuthConfigFromEnv = vi.fn();
const resolveCloudVoiceUserId = vi.fn();
vi.mock("@/lib/cloud-voice-auth", () => ({
  cloudVoiceAuthConfigFromEnv,
  resolveCloudVoiceUserId,
}));

const { Route } = await import("./hector-link");
const handler = (
  Route.options.server!.handlers as unknown as {
    POST: (opts: { request: Request }) => Promise<Response>;
  }
).POST;

const CLOUD_VOICE_CONFIG = { supabaseUrl: "https://cloud-voice.example", publishableKey: "pk" };
// The id the caller's own Cloud Voice access token actually resolves to --
// never something the request body gets to declare.
const CALLERS_OWN_CLOUD_VOICE_ID = "22222222-2222-4222-8222-222222222222";
// A victim's real Cloud Voice id, known to an attacker (e.g. leaked, or
// guessed) but which the attacker does not hold a valid access token for.
const VICTIM_CLOUD_VOICE_ID = "33333333-3333-4333-8333-333333333333";

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
  cloudVoiceAuthConfigFromEnv.mockReset();
  resolveCloudVoiceUserId.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  upsert.mockResolvedValue({ error: null });
  cloudVoiceAuthConfigFromEnv.mockReturnValue(CLOUD_VOICE_CONFIG);
  resolveCloudVoiceUserId.mockResolvedValue(CALLERS_OWN_CLOUD_VOICE_ID);
});

describe("POST /api/hector-link", () => {
  it("rejects a request with no Authorization header", async () => {
    const res = await handler({ request: req({ cloudVoiceAccessToken: "cv-token" }, "") });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ linked: false, reason: "unauthorized" });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("rejects a body with no cloudVoiceAccessToken", async () => {
    const res = await handler({ request: req({}) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ linked: false, reason: "bad-request" });
  });

  it("rejects an invalid or expired access token", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error("invalid") });
    const res = await handler({ request: req({ cloudVoiceAccessToken: "cv-token" }) });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ linked: false, reason: "unauthorized" });
  });

  // The defect this guards against: the endpoint used to accept
  // `cloudVoiceUserId` straight from the body, validated for UUID shape
  // only. An attacker who knew a victim's real Cloud Voice id could post
  // it first and silently steal that account's future revocation slot.
  // The fix derives the id server-side from a verified Cloud Voice access
  // token, so a claimed id in the body must never reach storage.
  it("cannot link a cloudVoiceUserId it does not control, even if it names one directly in the body", async () => {
    const res = await handler({
      request: req({
        cloudVoiceAccessToken: "attackers-own-cv-token",
        cloudVoiceUserId: VICTIM_CLOUD_VOICE_ID,
      }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ linked: true });
    expect(resolveCloudVoiceUserId).toHaveBeenCalledWith(
      CLOUD_VOICE_CONFIG,
      "attackers-own-cv-token",
    );
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "user-1", cloud_voice_user_id: CALLERS_OWN_CLOUD_VOICE_ID },
      { onConflict: "user_id" },
    );
    expect(upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ cloud_voice_user_id: VICTIM_CLOUD_VOICE_ID }),
      expect.anything(),
    );
  });

  it("fails closed to not-linked when the token cannot be verified against Cloud Voice", async () => {
    resolveCloudVoiceUserId.mockResolvedValue(null);
    const res = await handler({ request: req({ cloudVoiceAccessToken: "bad-token" }) });
    expect(await res.json()).toEqual({ linked: false, reason: "cloud-voice-unauthorized" });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("fails closed to not-linked, never trusting the body, when Cloud Voice auth isn't configured", async () => {
    cloudVoiceAuthConfigFromEnv.mockReturnValue(null);
    const res = await handler({
      request: req({ cloudVoiceAccessToken: "cv-token", cloudVoiceUserId: VICTIM_CLOUD_VOICE_ID }),
    });
    expect(await res.json()).toEqual({ linked: false, reason: "not-configured" });
    expect(resolveCloudVoiceUserId).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("upserts the link keyed by the caller's own user id and the server-verified cloud voice id", async () => {
    const res = await handler({ request: req({ cloudVoiceAccessToken: "cv-token" }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ linked: true });
    expect(from).toHaveBeenCalledWith("hector_links");
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "user-1", cloud_voice_user_id: CALLERS_OWN_CLOUD_VOICE_ID },
      { onConflict: "user_id" },
    );
  });

  it("reports store-failed rather than throwing when the upsert fails", async () => {
    upsert.mockResolvedValue({ error: new Error("db down") });
    const res = await handler({ request: req({ cloudVoiceAccessToken: "cv-token" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ linked: false, reason: "store-failed" });
  });
});
