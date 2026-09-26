import { describe, expect, it, vi } from "vitest";
import { asTestFns, chainable, createSupabaseMock } from "./__testutils__/supabase-mock";

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validator: ((d: unknown) => unknown) | undefined;
    const builder = {
      middleware: () => builder,
      inputValidator: (v: (d: unknown) => unknown) => {
        validator = v;
        return builder;
      },
      validator: (v: (d: unknown) => unknown) => {
        validator = v;
        return builder;
      },
      handler:
        (fn: (opts: { data: unknown; context: unknown }) => unknown) =>
        async (opts: { data?: unknown; context?: unknown } = {}) => {
          const data = validator ? validator(opts.data) : opts.data;
          return fn({ data, context: opts.context ?? {} });
        },
    };
    return builder;
  },
}));

const { blockUser, reportUser } = asTestFns(await import("./social-safety.functions"));

const USER_ID = "22222222-2222-4222-8222-222222222222";
const TARGET_ID = "11111111-1111-4111-8111-111111111111";

function ctx(supabase: ReturnType<typeof createSupabaseMock>) {
  return { supabase, userId: USER_ID };
}

describe("blockUser", () => {
  it("calls the block_user RPC and returns its ok/message row", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({ data: [{ ok: true, message: "blocked" }] });

    const result = await blockUser({ context: ctx(supabase), data: { userId: TARGET_ID } });

    expect(supabase.rpc).toHaveBeenCalledWith("block_user", { _target: TARGET_ID });
    expect(result).toEqual({ ok: true, message: "blocked" });
  });

  it("returns a server-error result rather than throwing when the RPC errors", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({ data: null, error: new Error("boom") });

    const result = await blockUser({ context: ctx(supabase), data: { userId: TARGET_ID } });

    expect(result).toEqual({ ok: false, message: "server-error" });
  });
});

describe("reportUser", () => {
  it("inserts into content_reports with the reported user and reason", async () => {
    const supabase = createSupabaseMock();
    const insert = vi.fn().mockResolvedValue({ error: null });
    supabase.from.mockReturnValue({ ...chainable({}), insert });

    const result = await reportUser({
      context: ctx(supabase),
      data: { userId: TARGET_ID, reason: "harassment" },
    });

    expect(supabase.from).toHaveBeenCalledWith("content_reports");
    expect(insert).toHaveBeenCalledWith({ reported: TARGET_ID, reason: "harassment" });
    expect(result).toEqual({ ok: true });
  });

  it("rejects a reason outside the fixed set", async () => {
    const supabase = createSupabaseMock();
    await expect(
      reportUser({ context: ctx(supabase), data: { userId: TARGET_ID, reason: "not-a-reason" } }),
    ).rejects.toThrow();
  });

  it("returns ok: false rather than throwing when the insert fails", async () => {
    const supabase = createSupabaseMock();
    const insert = vi.fn().mockResolvedValue({ error: new Error("boom") });
    supabase.from.mockReturnValue({ ...chainable({}), insert });

    const result = await reportUser({
      context: ctx(supabase),
      data: { userId: TARGET_ID, reason: "spam" },
    });

    expect(result).toEqual({ ok: false });
  });
});
