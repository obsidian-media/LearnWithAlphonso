import { beforeEach, describe, expect, it, vi } from "vitest";
import { asTestFns, chainable, createSupabaseMock } from "./__testutils__/supabase-mock";
import { setStaff } from "./__testutils__/staff-harness";

// ---- the real requireSupabaseAuth with a mocked Supabase (Review Focus #3) ----
const getRequest = vi.fn();
vi.mock("@tanstack/react-start/server", () => ({ getRequest }));
const getClaims = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => ({ auth: { getClaims } })) }));
const adminRpc = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: adminRpc } }));

describe("a banned learner with a still-valid token", () => {
  const next = vi.fn((ctx) => ctx);
  const header = {
    headers: { get: (n: string) => (n === "authorization" ? "Bearer a.b.c" : null) },
  };

  beforeEach(() => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_abc";
    getRequest.mockReturnValue(header);
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1", aal: "aal1" } }, error: null });
    adminRpc.mockReset();
    next.mockClear();
  });

  async function run() {
    const { requireSupabaseAuth } = await import("@/integrations/supabase/auth-middleware");
    const server = requireSupabaseAuth.options.server as (o: {
      next: (c: unknown) => unknown;
    }) => unknown;
    return server({ next });
  }

  it("is refused with account_suspended, immediately, and never reaches the handler", async () => {
    adminRpc.mockResolvedValue({ data: true, error: null });
    await expect(run()).rejects.toThrow("account_suspended");
    expect(adminRpc).toHaveBeenCalledWith("is_restricted", { p_user: "user-1", p_kind: "ban" });
    expect(next).not.toHaveBeenCalled();
  });

  it("a learner who is not banned goes through", async () => {
    adminRpc.mockResolvedValue({ data: false, error: null });
    await run();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("a failed check is logged and does not lock every learner out", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    adminRpc.mockResolvedValue({ data: null, error: { message: "db down" } });
    await run();
    expect(next).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("the check runs after the token is validated, so a bad token still reads as a bad token", async () => {
    getClaims.mockResolvedValue({ data: null, error: new Error("bad") });
    await expect(run()).rejects.toThrow("Unauthorized: Invalid token");
    expect(adminRpc).not.toHaveBeenCalled();
  });
});
