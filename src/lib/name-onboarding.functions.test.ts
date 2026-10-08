import { beforeEach, describe, expect, it, vi } from "vitest";
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

const mod = await import("./name-onboarding.functions");
const { getNameStatus, checkDisplayName, confirmName, skipName } = asTestFns({
  getNameStatus: mod.getNameStatus,
  checkDisplayName: mod.checkDisplayName,
  confirmName: mod.confirmName,
  skipName: mod.skipName,
});

let supabase: ReturnType<typeof createSupabaseMock>;
const ctx = (meta: Record<string, unknown> = {}) => ({
  supabase,
  userId: "u1",
  claims: { sub: "u1", user_metadata: meta },
});

beforeEach(() => {
  supabase = createSupabaseMock();
});

describe("getNameStatus", () => {
  it("prompts an unconfirmed Google learner with their first name", async () => {
    supabase.rpc.mockReturnValueOnce(
      chainable({ data: [{ display_name: "Jenny Coon", name_confirmed_at: null }], error: null }),
    );
    const status = await getNameStatus({
      context: ctx({ full_name: "Jenny Coon", name: "Jenny Coon" }),
    });
    expect(supabase.rpc).toHaveBeenCalledWith("get_my_name_status");
    expect(status).toEqual({ displayName: "Jenny Coon", needsPrompt: true, prefill: "Jenny" });
  });

  it("does not prompt a confirmed learner", async () => {
    supabase.rpc.mockReturnValueOnce(
      chainable({
        data: [{ display_name: "Ana", name_confirmed_at: "2026-10-08T10:00:00+00:00" }],
        error: null,
      }),
    );
    expect((await getNameStatus({ context: ctx() }))?.needsPrompt).toBe(false);
  });

  it("returns null without a profile row (the client skips the prompt), and throws on a server error", async () => {
    supabase.rpc.mockReturnValueOnce(chainable({ data: [], error: null }));
    expect(await getNameStatus({ context: ctx() })).toBeNull();
    supabase.rpc.mockReturnValueOnce(chainable({ data: null, error: { message: "boom" } }));
    await expect(getNameStatus({ context: ctx() })).rejects.toThrow("boom");
  });
});

describe("checkDisplayName", () => {
  it("returns the filter's verdict", async () => {
    supabase.rpc.mockReturnValueOnce(chainable({ data: "blocked-content", error: null }));
    expect(await checkDisplayName({ data: { name: "Shithead" }, context: ctx() })).toEqual({
      problem: "blocked-content",
      unverified: false,
    });
    expect(supabase.rpc).toHaveBeenCalledWith("display_name_problem", { _name: "Shithead" });
    supabase.rpc.mockReturnValueOnce(chainable({ data: null, error: null }));
    expect(await checkDisplayName({ data: { name: "Furaha" }, context: ctx() })).toEqual({
      problem: null,
      unverified: false,
    });
  });

  it("says unverified, not fine, when the filter cannot be reached", async () => {
    supabase.rpc.mockReturnValueOnce(chainable({ data: null, error: { message: "timeout" } }));
    expect(await checkDisplayName({ data: { name: "Furaha" }, context: ctx() })).toEqual({
      problem: null,
      unverified: true,
    });
  });
});

describe("confirmName and skipName", () => {
  it("saves through confirm_display_name and maps a refusal", async () => {
    supabase.rpc.mockReturnValueOnce(chainable({ data: "Ana Lima", error: null }));
    expect(await confirmName({ data: { name: "Ana Lima" }, context: ctx() })).toEqual({
      ok: true,
      name: "Ana Lima",
    });
    expect(supabase.rpc).toHaveBeenCalledWith("confirm_display_name", { _name: "Ana Lima" });
    supabase.rpc.mockReturnValueOnce(
      chainable({ data: null, error: { code: "P0001", message: "blocked-content" } }),
    );
    expect(await confirmName({ data: { name: "Fuck" }, context: ctx() })).toEqual({
      ok: false,
      error: "blocked-content",
    });
  });

  it("skips through skip_display_name_prompt", async () => {
    supabase.rpc.mockReturnValueOnce(chainable({ data: "Learner-9C0D", error: null }));
    expect(await skipName({ context: ctx() })).toEqual({ ok: true, name: "Learner-9C0D" });
    expect(supabase.rpc).toHaveBeenCalledWith("skip_display_name_prompt");
    supabase.rpc.mockReturnValueOnce(
      chainable({ data: null, error: { message: "unauthenticated" } }),
    );
    expect(await skipName({ context: ctx() })).toEqual({ ok: false });
  });
});
