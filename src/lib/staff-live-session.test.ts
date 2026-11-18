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
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "session missing" } });
    await expect(run(live)).rejects.toThrow("Unauthorized: Session has ended");
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
