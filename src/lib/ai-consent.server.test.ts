import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const rpc = vi.fn();
const maybeSingle = vi.fn();
const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }));
const createClient = vi.fn(() => ({ auth: { getUser }, rpc, from }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
const adminMaybeSingle = vi.fn();
const adminFrom = vi.fn(() => ({
  select: () => ({ eq: () => ({ maybeSingle: adminMaybeSingle }) }),
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: adminFrom } }));

const { authorizeAiRequest, hasAiConsent, requireAiConsent } = await import("./ai-consent.server");

const req = (auth = "Bearer tok") =>
  new Request("https://example.com/api/chat", {
    method: "POST",
    headers: auth ? { Authorization: auth } : {},
  });

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ENFORCE_AI_CONSENT;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "pk";
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  rpc.mockResolvedValue({ data: [{ allowed: true, used: 1 }], error: null });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("hasAiConsent", () => {
  it("is true only with a stored timestamp", async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { ai_consent_at: "2026-10-09T10:00:00Z" },
      error: null,
    });
    expect(await hasAiConsent({ from } as never, "user-1")).toBe(true);
    maybeSingle.mockResolvedValueOnce({ data: { ai_consent_at: null }, error: null });
    expect(await hasAiConsent({ from } as never, "user-1")).toBe(false);
  });

  it("is false when the read fails", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect(await hasAiConsent({ from } as never, "user-1")).toBe(false);
  });

  it("is true without reading anything when the flag is off", async () => {
    process.env.ENFORCE_AI_CONSENT = "false";
    expect(await hasAiConsent({ from } as never, "user-1")).toBe(true);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("requireAiConsent", () => {
  it("returns 403 ai-consent-required without consent", async () => {
    adminMaybeSingle.mockResolvedValueOnce({ data: { ai_consent_at: null }, error: null });
    const res = await requireAiConsent("user-1");
    expect(res?.status).toBe(403);
    expect(await res?.json()).toEqual({ error: "ai-consent-required" });
  });

  it("returns null with consent, using the service client by default", async () => {
    adminMaybeSingle.mockResolvedValueOnce({
      data: { ai_consent_at: "2026-10-09T10:00:00Z" },
      error: null,
    });
    expect(await requireAiConsent("user-1")).toBeNull();
    expect(adminFrom).toHaveBeenCalledWith("profiles");
  });

  it("a failed read is 503, not 403, so a consented learner is never shown the consent sheet", async () => {
    adminMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: "timeout" } });
    const res = await requireAiConsent("user-1");
    expect(res?.status).toBe(503);
    expect(await res?.json()).toEqual({ error: "consent-check-failed" });
  });

  it("is a no-op when ENFORCE_AI_CONSENT=false", async () => {
    process.env.ENFORCE_AI_CONSENT = "false";
    expect(await requireAiConsent("user-1")).toBeNull();
    expect(adminFrom).not.toHaveBeenCalled();
  });
});

describe("authorizeAiRequest", () => {
  it("401 before anything else", async () => {
    const r = await authorizeAiRequest(req(""), "chat", { route: "chat" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("403 without consent, and no quota is spent", async () => {
    maybeSingle.mockResolvedValueOnce({ data: { ai_consent_at: null }, error: null });
    const r = await authorizeAiRequest(req(), "chat", { route: "chat" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(403);
      expect(await r.response.json()).toEqual({ error: "ai-consent-required" });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("with consent: spends quota and returns the caller", async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { ai_consent_at: "2026-10-09T10:00:00Z" },
      error: null,
    });
    const r = await authorizeAiRequest(req(), "chat", { route: "chat" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.userId).toBe("user-1");
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["consume_ai_rate_limit", "consume_ai_quota"]);
  });

  it("passes the quota failure through", async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { ai_consent_at: "2026-10-09T10:00:00Z" },
      error: null,
    });
    rpc.mockResolvedValueOnce({ data: [{ allowed: false }], error: null });
    const r = await authorizeAiRequest(req(), "chat", { route: "chat" });
    if (r.ok) throw new Error("expected a failure");
    expect(r.response.status).toBe(429);
    const body = (await r.response.json()) as {
      error: string;
      resetsAt: string | null;
      message: string;
    };
    expect(body.error).toBe("quota-exceeded");
    expect(body.resetsAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.message.length).toBeGreaterThan(0);
  });

  it("requireConsent: false skips the consent read (generate-practice only)", async () => {
    const r = await authorizeAiRequest(req(), "chat", {
      route: "generate-practice",
      requireConsent: false,
    });
    expect(r.ok).toBe(true);
    expect(from).not.toHaveBeenCalled();
  });
});
