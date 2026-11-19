import { beforeEach, describe, expect, it, vi } from "vitest";

// createMiddleware().middleware().server(fn) -> the test calls fn directly.
vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => {
    const b = { middleware: () => b, server: (fn: unknown) => fn };
    return b;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));

const getUser = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    auth: { getUser: (t: string) => getUser(t) },
    from(name: string) {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({
          data: name === "admin_users" ? { user_id: "s1" } : null,
          error: null,
        }),
      };
      return q;
    },
  },
}));

const { requireStaff } = await import("./staff-middleware");
type Handler = (a: { next: (c: unknown) => unknown; context: unknown }) => Promise<unknown>;
const run = (context: Record<string, unknown>) =>
  (requireStaff() as unknown as Handler)({ next: (c) => c, context });

const live = { userId: "s1", claims: { aal: "aal2" }, accessToken: "tok" };

beforeEach(() => {
  getUser.mockReset();
  delete process.env.ADMIN_REQUIRE_AAL2;
});

describe("requireStaff confirms the session is live", () => {
  it("passes while the auth server still knows the session", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "s1" } }, error: null });
    await expect(run(live)).resolves.toMatchObject({
      context: { staffRole: "owner" },
    });
    expect(getUser).toHaveBeenCalledWith("tok");
  });

  it("refuses a signed-out session whose token still verifies locally", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "session missing", status: 401 },
    });
    await expect(run(live)).rejects.toThrow("Unauthorized: Session has ended");
  });

  it("an auth-server outage is its own message, not 'Session has ended'", async () => {
    const unavailable = "Session check unavailable. Try again shortly.";
    for (const error of [
      { message: "bad gateway", status: 502 },
      { message: "fetch failed", name: "AuthRetryableFetchError", status: 0 },
      { message: "no status at all" },
    ]) {
      getUser.mockResolvedValueOnce({ data: { user: null }, error });
      await expect(run(live)).rejects.toThrow(unavailable);
    }
    getUser.mockRejectedValueOnce(new Error("network down"));
    await expect(run(live)).rejects.toThrow(unavailable);
  });

  it("a refusal shaped like auth-js's own (403 session_not_found, 401, bad_jwt, or the words alone) is a sign-out", async () => {
    for (const error of [
      {
        name: "AuthApiError",
        message: "Session not found",
        status: 403,
        code: "session_not_found",
      },
      { name: "AuthApiError", message: "invalid JWT", status: 401, code: "bad_jwt" },
      { name: "AuthApiError", message: "User not found", status: 404, code: "user_not_found" },
      { message: "Session not found" },
    ]) {
      getUser.mockResolvedValueOnce({ data: { user: null }, error });
      await expect(run(live)).rejects.toThrow("Unauthorized: Session has ended");
    }
  });

  it("a 500 or a 429 from the auth server is an outage, not a sign-out", async () => {
    for (const error of [
      { name: "AuthApiError", message: "internal error", status: 500, code: "unexpected_failure" },
      {
        name: "AuthApiError",
        message: "rate limited",
        status: 429,
        code: "over_request_rate_limit",
      },
    ]) {
      getUser.mockResolvedValueOnce({ data: { user: null }, error });
      await expect(run(live)).rejects.toThrow("Session check unavailable. Try again shortly.");
    }
  });

  it("refuses when the auth server answers for a different user", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "someone-else" } }, error: null });
    await expect(run(live)).rejects.toThrow("Unauthorized: Session has ended");
  });

  it("refuses when there is no access token in the context", async () => {
    await expect(run({ ...live, accessToken: undefined })).rejects.toThrow(/No token/);
  });

  it("refuses an aal1 session by default, before asking the auth server", async () => {
    await expect(run({ ...live, claims: { aal: "aal1" } })).rejects.toThrow(
      "Unauthorized: Second factor required",
    );
    expect(getUser).not.toHaveBeenCalled();
  });
});
